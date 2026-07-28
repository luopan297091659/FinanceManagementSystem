import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReconciliationRecordMatchStatus } from '@prisma/client';
import { createHash } from 'crypto';
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

@Injectable()
export class ReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  async listBatches() {
    const batches = await this.prisma.reconciliationBatch.findMany({
      include: { sourceFiles: true },
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

  async getBatch(batchId: string) {
    const batch = await this.prisma.reconciliationBatch.findUnique({
      where: { id: batchId },
      include: { sourceFiles: true },
    });
    if (!batch) throw new NotFoundException('Reconciliation batch not found');
    return batch;
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
              propertyId: normalized.propertyId,
              roomId: normalized.roomId,
              contractId: normalized.contractId,
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

  async matchBatch(batchId: string, matchingRules?: string[], actorUserId?: string) {
    const rules = matchingRules?.length ? matchingRules : DEFAULT_MATCHING_RULES;
    await this.prisma.reconciliationBatch.update({
      where: { id: batchId },
      data: { status: 'MATCHING', matchingRulesJson: rules },
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
        after: { matchingRules: rules },
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
    const payerName = dto.payerName || contract.tenant.name;
    const updated = await this.prisma.$transaction(async (tx) => {
      const before = await tx.reconciliationRecord.findUnique({ where: { id: recordId } });
      const after = await tx.reconciliationRecord.update({
        where: { id: recordId },
        data: {
          propertyId: dto.propertyId || contract.room.propertyId,
          roomId: dto.roomId || contract.roomId,
          contractId: contract.id,
          contractorId: dto.contractorId || contract.tenantId,
          contractorName: dto.contractorName || contract.tenant.name,
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
            counterparty: record.payerName ?? record.contract?.tenant.name,
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
              tenantId: tenant.id,
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
    if (!record.normalizedBankSummary || !record.transactionDate || !record.depositAmount) {
      await this.markManualReview(record.id, 'Missing summary, date, or amount', matchingRules);
      return;
    }

    const aliases = await this.prisma.contractPaymentAlias.findMany({
      where: { normalizedBankSummary: record.normalizedBankSummary, isActive: true },
      include: { contract: { include: { room: { include: { property: true } }, tenant: true } } },
    });
    const validAliases = aliases.filter((alias) => this.isContractValid(alias.contract, record.transactionDate));
    if (validAliases.length !== 1) {
      await this.markManualReview(record.id, validAliases.length ? 'Multiple valid contract candidates' : 'No valid contract candidate', matchingRules);
      return;
    }

    const alias = validAliases[0];
    const amountMatches = new Prisma.Decimal(record.depositAmount).equals(alias.contract.monthlyRent);
    const duplicate = await this.prisma.reconciliationRecord.findFirst({
      where: { recordHash: record.recordHash, submittedAt: { not: null }, NOT: { id: record.id } },
    });
    if (!amountMatches || duplicate) {
      await this.markManualReview(record.id, duplicate ? 'Duplicate submitted record' : 'Deposit amount differs from contract rent', matchingRules);
      return;
    }

    await this.prisma.reconciliationRecord.update({
      where: { id: record.id },
      data: {
        propertyId: alias.contract.room.propertyId,
        roomId: alias.contract.roomId,
        contractId: alias.contractId,
        contractorId: alias.contract.tenantId,
        contractorName: alias.contract.tenant.name,
        payerId: alias.contract.tenantId,
        payerName: alias.payerName || alias.contract.tenant.name,
        registeredBankSummaryName: alias.originalBankSummary,
        matchMode: 'AUTO',
        matchScore: 100,
        matchStatus: 'AUTO_MATCHED',
        matchReason: 'Exact alias, amount, and contract-period match',
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
      contractorName: contract.tenant?.name,
      payerId: contract.tenantId,
      payerName: contract.tenant?.name,
      startDate: contract.startDate?.toISOString().slice(0, 10),
      endDate: contract.endDate?.toISOString().slice(0, 10),
      status: contract.status,
      monthlyRent: contract.monthlyRent?.toString(),
    };
  }

  private isContractValid(contract: { startDate: Date; endDate: Date | null }, transactionDate: Date | null) {
    if (!transactionDate) return false;
    const time = transactionDate.getTime();
    return contract.startDate.getTime() <= time && (!contract.endDate || contract.endDate.getTime() >= time);
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
