import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ReconciliationRecordMatchStatus } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../../database/prisma.service';

type BankUploadRow = Record<string, unknown>;

type BankUploadFile = {
  fileName: string;
  fileType?: string;
  fileSize?: number;
  rows: BankUploadRow[];
};

type BankUploadDto = {
  files: BankUploadFile[];
  matchingRules?: string[];
  uploadedBy?: string;
  remark?: string;
};

type ManualMatchDto = {
  propertyId?: string;
  roomId?: string;
  contractId: string;
  contractorId?: string;
  contractorName?: string;
  payerId?: string;
  payerName?: string;
  normalizedBankSummary?: string;
  depositAmount?: string;
  transactionDate?: string;
  paymentMonth?: string;
  remark?: string;
  reason?: string;
};

type UpdateRecordDto = Partial<{
  transactionDate: string;
  depositAmount: string;
  normalizedBankSummary: string;
  contractorId: string;
  contractorName: string;
  payerId: string;
  payerName: string;
  paymentMonth: string;
  remark: string;
}>;

const DEFAULT_MATCHING_RULES = ['normalizedBankSummary', 'depositAmount'];

const RECONCILIATION_FIELD_METADATA = [
  {
    key: 'property', label: '物件テーブル', fields: [
      ['property.id', '物件ID', 'string', false, false],
      ['property.name', '物件名', 'string', true, false],
      ['property.buildingName', '建物名', 'string', true, false],
      ['property.address', '住所', 'string', true, false],
      ['property.ownerId', 'オーナーID', 'string', false, false],
      ['property.managementCompany', '管理会社', 'string', true, false],
      ['room.roomNumber', '部屋番号', 'string', true, false],
    ],
  },
  {
    key: 'contract', label: '契約テーブル', fields: [
      ['contract.id', '契約ID', 'string', false, false],
      ['contract.propertyId', '物件ID', 'string', false, false],
      ['contract.roomId', '部屋ID', 'string', false, false],
      ['contract.contractorName', '契約者', 'string', true, false],
      ['contract.tenantName', '入居者名', 'string', true, false],
      ['contract.bankSummaryName', '銀行摘要名義', 'string', true, false],
      ['contract.monthlyRent', '賃料', 'currency', true, true],
      ['contract.managementFee', '管理費', 'currency', true, true],
      ['contract.deposit', '敷金', 'currency', true, true],
      ['contract.startDate', '契約開始日', 'date', true, false],
      ['contract.endDate', '契約終了日', 'date', true, false],
      ['contract.paymentDueDay', '支払期日', 'number', true, false],
    ],
  },
  {
    key: 'financial', label: '財務テーブル', fields: [
      ['transaction.id', '取引ID', 'string', false, false],
      ['transaction.billingAmount', '請求金額', 'currency', true, true],
      ['transaction.expectedAmount', '入金予定額', 'currency', true, true],
      ['transaction.paidAmount', '入金額', 'currency', true, true],
      ['transaction.paymentDate', '入金日', 'date', true, false],
      ['transaction.paymentMonth', '入金月', 'month', true, false],
      ['transaction.feeType', '費目', 'string', true, false],
      ['transaction.status', '支払状態', 'string', false, false],
      ['transaction.remark', '備考', 'string', true, false],
    ],
  },
].map((source) => ({
  ...source,
  fields: source.fields.map(([key, label, dataType, normalizable, aggregatable]) => ({ key, label, dataType, source: source.key, normalizable, aggregatable })),
}));

@Injectable()
export class ReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // The generated Prisma client is refreshed by the normal backend prebuild step.
  // Keep this narrow bridge so type-checking can still run while a local dev server
  // has the generated client files locked on Windows.
  private get bankStatementScanTaskStore(): any {
    return (this.prisma as any).bankStatementScanTask;
  }

  async uploadBankStatementPdf(file: Express.Multer.File | undefined, actorUserId?: string) {
    if (!file?.buffer?.length) throw new BadRequestException('请选择一个银行账单 PDF 文件');

    const maxBytes = this.config.get<number>('BANK_STATEMENT_PDF_MAX_MB', 25) * 1024 * 1024;
    if (file.size > maxBytes) throw new BadRequestException('PDF 超过系统允许的文件大小');
    if (file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new BadRequestException('上传文件不是有效的 PDF');
    }

    const pdfText = file.buffer.toString('latin1');
    if (!pdfText.slice(-4096).includes('%%EOF')) throw new BadRequestException('PDF 文件不完整或已损坏');
    if (/\/Encrypt\b/.test(pdfText)) throw new BadRequestException('PDF 已加密或受密码保护，暂时无法处理');

    const pageCount = (pdfText.match(/\/Type\s*\/Page\b/g) || []).length || null;
    const maxPages = this.config.get<number>('BANK_STATEMENT_PDF_MAX_PAGES', 100);
    if (pageCount && pageCount > maxPages) throw new BadRequestException('PDF 页数超过系统限制');

    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const duplicate = await this.bankStatementScanTaskStore.findFirst({
      where: {
        checksum,
        ...(actorUserId ? { createdByUserId: actorUserId } : {}),
        status: { notIn: ['FAILED', 'CANCELLED'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (duplicate) {
      throw new ConflictException(`该 PDF 已上传，请继续使用扫描任务 ${duplicate.scanNo}`);
    }

    const storageDirectory = join(process.cwd(), 'uploads', 'bank-statements');
    const storedName = `${randomUUID()}.pdf`;
    const absolutePath = join(storageDirectory, storedName);
    const storageKey = `uploads/bank-statements/${storedName}`;
    await mkdir(storageDirectory, { recursive: true });
    await writeFile(absolutePath, file.buffer, { flag: 'wx' });

    try {
      const scanNo = `BANK-OCR-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const task = await this.bankStatementScanTaskStore.create({
        data: {
          scanNo,
          originalFilename: file.originalname,
          storageKey,
          fileSize: file.size,
          checksum,
          pageCount,
          createdByUserId: actorUserId,
          status: 'READY',
          progress: 10,
          currentStage: 'PDF_VALIDATED',
        },
      });
      await this.prisma.auditLog.create({
        data: {
          actorUserId,
          action: 'reconciliation.bank.pdf.upload',
          entityType: 'BankStatementScanTask',
          entityId: task.id,
          after: { scanNo, originalFilename: file.originalname, fileSize: file.size, pageCount, checksum },
        },
      });
      return this.toPublicScanTask(task);
    } catch (error) {
      await unlink(absolutePath).catch(() => undefined);
      throw error;
    }
  }

  async listBankStatementScans(actorUserId?: string) {
    const tasks = await this.bankStatementScanTaskStore.findMany({
      where: actorUserId ? { createdByUserId: actorUserId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return tasks.map((task: { storageKey: string; checksum: string }) => this.toPublicScanTask(task));
  }

  async getBankStatementScan(id: string, actorUserId?: string) {
    return this.toPublicScanTask(await this.ownedBankStatementScan(id, actorUserId));
  }

  async startBankStatementScan(id: string, actorUserId?: string) {
    const task = await this.ownedBankStatementScan(id, actorUserId);
    if (task.status !== 'READY') throw new BadRequestException('只有已完成 PDF 校验的任务可以开始 AI 扫描');
    const updated = await this.bankStatementScanTaskStore.update({
      where: { id },
      data: { status: 'QUEUED', progress: 15, currentStage: 'WAITING_FOR_PROVIDER_WORKER', startedAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: { actorUserId, action: 'reconciliation.bank.scan.queued', entityType: 'BankStatementScanTask', entityId: id, after: { status: 'QUEUED' } },
    });
    return this.toPublicScanTask(updated);
  }

  private async ownedBankStatementScan(id: string, actorUserId?: string) {
    const task = await this.bankStatementScanTaskStore.findFirst({
      where: { id, ...(actorUserId ? { createdByUserId: actorUserId } : {}) },
    });
    if (!task) throw new NotFoundException('银行账单扫描任务不存在');
    return task;
  }

  private toPublicScanTask<T extends { storageKey: string; checksum: string }>(task: T) {
    const { storageKey: _storageKey, checksum: _checksum, ...publicTask } = task;
    return publicTask;
  }

  async listBatches() {
    const batches = await this.prisma.reconciliationBatch.findMany({
      include: { sourceFiles: true, template: { select: { id: true, name: true, version: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return batches.map((batch) => ({
      ...batch,
      sourceFiles: batch.sourceFiles.map((file) => ({
        id: file.id,
        fileName: file.fileName,
        fileType: file.fileType,
        fileSize: file.fileSize,
        createdAt: file.createdAt,
      })),
    }));
  }

  getFieldMetadata() {
    return RECONCILIATION_FIELD_METADATA;
  }

  async getBatchHeaders(batchId: string) {
    const records = await this.prisma.reconciliationRecord.findMany({
      where: { batchId },
      select: { sourceDataJson: true },
      orderBy: { sourceRow: 'asc' },
      take: 50,
    });
    if (!records.length) return [];
    const rows = records.map((record) => record.sourceDataJson as Record<string, unknown>);
    const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    return keys.map((name) => {
      const values = rows.map((row) => row[name]).filter((value) => value !== '' && value !== null && value !== undefined);
      return {
        name,
        dataType: this.detectColumnType(values),
        examples: values.slice(0, 3).map((value) => this.sanitizeText(value)),
        nonEmptyCount: values.length,
      };
    });
  }

  async saveBatchConfiguration(batchId: string, configuration: unknown, templateId?: string, actorUserId?: string) {
    const config = this.validateConfiguration(configuration);
    if (templateId) await this.ownedTemplate(templateId, actorUserId);
    const batch = await this.prisma.reconciliationBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Reconciliation batch not found');
    if (batch.status === 'COMPLETED') throw new BadRequestException('Finalized batch cannot be reconfigured');
    const updated = await this.prisma.reconciliationBatch.update({
      where: { id: batchId },
      data: {
        matchingRulesJson: config as Prisma.InputJsonValue,
        templateId: templateId || null,
        templateSnapshotJson: templateId ? config as Prisma.InputJsonValue : Prisma.JsonNull,
        status: 'PARSED',
      },
    });
    await this.prisma.auditLog.create({ data: { actorUserId, action: 'reconciliation.bank.configuration.update', entityType: 'ReconciliationBatch', entityId: batchId, before: { configuration: batch.matchingRulesJson }, after: { configuration: config, templateId } } });
    return updated;
  }

  async previewConfiguration(batchId: string, configuration: unknown) {
    const config = this.validateConfiguration(configuration);
    const headers = await this.getBatchHeaders(batchId);
    const available = new Set(headers.map((header) => header.name));
    const missingHeaders = config.groups.flatMap((group: any) => group.rules).flatMap((rule: any) => rule.rightFields).filter((field: string) => !available.has(field));
    return { valid: missingHeaders.length === 0, missingHeaders: [...new Set(missingHeaders)], sampleSize: Math.min(5, headers[0]?.nonEmptyCount ?? 0), groups: config.groups.length };
  }

  async listTemplates(actorUserId?: string) {
    const userId = this.requireActor(actorUserId);
    return this.prisma.reconciliationTemplate.findMany({ where: { createdByUserId: userId, isActive: true, deletedAt: null }, orderBy: { updatedAt: 'desc' } });
  }

  async createTemplate(dto: any, actorUserId?: string) {
    const userId = this.requireActor(actorUserId);
    const name = this.sanitizeText(dto?.name);
    if (!name) throw new BadRequestException('Template name is required');
    const configuration = this.validateConfiguration(dto?.configuration);
    const template = await this.prisma.reconciliationTemplate.create({ data: { name, description: this.sanitizeOptionalText(dto?.description), createdByUserId: userId, configurationJson: configuration as Prisma.InputJsonValue } });
    await this.prisma.auditLog.create({ data: { actorUserId: userId, action: 'reconciliation.template.create', entityType: 'ReconciliationTemplate', entityId: template.id, after: { name, configuration } } });
    return template;
  }

  async updateTemplate(templateId: string, dto: any, actorUserId?: string) {
    const template = await this.ownedTemplate(templateId, actorUserId);
    const configuration = dto?.configuration === undefined ? template.configurationJson : this.validateConfiguration(dto.configuration);
    const updated = await this.prisma.reconciliationTemplate.update({ where: { id: templateId }, data: { name: dto?.name ? this.sanitizeText(dto.name) : undefined, description: dto?.description === undefined ? undefined : this.sanitizeOptionalText(dto.description), configurationJson: configuration as Prisma.InputJsonValue, version: { increment: 1 } } });
    await this.prisma.auditLog.create({ data: { actorUserId, action: 'reconciliation.template.update', entityType: 'ReconciliationTemplate', entityId: templateId, before: { name: template.name, configuration: template.configurationJson }, after: { name: updated.name, configuration: updated.configurationJson, version: updated.version } } });
    return updated;
  }

  async deleteTemplate(templateId: string, actorUserId?: string) {
    await this.ownedTemplate(templateId, actorUserId);
    await this.prisma.reconciliationTemplate.update({ where: { id: templateId }, data: { isActive: false, deletedAt: new Date() } });
    await this.prisma.auditLog.create({ data: { actorUserId, action: 'reconciliation.template.delete', entityType: 'ReconciliationTemplate', entityId: templateId } });
    return { ok: true };
  }

  async duplicateTemplate(templateId: string, requestedName: unknown, actorUserId?: string) {
    const userId = this.requireActor(actorUserId);
    const template = await this.ownedTemplate(templateId, actorUserId);
    const name = this.sanitizeText(requestedName) || `${template.name} copy`;
    return this.prisma.reconciliationTemplate.create({ data: { name, description: template.description, createdByUserId: userId, configurationJson: template.configurationJson as Prisma.InputJsonValue } });
  }

  async getBatch(batchId: string) {
    const batch = await this.prisma.reconciliationBatch.findUnique({
      where: { id: batchId },
      include: { sourceFiles: true },
    });
    if (!batch) throw new NotFoundException('Reconciliation batch not found');
    return batch;
  }

  async deleteBatch(batchId: string, actorUserId?: string) {
    const batch = await this.prisma.reconciliationBatch.findUnique({
      where: { id: batchId },
      include: { sourceFiles: true },
    });
    if (!batch) throw new NotFoundException('Reconciliation batch not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: 'reconciliation.bank.batch.delete',
          entityType: 'ReconciliationBatch',
          entityId: batchId,
          before: {
            batchNo: batch.batchNo,
            status: batch.status,
            totalRecords: batch.totalRecords,
            sourceFiles: batch.sourceFiles.map((file) => file.fileName),
          },
        },
      });
      await tx.reconciliationRecord.deleteMany({ where: { batchId } });
      await tx.reconciliationSourceFile.deleteMany({ where: { batchId } });
      await tx.reconciliationBatch.delete({ where: { id: batchId } });
    });

    return { ok: true };
  }

  async getRecords(batchId: string, status?: ReconciliationRecordMatchStatus) {
    const records = await this.prisma.reconciliationRecord.findMany({
      where: { batchId, matchStatus: status },
      include: {
        sourceFile: true,
        property: true,
        room: true,
        contract: { include: { tenant: true } },
      },
      orderBy: [{ sourceFileId: 'asc' }, { sourceRow: 'asc' }, { createdAt: 'asc' }],
    });
    return records.map((record) => this.toRecordDto(record));
  }

  async uploadBankRows(dto: BankUploadDto, actorUserId?: string) {
    const sanitizedDto = this.sanitizeBankUploadDto(dto);
    if (!sanitizedDto.files?.length) throw new BadRequestException('At least one file is required');
    const emptyFile = sanitizedDto.files.find((file) => !file.rows?.length);
    if (emptyFile) throw new BadRequestException(`File has no rows: ${emptyFile.fileName}`);

    const matchingRules = sanitizedDto.matchingRules?.length ? sanitizedDto.matchingRules : DEFAULT_MATCHING_RULES;
    const batchNo = this.createBatchNo();

    const batch = await this.prisma.$transaction(async (tx) => {
      const createdBatch = await tx.reconciliationBatch.create({
        data: {
          batchNo,
          status: 'UPLOADED',
          matchingRulesJson: matchingRules,
          uploadedBy: actorUserId ?? sanitizedDto.uploadedBy,
          remark: sanitizedDto.remark,
        },
      });

      for (const file of sanitizedDto.files) {
        const fileHash = this.hashJson({ fileName: file.fileName, rows: file.rows });
        const createdFile = await tx.reconciliationSourceFile.create({
          data: {
            batchId: createdBatch.id,
            fileName: file.fileName,
            fileType: file.fileType ?? this.fileType(file.fileName),
            fileSize: file.fileSize,
            fileHash,
            uploadedBy: actorUserId ?? sanitizedDto.uploadedBy,
            rawMetadata: { rowCount: file.rows.length },
          },
        });

        for (const [index, row] of file.rows.entries()) {
          const normalized = this.normalizeRow(row, fileHash, index + 1);
          const relations = await this.resolveExistingRecordRelations(tx, normalized);
          await tx.reconciliationRecord.create({
            data: {
              batchId: createdBatch.id,
              sourceFileId: createdFile.id,
              sourcePage: normalized.sourcePage,
              sourceRow: normalized.sourceRow,
              sourceDataJson: row as Prisma.InputJsonObject,
              transactionDate: normalized.transactionDate,
              depositAmount: normalized.depositAmount,
              originalBankSummary: normalized.originalBankSummary,
              normalizedBankSummary: normalized.normalizedBankSummary,
              propertyId: relations.propertyId,
              roomId: relations.roomId,
              contractId: relations.contractId,
              contractorName: normalized.contractorName,
              payerName: normalized.payerName,
              paymentMonth: normalized.paymentMonth,
              matchStatus: 'UNMATCHED',
              matchingRulesJson: matchingRules,
              remark: normalized.remark,
              recordHash: normalized.recordHash,
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          actorUserId,
          action: 'reconciliation.bank.upload',
          entityType: 'ReconciliationBatch',
          entityId: createdBatch.id,
          after: { batchNo, fileCount: dto.files.length, matchingRules },
        },
      });

      return createdBatch;
    });

    await this.refreshBatchStats(batch.id);
    return this.getBatch(batch.id);
  }

  async parseBatch(batchId: string, actorUserId?: string) {
    await this.updateBatchStatus(batchId, 'PARSED', 'reconciliation.bank.parse', actorUserId);
    return this.getBatch(batchId);
  }

  async matchBatch(batchId: string, matchingRules?: unknown, actorUserId?: string) {
    if (Array.isArray(matchingRules) && !matchingRules.length) throw new BadRequestException('At least one matching condition is required');
    const configuration = Array.isArray(matchingRules)
      ? { groups: [{ id: 'legacy', name: 'Default', priority: 1, logicalOperator: 'AND', enabled: true, rules: matchingRules.map((key) => ({ leftFields: [key], operator: 'equals', rightFields: [key], transformations: [], required: true, weight: 1, enabled: true })) }] }
      : this.validateConfiguration(matchingRules);
    const rules = configuration.groups.flatMap((group: any) => group.rules).map((rule: any) => rule.leftFields[0]).filter(Boolean);
    await this.prisma.reconciliationBatch.update({
      where: { id: batchId },
      data: { status: 'MATCHING', matchingRulesJson: configuration as Prisma.InputJsonValue },
    });

    const records = await this.prisma.reconciliationRecord.findMany({
      where: { batchId, submittedAt: null },
      orderBy: [{ sourceRow: 'asc' }, { createdAt: 'asc' }],
    });

    for (const record of records) {
      await this.matchRecord(record.id, rules);
    }

    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        action: 'reconciliation.bank.match',
        entityType: 'ReconciliationBatch',
        entityId: batchId,
        after: { matchingRules: configuration },
      },
    });
    await this.refreshBatchStats(batchId);
    return this.getBatch(batchId);
  }

  async updateRecord(recordId: string, dto: UpdateRecordDto, actorUserId?: string) {
    const before = await this.prisma.reconciliationRecord.findUnique({ where: { id: recordId } });
    if (!before) throw new NotFoundException('Reconciliation record not found');

    const data: Prisma.ReconciliationRecordUpdateInput = {};
    if (dto.transactionDate !== undefined) data.transactionDate = dto.transactionDate ? new Date(dto.transactionDate) : null;
    if (dto.depositAmount !== undefined) data.depositAmount = dto.depositAmount ? new Prisma.Decimal(dto.depositAmount) : null;
    if (dto.normalizedBankSummary !== undefined) data.normalizedBankSummary = normalizeBankSummary(dto.normalizedBankSummary);
    if (dto.contractorId !== undefined) data.contractorId = dto.contractorId || null;
    if (dto.contractorName !== undefined) data.contractorName = dto.contractorName || null;
    if (dto.payerId !== undefined) data.payerId = dto.payerId || null;
    if (dto.payerName !== undefined) data.payerName = dto.payerName || null;
    if (dto.paymentMonth !== undefined) data.paymentMonth = dto.paymentMonth || null;
    if (dto.remark !== undefined) data.remark = dto.remark || null;

    const after = await this.prisma.reconciliationRecord.update({ where: { id: recordId }, data });
    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        action: 'reconciliation.bank.record.update',
        entityType: 'ReconciliationRecord',
        entityId: recordId,
        before: this.auditRecord(before),
        after: this.auditRecord(after),
      },
    });
    await this.refreshBatchStats(after.batchId);
    return after;
  }

  async manualMatch(recordId: string, dto: ManualMatchDto, actorUserId?: string) {
    const record = await this.prisma.reconciliationRecord.findUnique({ where: { id: recordId } });
    if (!record) throw new NotFoundException('Reconciliation record not found');

    const contract = await this.prisma.contract.findUnique({
      where: { id: dto.contractId },
      include: { room: { include: { property: true } }, tenant: true },
    });
    if (!contract) throw new BadRequestException('Selected contract does not exist');

    const normalizedBankSummary = normalizeBankSummary(dto.normalizedBankSummary ?? record.normalizedBankSummary ?? record.originalBankSummary);
    const contractPartyName = contract.payerName || contract.contractorName || contract.tenant?.name || '';
    const payerName = dto.payerName || contractPartyName;
    const updated = await this.prisma.$transaction(async (tx) => {
      const before = await tx.reconciliationRecord.findUnique({ where: { id: recordId } });
      const after = await tx.reconciliationRecord.update({
        where: { id: recordId },
        data: {
          propertyId: dto.propertyId || contract.room.propertyId,
          roomId: dto.roomId || contract.roomId,
          contractId: contract.id,
          contractorId: dto.contractorId || contract.tenantId,
          contractorName: dto.contractorName || contract.contractorName || contract.tenant?.name,
          payerId: dto.payerId || contract.tenantId,
          payerName,
          normalizedBankSummary,
          depositAmount: dto.depositAmount ? new Prisma.Decimal(dto.depositAmount) : record.depositAmount,
          transactionDate: dto.transactionDate ? new Date(dto.transactionDate) : record.transactionDate,
          paymentMonth: dto.paymentMonth ?? record.paymentMonth,
          matchMode: 'MANUAL',
          matchScore: null,
          matchStatus: 'MANUAL_MATCHED',
          matchReason: dto.reason || 'Manual match confirmed by operator',
          remark: dto.remark ?? record.remark,
        },
      });

      const existingAlias = await tx.contractPaymentAlias.findFirst({
        where: { contractId: contract.id, normalizedBankSummary },
      });
      if (existingAlias) {
        await tx.contractPaymentAlias.update({
          where: { id: existingAlias.id },
          data: {
            payerName,
            originalBankSummary: record.originalBankSummary,
            confirmedCount: { increment: 1 },
            lastConfirmedAt: new Date(),
            isActive: true,
          },
        });
      } else {
        await tx.contractPaymentAlias.create({
          data: {
            contractId: contract.id,
            payerName,
            originalBankSummary: record.originalBankSummary,
            normalizedBankSummary,
            confirmedCount: 1,
            lastConfirmedAt: new Date(),
            createdBy: actorUserId,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId,
          action: 'reconciliation.bank.manual-match',
          entityType: 'ReconciliationRecord',
          entityId: recordId,
          before: before ? this.auditRecord(before) : undefined,
          after: this.auditRecord(after),
        },
      });
      return after;
    });

    await this.refreshBatchStats(updated.batchId);
    return updated;
  }

  async unmatch(recordId: string, actorUserId?: string) {
    const before = await this.prisma.reconciliationRecord.findUnique({ where: { id: recordId } });
    if (!before) throw new NotFoundException('Reconciliation record not found');
    const after = await this.prisma.reconciliationRecord.update({
      where: { id: recordId },
      data: {
        matchMode: 'UNMATCHED',
        matchScore: null,
        matchStatus: 'UNMATCHED',
        matchReason: 'Unmatched by operator',
        contractId: null,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        action: 'reconciliation.bank.unmatch',
        entityType: 'ReconciliationRecord',
        entityId: recordId,
        before: this.auditRecord(before),
        after: this.auditRecord(after),
      },
    });
    await this.refreshBatchStats(after.batchId);
    return after;
  }

  async getCandidates(recordId: string) {
    const record = await this.prisma.reconciliationRecord.findUnique({ where: { id: recordId } });
    if (!record) throw new NotFoundException('Reconciliation record not found');
    if (!record.normalizedBankSummary) return [];
    const aliases = await this.prisma.contractPaymentAlias.findMany({
      where: { normalizedBankSummary: record.normalizedBankSummary, isActive: true },
      include: { contract: { include: { room: { include: { property: true } }, tenant: true } } },
      take: 20,
    });
    return aliases.map((alias) => ({
      contractId: alias.contractId,
      payerName: alias.payerName,
      normalizedBankSummary: alias.normalizedBankSummary,
      score: this.isContractValid(alias.contract, record.transactionDate) ? 90 : 75,
      contract: this.toContractOption(alias.contract),
    }));
  }

  async submitBatch(batchId: string, actorUserId?: string) {
    const records = await this.prisma.reconciliationRecord.findMany({
      where: {
        batchId,
        submittedAt: null,
        matchStatus: { in: ['AUTO_MATCHED', 'MANUAL_MATCHED'] },
      },
      include: { contract: { include: { tenant: true } } },
    });
    if (!records.length) throw new BadRequestException('No matched records to submit');

    await this.prisma.$transaction(async (tx) => {
      for (const record of records) {
        const duplicate = await tx.reconciliationRecord.findFirst({
          where: {
            recordHash: record.recordHash,
            submittedAt: { not: null },
            NOT: { id: record.id },
          },
        });
        if (duplicate) throw new BadRequestException(`Duplicate bank record blocked: ${record.recordHash}`);
        if (!record.contractId || !record.roomId || !record.transactionDate || !record.depositAmount) {
          throw new BadRequestException(`Record ${record.id} is missing required submission fields`);
        }

        const bankTransaction = await tx.bankTransaction.create({
          data: {
            bookedAt: record.transactionDate,
            direction: 'CREDIT',
            amount: record.depositAmount,
            description: record.originalBankSummary,
            rawPayload: record.sourceDataJson as Prisma.InputJsonValue,
            reconciliationStatus: 'MATCHED',
          },
        });
        const transaction = await tx.transaction.create({
          data: {
            type: 'INCOME',
            roomId: record.roomId,
            date: record.transactionDate,
            counterparty: record.payerName ?? record.contract?.payerName ?? record.contract?.contractorName ?? record.contract?.tenant?.name,
            counterpartyRaw: record.originalBankSummary,
            contentSummary: record.normalizedBankSummary,
            fileAmount: record.depositAmount,
            statisticalAmount: record.depositAmount,
            totalAmount: record.depositAmount,
            note: record.remark,
            processingStatus: 'INCLUDED',
            confirmationStatus: 'CONFIRMED',
          },
        });
        await tx.reconciliationMatch.create({
          data: {
            bankTransactionId: bankTransaction.id,
            transactionId: transaction.id,
            confidence: new Prisma.Decimal(record.matchMode === 'AUTO' ? '1' : '0.8'),
            reason: record.matchReason,
            confirmedBy: actorUserId,
            confirmedAt: new Date(),
          },
        });
        await tx.reconciliationRecord.update({
          where: { id: record.id },
          data: {
            bankTransactionId: bankTransaction.id,
            targetTable: 'Transaction',
            targetRecordId: transaction.id,
            matchStatus: 'SUBMITTED',
            submittedAt: new Date(),
            submittedBy: actorUserId,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId,
          action: 'reconciliation.bank.submit',
          entityType: 'ReconciliationBatch',
          entityId: batchId,
          after: { submittedCount: records.length },
        },
      });
    });

    await this.refreshBatchStats(batchId);
    return this.getBatch(batchId);
  }

  async exportUnmatchedJson(batchId: string) {
    return this.getRecords(batchId, 'UNMATCHED');
  }

  async optionsProperties(search?: string) {
    return this.prisma.property.findMany({
      where: search ? { name: { contains: search, mode: 'insensitive' } } : undefined,
      orderBy: { name: 'asc' },
      take: 50,
    });
  }

  async optionsRooms(propertyId?: string, search?: string) {
    return this.prisma.room.findMany({
      where: {
        propertyId: propertyId || undefined,
        roomNumber: search ? { contains: search, mode: 'insensitive' } : undefined,
      },
      include: { property: true },
      orderBy: [{ propertyId: 'asc' }, { roomNumber: 'asc' }],
      take: 100,
    });
  }

  async optionsContracts(roomId?: string, transactionDate?: string) {
    const contracts = await this.prisma.contract.findMany({
      where: { roomId: roomId || undefined },
      include: { tenant: true, room: { include: { property: true } } },
      orderBy: [{ startDate: 'desc' }],
      take: 100,
    });
    const date = transactionDate ? new Date(transactionDate) : null;
    return contracts
      .map((contract) => ({ ...this.toContractOption(contract), validOnTransactionDate: date ? this.isContractValid(contract, date) : false }))
      .sort((a, b) => Number(b.validOnTransactionDate) - Number(a.validOnTransactionDate));
  }

  async masterDataSync(rows: BankUploadRow[], actorUserId?: string) {
    if (!rows.length) throw new BadRequestException('No master-data rows provided');
    const result = {
      propertiesCreated: 0,
      propertiesUpdated: 0,
      roomsCreated: 0,
      roomsUpdated: 0,
      contractsCreated: 0,
      contractsUpdated: 0,
      paymentAliasesCreated: 0,
      skipped: 0,
      errors: 0,
    };

    for (const row of rows) {
      try {
        const propertyName = this.pick(row, ['propertyName', 'Property Name', '物件名', '项目', '楼栋']);
        const roomNumber = this.pick(row, ['roomNumber', 'Room Number', '部屋番号', '房间号']);
        const contractorName = this.pick(row, ['contractorName', 'Contractor', '契约者', '契約者名']);
        const payerName = this.pick(row, ['payerName', 'Payer', '支付人', '入金人名']) || contractorName;
        const aliasName = this.pick(row, ['bankSummaryName', 'Bank Payment Alias', '银行支付名义', '銀行摘要名義', '振込名義']);
        if (!propertyName || !roomNumber || !contractorName) {
          result.skipped += 1;
          continue;
        }
        await this.prisma.$transaction(async (tx) => {
          let property = await tx.property.findFirst({
            where: { name: propertyName, address: this.pick(row, ['address', 'Address', '地址']) || undefined },
          });
          if (!property) {
            property = await tx.property.create({
              data: { name: propertyName, address: this.pick(row, ['address', 'Address', '地址']) || undefined },
            });
            result.propertiesCreated += 1;
          }

          const room = await tx.room.upsert({
            where: { propertyId_roomNumber: { propertyId: property.id, roomNumber } },
            create: { propertyId: property.id, roomNumber, status: 'OCCUPIED' },
            update: {},
          });
          result.roomsCreated += 1;

          const tenant = await tx.tenant.create({
            data: { name: contractorName, note: 'Created by bank reconciliation master-data sync' },
          });
          const contract = await tx.contract.create({
            data: {
              id: this.pick(row, ['contractId', 'Contract ID', '契约书ID']) || undefined,
              roomId: room.id,
              propertyId: property.id,
              tenantId: tenant.id,
              contractorName,
              payerName,
              contractNumber: this.pick(row, ['contractNo', 'Contract No', '契约编号']),
              startDate: this.parseDate(this.pick(row, ['contractStartDate', 'Contract Start Date', '契約開始日'])) ?? new Date(),
              endDate: this.parseDate(this.pick(row, ['contractEndDate', 'Contract End Date', '契約満了日'])),
              monthlyRent: new Prisma.Decimal(this.pick(row, ['monthlyRent', 'Monthly Rent', '月租金']) || '0'),
              status: 'ACTIVE',
            },
          });
          result.contractsCreated += 1;

          if (aliasName) {
            await tx.contractPaymentAlias.create({
              data: {
                contractId: contract.id,
                payerName,
                originalBankSummary: aliasName,
                normalizedBankSummary: normalizeBankSummary(aliasName),
                confirmedCount: 1,
                lastConfirmedAt: new Date(),
                createdBy: actorUserId,
              },
            });
            result.paymentAliasesCreated += 1;
          }
        });
      } catch (error) {
        result.errors += 1;
      }
    }

    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        action: 'reconciliation.bank.master-data.sync',
        entityType: 'ContractPaymentAlias',
        after: result,
      },
    });
    return result;
  }

  private async matchRecord(recordId: string, matchingRules: string[]) {
    const record = await this.prisma.reconciliationRecord.findUnique({ where: { id: recordId } });
    if (!record) return;
    const useSummary = matchingRules.some((key) => /(summary|description|contractor|tenant|payer|party|name)/i.test(key));
    const useAmount = matchingRules.some((key) => /(amount|rent|fee|deposit|paid)/i.test(key));
    const useDate = matchingRules.some((key) => /(date|month|start|end)/i.test(key));
    const missing = [useSummary && !record.normalizedBankSummary ? 'summary' : '', useAmount && !record.depositAmount ? 'amount' : '', useDate && !record.transactionDate ? 'date' : ''].filter(Boolean);
    if (missing.length) {
      await this.markManualReview(record.id, `Missing configured field: ${missing.join(', ')}`, matchingRules);
      return;
    }

    const aliases = await this.prisma.contractPaymentAlias.findMany({
      where: { isActive: true },
      include: { contract: { include: { room: { include: { property: true } }, tenant: true } } },
    });
    const validAliases = useSummary ? aliases.filter(
      (alias) =>
        (!useDate || this.isContractValid(alias.contract, record.transactionDate)) &&
        this.summaryMatchesAnyContractParty(record.normalizedBankSummary, [alias.normalizedBankSummary, alias.originalBankSummary, alias.payerName, alias.contract.bankSummaryName, alias.contract.payerName, alias.contract.contractorName, alias.contract.tenant?.name]),
    ) : [];

    const validCandidates = validAliases.length
      ? validAliases
      : (await this.prisma.contract.findMany({
          where: { status: 'ACTIVE' },
          include: { room: { include: { property: true } }, tenant: true },
        }))
          .filter(
            (contract) =>
              (!useDate || this.isContractValid(contract, record.transactionDate)) &&
              (!useSummary || this.summaryMatchesAnyContractParty(record.normalizedBankSummary, [contract.bankSummaryName, contract.payerName, contract.contractorName, contract.tenant?.name])) &&
              (!useAmount || (contract.monthlyRent != null && record.depositAmount != null && new Prisma.Decimal(record.depositAmount).equals(contract.monthlyRent))),
          )
          .map((contract) => ({
            contractId: contract.id,
            originalBankSummary: record.originalBankSummary,
            normalizedBankSummary: record.normalizedBankSummary,
            payerName: contract.payerName || contract.contractorName || contract.tenant?.name,
            contract,
          }));

    if (validCandidates.length !== 1) {
      await this.markManualReview(record.id, validCandidates.length ? 'Multiple valid contract candidates' : 'No valid contract candidate', matchingRules);
      return;
    }

    const candidate = validCandidates[0];
    const amountMatches = candidate.contract.monthlyRent != null && record.depositAmount != null && new Prisma.Decimal(record.depositAmount).equals(candidate.contract.monthlyRent);
    const duplicate = await this.prisma.reconciliationRecord.findFirst({
      where: { recordHash: record.recordHash, submittedAt: { not: null }, NOT: { id: record.id } },
    });
    if ((useAmount && !amountMatches) || duplicate) {
      await this.markManualReview(record.id, duplicate ? 'Duplicate submitted record' : 'Deposit amount differs from contract rent', matchingRules);
      return;
    }

    await this.prisma.reconciliationRecord.update({
      where: { id: record.id },
      data: {
        propertyId: candidate.contract.room.propertyId,
        roomId: candidate.contract.roomId,
        contractId: candidate.contractId,
        contractorId: candidate.contract.tenantId,
        contractorName: candidate.contract.contractorName || candidate.contract.tenant?.name,
        payerId: candidate.contract.tenantId,
        payerName: candidate.payerName || candidate.contract.payerName || candidate.contract.contractorName || candidate.contract.tenant?.name,
        registeredBankSummaryName: candidate.originalBankSummary,
        matchMode: 'AUTO',
        matchScore: 100,
        matchStatus: 'AUTO_MATCHED',
        matchReason: 'Contractor or contract payer, amount, and contract-period match',
        matchingRulesJson: matchingRules,
      },
    });
  }

  private async markManualReview(recordId: string, reason: string, matchingRules: string[]) {
    await this.prisma.reconciliationRecord.update({
      where: { id: recordId },
      data: {
        matchMode: 'UNMATCHED',
        matchScore: null,
        matchStatus: 'MANUAL_REVIEW',
        matchReason: reason,
        matchingRulesJson: matchingRules,
      },
    });
  }

  private async updateBatchStatus(batchId: string, status: Prisma.EnumReconciliationBatchStatusFieldUpdateOperationsInput['set'], action: string, actorUserId?: string) {
    await this.prisma.reconciliationBatch.update({ where: { id: batchId }, data: { status } });
    await this.prisma.auditLog.create({
      data: { actorUserId, action, entityType: 'ReconciliationBatch', entityId: batchId, after: { status } },
    });
  }

  private async refreshBatchStats(batchId: string) {
    const records = await this.prisma.reconciliationRecord.findMany({ where: { batchId }, select: { matchStatus: true, matchMode: true } });
    const totalRecords = records.length;
    const autoMatchedCount = records.filter((record) => record.matchStatus === 'AUTO_MATCHED').length;
    const manualMatchedCount = records.filter((record) => record.matchStatus === 'MANUAL_MATCHED').length;
    const submittedCount = records.filter((record) => record.matchStatus === 'SUBMITTED').length;
    const failedCount = records.filter((record) => record.matchStatus === 'FAILED').length;
    const unmatchedCount = records.filter((record) => record.matchStatus === 'UNMATCHED' || record.matchStatus === 'MANUAL_REVIEW').length;
    const status = failedCount && submittedCount ? 'PARTIAL_COMPLETED' : submittedCount === totalRecords && totalRecords ? 'COMPLETED' : unmatchedCount ? 'MANUAL_REVIEW' : 'PARSED';
    await this.prisma.reconciliationBatch.update({
      where: { id: batchId },
      data: { totalRecords, autoMatchedCount, manualMatchedCount, unmatchedCount, submittedCount, failedCount, status },
    });
  }

  private normalizeRow(row: BankUploadRow, fileHash: string, rowNumber: number) {
    const originalBankSummary = this.pick(row, [
      'originalBankSummary',
      'summary',
      'Summary',
      '摘要',
      '银行摘要',
      '銀行摘要名義',
      '振込人名',
      '振込名義',
      'ご依頼人名',
    ]);
    const normalizedBankSummary = normalizeBankSummary(this.pick(row, ['normalizedBankSummary']) || originalBankSummary);
    const transactionDate = this.parseDate(this.pick(row, ['transactionDate', 'date', 'Deposit Date', '取引日', '入金日', '日期']));
    const depositAmount = this.parseAmount(this.pick(row, ['depositAmount', 'amount', 'Bank Deposit Amount', '入金額', '銀行入金額', '入金金额', '金额']));
    const sourcePage = Number(this.pick(row, ['sourcePage', 'page', '原始页码'])) || null;
    const sourceRow = Number(this.pick(row, ['sourceRow', 'row', '原始行号'])) || rowNumber;
    const recordHash = this.hashJson({
      fileHash,
      sourcePage,
      sourceRow,
      transactionDate: transactionDate?.toISOString().slice(0, 10),
      depositAmount: depositAmount?.toString(),
      originalBankSummary,
    });
    return {
      sourcePage,
      sourceRow,
      transactionDate,
      depositAmount,
      originalBankSummary,
      normalizedBankSummary,
      propertyId: this.pick(row, ['propertyId']),
      roomId: this.pick(row, ['roomId']),
      contractId: this.pick(row, ['contractId', 'Contract ID', '契约书ID']),
      contractorName: this.pick(row, ['contractorName', 'Contractor', '契约者', '契約者名']),
      payerName: this.pick(row, ['payerName', 'Payer', '支付人', '入金人名']),
      paymentMonth: this.pick(row, ['paymentMonth', 'month', '月份']),
      remark: this.pick(row, ['remark', 'Remark', '备注']),
      recordHash,
    };
  }

  private async resolveExistingRecordRelations(tx: Prisma.TransactionClient, normalized: { propertyId?: string; roomId?: string; contractId?: string }) {
    const [property, room, contract] = await Promise.all([
      normalized.propertyId ? tx.property.findUnique({ where: { id: normalized.propertyId }, select: { id: true } }) : null,
      normalized.roomId ? tx.room.findUnique({ where: { id: normalized.roomId }, select: { id: true } }) : null,
      normalized.contractId ? tx.contract.findUnique({ where: { id: normalized.contractId }, select: { id: true } }) : null,
    ]);
    return {
      propertyId: property?.id,
      roomId: room?.id,
      contractId: contract?.id,
    };
  }

  private toRecordDto(record: any) {
    return {
      id: record.id,
      batchId: record.batchId,
      sourceFileId: record.sourceFileId,
      sourceFileName: record.sourceFile?.fileName,
      sourcePage: record.sourcePage,
      sourceRow: record.sourceRow,
      transactionDate: record.transactionDate?.toISOString().slice(0, 10),
      depositAmount: record.depositAmount?.toString(),
      originalBankSummary: record.originalBankSummary,
      normalizedBankSummary: record.normalizedBankSummary,
      registeredBankSummaryName: record.registeredBankSummaryName,
      propertyId: record.propertyId,
      propertyName: record.property?.name,
      roomId: record.roomId,
      roomNumber: record.room?.roomNumber,
      contractId: record.contractId,
      contractNo: record.contract?.contractNumber,
      contractorId: record.contractorId,
      contractorName: record.contractorName,
      payerId: record.payerId,
      payerName: record.payerName,
      paymentMonth: record.paymentMonth,
      matchMode: record.matchMode,
      matchScore: record.matchScore,
      matchStatus: record.matchStatus,
      matchReason: record.matchReason,
      targetRecordId: record.targetRecordId,
      bankTransactionId: record.bankTransactionId,
      feeType: record.feeType,
      remark: record.remark,
      recordHash: record.recordHash,
      submittedAt: record.submittedAt,
    };
  }

  private toContractOption(contract: any) {
    return {
      id: contract.id,
      contractNo: contract.contractNumber,
      roomId: contract.roomId,
      roomNumber: contract.room?.roomNumber,
      propertyId: contract.room?.propertyId,
      propertyName: contract.room?.property?.name,
      contractorId: contract.tenantId,
      contractorName: contract.contractorName || contract.tenant?.name,
      payerId: contract.tenantId,
      payerName: contract.payerName || contract.contractorName || contract.tenant?.name,
      startDate: contract.startDate?.toISOString().slice(0, 10),
      endDate: contract.endDate?.toISOString().slice(0, 10),
      status: contract.status,
      monthlyRent: contract.monthlyRent?.toString(),
    };
  }

  private isContractValid(contract: { startDate: Date | null; endDate: Date | null }, transactionDate: Date | null) {
    if (!transactionDate || !contract.startDate) return false;
    const time = transactionDate.getTime();
    return contract.startDate.getTime() <= time && (!contract.endDate || contract.endDate.getTime() >= time);
  }

  private summaryMatchesAnyContractParty(summary: string | null | undefined, names: Array<string | null | undefined>) {
    const normalizedSummary = normalizeBankSummary(summary);
    if (!normalizedSummary) return false;
    return names.some((name) => {
      const normalizedName = normalizeBankSummary(name);
      return normalizedName && (normalizedSummary === normalizedName || normalizedSummary.includes(normalizedName) || normalizedName.includes(normalizedSummary));
    });
  }

  private pick(row: BankUploadRow, keys: string[]) {
    for (const key of keys) {
      const value = row[key];
      const cleaned = this.sanitizeText(value);
      if (cleaned !== '') return cleaned;
    }
    return '';
  }

  private sanitizeBankUploadDto(dto: BankUploadDto): BankUploadDto {
    return {
      ...dto,
      uploadedBy: this.sanitizeOptionalText(dto.uploadedBy),
      remark: this.sanitizeOptionalText(dto.remark),
      matchingRules: dto.matchingRules?.map((rule) => this.sanitizeText(rule)).filter(Boolean),
      files: (dto.files ?? []).map((file) => ({
        ...file,
        fileName: this.sanitizeText(file.fileName),
        fileType: this.sanitizeOptionalText(file.fileType),
        rows: (file.rows ?? []).map((row) => this.sanitizeJson(row) as BankUploadRow),
      })),
    };
  }

  private sanitizeJson(value: unknown): unknown {
    if (typeof value === 'string') return this.sanitizeText(value);
    if (Array.isArray(value)) return value.map((item) => this.sanitizeJson(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [this.sanitizeText(key), this.sanitizeJson(item)]),
      );
    }
    return value;
  }

  private sanitizeOptionalText(value?: unknown) {
    const cleaned = this.sanitizeText(value);
    return cleaned || undefined;
  }

  private sanitizeText(value?: unknown) {
    if (value === undefined || value === null) return '';
    return String(value).replace(/\u0000/g, '').trim();
  }

  private requireActor(actorUserId?: string) {
    if (!actorUserId) throw new BadRequestException('Authenticated user is required');
    return actorUserId;
  }

  private async ownedTemplate(templateId: string, actorUserId?: string) {
    const userId = this.requireActor(actorUserId);
    const template = await this.prisma.reconciliationTemplate.findFirst({ where: { id: templateId, createdByUserId: userId, isActive: true, deletedAt: null } });
    if (!template) throw new NotFoundException('Reconciliation template not found');
    return template;
  }

  private validateConfiguration(value: unknown): { groups: any[] } {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('At least one matching condition is required');
    const rawGroups = (value as any).groups;
    if (!Array.isArray(rawGroups)) throw new BadRequestException('At least one rule group is required');
    const groups = rawGroups
      .filter((group) => group?.enabled !== false)
      .map((group, groupIndex) => ({
        id: this.sanitizeText(group.id) || `group-${groupIndex + 1}`,
        name: this.sanitizeText(group.name) || `Rule Group ${groupIndex + 1}`,
        priority: Number(group.priority) || groupIndex + 1,
        logicalOperator: group.logicalOperator === 'OR' ? 'OR' : 'AND',
        minimumScore: Math.max(0, Math.min(100, Number(group.minimumScore) || 0)),
        enabled: true,
        rules: (Array.isArray(group.rules) ? group.rules : []).filter((rule: any) => rule?.enabled !== false).map((rule: any, ruleIndex: number) => {
          const leftFields = (Array.isArray(rule.leftFields) ? rule.leftFields : [rule.leftField])
            .map((item: unknown) => this.sanitizeText(item))
            .map((key: string) => key === 'contract.bankTransferDescription' ? 'contract.bankSummaryName' : key)
            .filter(Boolean);
          const rightFields = (Array.isArray(rule.rightFields) ? rule.rightFields : [rule.rightField]).map((item: unknown) => this.sanitizeText(item)).filter(Boolean);
          if (!leftFields.length || !rightFields.length) throw new BadRequestException(`Rule ${ruleIndex + 1} requires internal and Excel fields`);
          return {
            id: this.sanitizeText(rule.id) || `rule-${groupIndex + 1}-${ruleIndex + 1}`,
            leftFields,
            operator: this.sanitizeText(rule.operator) || 'equals',
            rightFields,
            transformations: Array.isArray(rule.transformations) ? rule.transformations.map((item: unknown) => this.sanitizeText(item)).filter(Boolean) : [],
            weight: Math.max(0, Math.min(100, Number(rule.weight) || 0)),
            required: rule.required !== false,
            enabled: true,
          };
        }),
      }))
      .filter((group) => group.rules.length);
    if (!groups.length) throw new BadRequestException('At least one enabled matching condition is required');
    return { groups };
  }

  private detectColumnType(values: unknown[]) {
    if (!values.length) return 'unknown';
    const texts = values.map((value) => this.sanitizeText(value));
    const numeric = texts.filter((value) => /^[-+]?[$¥￥]?\s*\d[\d,]*(\.\d+)?$/.test(value)).length;
    const dates = texts.filter((value) => /^\d{4}[\/-]\d{1,2}([\/-]\d{1,2})?$/.test(value)).length;
    if (dates / texts.length >= 0.8) return texts.every((value) => /^\d{4}[\/-]\d{1,2}$/.test(value)) ? 'month' : 'date';
    if (numeric / texts.length >= 0.8) return texts.some((value) => /[$¥￥,]/.test(value)) ? 'currency' : 'number';
    if (texts.every((value) => /^(true|false|yes|no|0|1)$/i.test(value))) return 'boolean';
    return 'string';
  }

  private parseAmount(value?: string) {
    if (!value) return null;
    const normalized = value.replace(/[,\s円￥¥]/g, '').replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
    if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
    return new Prisma.Decimal(normalized);
  }

  private parseDate(value?: string) {
    if (!value) return null;
    const normalized = value
      .replace(/[年月.]/g, '-')
      .replace(/[日]/g, '')
      .replace(/\//g, '-')
      .trim();
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private fileType(fileName: string) {
    return fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : undefined;
  }

  private createBatchNo() {
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    return `REC-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  private hashJson(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private auditRecord(record: unknown) {
    return JSON.parse(JSON.stringify(record));
  }
}

export function normalizeBankSummary(value?: string | null) {
  if (!value) return '';
  return value
    .replace(/\r?\n/g, ' ')
    .replace(/\u3000/g, ' ')
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[（）]/g, (char) => (char === '（' ? '(' : ')'))
    .replace(/（株）|\(株\)|カ\)|ｶ\)/gi, '株式会社')
    .replace(/[・,，、。]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}
