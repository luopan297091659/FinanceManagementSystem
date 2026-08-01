import { BadGatewayException, BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ReconciliationRecordMatchStatus } from '@prisma/client';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { join, relative, resolve } from 'path';
import * as XLSX from 'xlsx';
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

type ExtractedBankStatementRow = {
  sourcePageNumber: number | null;
  sourceRowNumber: number;
  transactionDate: string | null;
  withdrawalAmount: number | null;
  depositAmount: number | null;
  transactionType: string | null;
  bankDescription: string | null;
  remarks: string | null;
  confidence: number;
};

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
export class ReconciliationService implements OnModuleInit {
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

  private get bankStatementAiProviderStore(): any {
    return (this.prisma as any).bankStatementAiProvider;
  }

  async onModuleInit() {
    try {
      const pending = await this.bankStatementScanTaskStore.findMany({
        where: { status: { in: ['QUEUED', 'OCR_RUNNING', 'GENERATING_EXCEL'] } },
        orderBy: { createdAt: 'asc' },
        take: 10,
      });
      pending.forEach((task: { id: string }) => setImmediate(() => void this.processBankStatementScan(task.id).catch(() => undefined)));
    } catch {
      // Database migrations may still be pending during the first application startup.
    }
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
    const provider = await this.bankStatementAiProviderStore.findFirst({
      where: { enabled: true, supportsPdfInput: true, supportsJapanese: true },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
    if (!provider) throw new BadRequestException('请先配置并启用支持 PDF、日文和结构化输出的 AI 模型');
    const updated = await this.bankStatementScanTaskStore.update({
      where: { id },
      data: {
        status: 'QUEUED',
        progress: 15,
        currentStage: 'QUEUED',
        startedAt: new Date(),
        providerProfileId: provider.id,
        providerType: provider.providerType,
        providerModel: provider.modelName,
        providerSnapshot: this.providerSnapshot(provider),
      },
    });
    await this.prisma.auditLog.create({
      data: { actorUserId, action: 'reconciliation.bank.scan.queued', entityType: 'BankStatementScanTask', entityId: id, after: { status: 'QUEUED' } },
    });
    setImmediate(() => void this.processBankStatementScan(id).catch(() => undefined));
    return this.toPublicScanTask(updated);
  }

  async listBankStatementAiProviders() {
    const providers = await this.bankStatementAiProviderStore.findMany({ orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }] });
    return providers.map((provider: any) => this.toPublicProvider(provider));
  }

  async saveBankStatementAiProvider(dto: any, actorUserId?: string, providerId?: string) {
    const displayName = this.sanitizeText(dto?.displayName);
    const providerType = this.sanitizeText(dto?.providerType);
    const transport = providerType === 'DEEPSEEK'
      ? 'OPENAI_CHAT_COMPLETIONS'
      : (this.sanitizeText(dto?.transport) || 'OPENAI_RESPONSES');
    const baseUrl = this.validateProviderUrl(dto?.baseUrl);
    let apiPath = this.sanitizeText(dto?.apiPath) || '/v1/responses';
    if (providerType === 'QWEN' && /^\/compatible-mode\/v1\/?$/i.test(apiPath)) {
      apiPath = '/compatible-mode/v1/responses';
    }
    if (providerType === 'DEEPSEEK') apiPath = '/chat/completions';
    const modelName = this.sanitizeText(dto?.modelName);
    if (!displayName || !providerType || !modelName) throw new BadRequestException('模型名称、Provider 类型和模型 ID 为必填项');
    if (!['OPENAI_RESPONSES', 'OPENAI_CHAT_COMPLETIONS'].includes(transport)) {
      throw new BadRequestException('当前仅支持 Responses 或 Chat Completions 传输协议');
    }

    const existing = providerId ? await this.bankStatementAiProviderStore.findUnique({ where: { id: providerId } }) : null;
    if (providerId && !existing) throw new NotFoundException('AI 模型配置不存在');
    const apiKey = typeof dto?.apiKey === 'string' ? dto.apiKey.trim() : '';
    const isDefault = dto?.isDefault === true;
    if (isDefault) await this.bankStatementAiProviderStore.updateMany({ where: { isDefault: true }, data: { isDefault: false } });

    const data: any = {
      displayName,
      providerType,
      transport,
      baseUrl,
      apiPath,
      modelName,
      supportsPdfInput: providerType !== 'DEEPSEEK' && (dto?.supportsPdfInput === true || (dto?.supportsPdfInput === undefined && providerType === 'OPENAI')),
      supportsStructuredJson: dto?.supportsStructuredJson === true || (dto?.supportsStructuredJson === undefined && ['OPENAI', 'DEEPSEEK'].includes(providerType)),
      supportsJapanese: dto?.supportsJapanese === true || (dto?.supportsJapanese === undefined && providerType === 'OPENAI'),
      enabled: dto?.enabled !== false,
      isDefault,
      timeoutMs: this.clampInteger(dto?.timeoutMs, 10000, 600000, 120000),
      maxRetries: this.clampInteger(dto?.maxRetries, 0, 5, 2),
    };
    if (apiKey) {
      data.encryptedApiKey = this.encryptProviderSecret(apiKey);
      data.apiKeyLastFour = apiKey.slice(-4);
    } else if (!existing?.encryptedApiKey) {
      throw new BadRequestException('首次创建模型配置时必须填写 API Key');
    }

    const provider = providerId
      ? await this.bankStatementAiProviderStore.update({ where: { id: providerId }, data })
      : await this.bankStatementAiProviderStore.create({ data: { ...data, createdByUserId: actorUserId } });
    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        action: providerId ? 'reconciliation.bank.ai-provider.update' : 'reconciliation.bank.ai-provider.create',
        entityType: 'BankStatementAiProvider',
        entityId: provider.id,
        after: this.toPublicProvider(provider),
      },
    });
    return this.toPublicProvider(provider);
  }

  async testBankStatementAiProvider(providerId: string) {
    const provider = await this.bankStatementAiProviderStore.findUnique({ where: { id: providerId } });
    if (!provider) throw new NotFoundException('AI 模型配置不存在');
    const startedAt = Date.now();
    try {
      const response = await this.callResponsesProvider(provider, null, 'Return exactly: OK', false);
      return { ok: true, latencyMs: Date.now() - startedAt, model: provider.modelName, response: response.slice(0, 80) };
    } catch (error) {
      const detail = error instanceof Error ? error.message : '未知的上游服务错误';
      throw new BadGatewayException(`AI 模型连接测试失败：${detail}`);
    }
  }

  async deleteBankStatementAiProvider(providerId: string, actorUserId?: string) {
    const provider = await this.bankStatementAiProviderStore.findUnique({ where: { id: providerId } });
    if (!provider) throw new NotFoundException('AI 模型配置不存在');
    const inUse = await this.bankStatementScanTaskStore.count({ where: { providerProfileId: providerId } });
    if (inUse) {
      await this.bankStatementAiProviderStore.update({ where: { id: providerId }, data: { enabled: false, isDefault: false } });
    } else {
      await this.bankStatementAiProviderStore.delete({ where: { id: providerId } });
    }
    await this.prisma.auditLog.create({ data: { actorUserId, action: 'reconciliation.bank.ai-provider.delete', entityType: 'BankStatementAiProvider', entityId: providerId } });
    return { ok: true, disabled: Boolean(inUse) };
  }

  private async processBankStatementScan(scanId: string) {
    try {
      const task = await this.bankStatementScanTaskStore.findUnique({ where: { id: scanId } });
      if (!task || task.status === 'CANCELLED') return;
      let provider = await this.bankStatementAiProviderStore.findUnique({ where: { id: task.providerProfileId } });
      if (!provider?.enabled) throw new Error('配置的 AI Provider 不可用');
      if (provider.providerType === 'QWEN' && task.pageCount && task.pageCount > 50) {
        throw new Error('Qwen3.5-OCR 单个 PDF 最多支持 50 页，请拆分后重新上传');
      }

      await this.bankStatementScanTaskStore.update({
        where: { id: scanId },
        data: { status: 'OCR_RUNNING', progress: 30, currentStage: 'AI_PDF_EXTRACTION' },
      });
      const sourcePath = this.resolvePrivateStoragePath(task.storageKey);
      const pdf = await readFile(sourcePath);
      const prompt = [
        'Analyze this Japanese bank transaction statement PDF.',
        'Extract only transaction rows. Ignore titles, account metadata, repeated headers, footers, page numbers, and report timestamps.',
        'Preserve source order and Japanese text. Never invent missing values; use null.',
        'Keep withdrawal and deposit amounts separate. Amounts must be numbers without currency symbols or commas.',
        'Dates must be YYYY-MM-DD when confidently known, otherwise null.',
        'Return only one valid JSON object with a rows array. Each row must contain sourcePageNumber, sourceRowNumber, transactionDate, withdrawalAmount, depositAmount, transactionType, bankDescription, remarks, and confidence.',
      ].join(' ');
      let signedFileUrl = provider.providerType === 'QWEN' ? this.createSignedScanSourceUrl(task.id) : undefined;
      let outputText: string;
      try {
        outputText = await this.callResponsesProvider(provider, pdf, prompt, true, task.originalFilename, signedFileUrl);
      } catch (error) {
        if (!this.isProviderDataInspectionFailure(error)) throw error;
        const fallbackProvider = await this.findBankStatementFallbackProvider(provider.id);
        if (!fallbackProvider) {
          throw new Error('Qwen 内容安全检查拒绝了该 PDF。请确认文件内容合规；如属误判，请在阿里云提交工单，或配置一个支持 PDF 的非 Qwen 模型作为回退后重新扫描');
        }
        provider = fallbackProvider;
        signedFileUrl = provider.providerType === 'QWEN' ? this.createSignedScanSourceUrl(task.id) : undefined;
        await this.bankStatementScanTaskStore.update({
          where: { id: scanId },
          data: {
            currentStage: 'AI_PROVIDER_FALLBACK',
            providerProfileId: provider.id,
            providerType: provider.providerType,
            providerModel: provider.modelName,
            providerSnapshot: this.providerSnapshot(provider),
          },
        });
        outputText = await this.callResponsesProvider(provider, pdf, prompt, true, task.originalFilename, signedFileUrl);
      }
      const rows = this.validateExtractedRows(this.parseProviderJson(outputText));
      if (!rows.length) throw new Error('AI Provider 未返回任何银行交易记录');

      await this.bankStatementScanTaskStore.update({
        where: { id: scanId },
        data: { status: 'GENERATING_EXCEL', progress: 75, currentStage: 'GENERATING_LOCAL_EXCEL', extractedRowCount: rows.length },
      });
      const generated = await this.generateBankStatementWorkbook(task, provider, rows);
      const batchRows = rows.map((row) => ({
        sourcePage: row.sourcePageNumber,
        sourceRow: row.sourceRowNumber,
        transactionDate: row.transactionDate,
        withdrawalAmount: row.withdrawalAmount,
        depositAmount: row.depositAmount,
        transactionType: row.transactionType,
        summary: row.bankDescription,
        normalizedBankSummary: row.bankDescription,
        remarks: row.remarks,
        ocrConfidence: row.confidence,
      }));
      const batch = await this.uploadBankRows({
        files: [{ fileName: generated.filename, fileType: 'xlsx', fileSize: generated.fileSize, rows: batchRows }],
        matchingRules: DEFAULT_MATCHING_RULES,
        remark: `Generated from bank statement scan ${task.scanNo}`,
      }, task.createdByUserId);
      const sourceFile = await this.prisma.reconciliationSourceFile.findFirst({ where: { batchId: batch.id } });
      if (sourceFile) {
        await this.prisma.reconciliationSourceFile.update({
          where: { id: sourceFile.id },
          data: {
            storageKey: generated.storageKey,
            rawMetadata: { sourceType: 'AI_PDF_SCAN', scanTaskId: scanId, originalPdfFilename: task.originalFilename, provider: provider.displayName },
          },
        });
      }
      await this.bankStatementScanTaskStore.update({
        where: { id: scanId },
        data: {
          status: 'COMPLETED',
          progress: 100,
          currentStage: 'BATCH_CREATED',
          processedPageCount: task.pageCount || 0,
          generatedFileId: sourceFile?.id,
          generatedFilename: generated.filename,
          generatedStorageKey: generated.storageKey,
          reconciliationBatchId: batch.id,
          completedAt: new Date(),
        },
      });
      await this.prisma.auditLog.create({
        data: {
          actorUserId: task.createdByUserId,
          action: 'reconciliation.bank.scan.completed',
          entityType: 'BankStatementScanTask',
          entityId: scanId,
          after: { generatedFilename: generated.filename, reconciliationBatchId: batch.id, extractedRowCount: rows.length },
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '银行账单 AI 扫描失败';
      await this.bankStatementScanTaskStore.update({
        where: { id: scanId },
        data: { status: 'FAILED', currentStage: 'FAILED', errorCode: 'SCAN_PROCESSING_FAILED', errorMessage: message.slice(0, 1000), completedAt: new Date() },
      }).catch(() => undefined);
    }
  }

  private async callResponsesProvider(provider: any, pdf: Buffer | null, prompt: string, structured: boolean, filename = 'bank-statement.pdf', fileUrl?: string) {
    if (pdf && !provider.supportsPdfInput) throw new Error('所选 AI Provider 不支持 PDF 输入');
    if (provider.transport === 'OPENAI_CHAT_COMPLETIONS' && pdf) {
      throw new Error('DeepSeek Chat API 不支持 PDF 输入，不能直接用于银行账单 OCR');
    }
    const content: any[] = [];
    if (pdf) {
      content.push(fileUrl
        ? { type: 'input_file', file_url: fileUrl }
        : { type: 'input_file', filename, file_data: `data:application/pdf;base64,${pdf.toString('base64')}` });
    }
    content.push({ type: 'input_text', text: prompt });
    const isChatCompletions = provider.transport === 'OPENAI_CHAT_COMPLETIONS';
    const body: any = isChatCompletions
      ? { model: provider.modelName, messages: [{ role: 'user', content: prompt }], stream: false }
      : { model: provider.modelName, input: [{ role: 'user', content }] };
    if (pdf && provider.providerType === 'QWEN') body.ocr_options = { task: 'document_parsing' };
    if (structured && provider.supportsStructuredJson) {
      if (isChatCompletions) body.response_format = { type: 'json_object' };
      else body.text = { format: { type: 'json_schema', name: 'bank_statement_transactions', strict: true, schema: this.bankStatementExtractionSchema() } };
    }

    const endpoint = new URL(provider.apiPath, provider.baseUrl.endsWith('/') ? provider.baseUrl : `${provider.baseUrl}/`).toString();
    const apiKey = provider.encryptedApiKey ? this.decryptProviderSecret(provider.encryptedApiKey) : '';
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= provider.maxRetries; attempt += 1) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(provider.timeoutMs),
        });
        const payload: any = await response.json().catch(() => ({}));
        if (!response.ok) {
          const providerCode = this.sanitizeText(payload?.error?.code || payload?.code);
          const providerMessage = this.sanitizeText(payload?.error?.message || payload?.message || response.statusText);
          const detail = [providerCode, providerMessage].filter(Boolean).join(': ');
          const providerError = new Error(`AI Provider 请求失败 (${response.status}): ${detail}`);
          if (response.status === 400 && this.isProviderDataInspectionFailure(providerError)) throw providerError;
          throw providerError;
        }
        const text = this.extractResponsesText(payload);
        if (!text) throw new Error('AI Provider 返回了空结果');
        return text;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('AI Provider 请求失败');
        if (this.isProviderDataInspectionFailure(lastError)) break;
        if (attempt < provider.maxRetries) await new Promise((resolveDelay) => setTimeout(resolveDelay, 500 * (2 ** attempt)));
      }
    }
    throw lastError || new Error('AI Provider 请求失败');
  }

  private isProviderDataInspectionFailure(error: unknown) {
    const message = error instanceof Error ? error.message : String(error || '');
    return /DataInspectionFailed|data_inspection_failed|inappropriate content/i.test(message);
  }

  private async findBankStatementFallbackProvider(excludedProviderId: string) {
    const candidates = await this.bankStatementAiProviderStore.findMany({
      where: {
        id: { not: excludedProviderId },
        enabled: true,
        supportsPdfInput: true,
        supportsStructuredJson: true,
        supportsJapanese: true,
        providerType: { not: 'QWEN' },
      },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
      take: 1,
    });
    return candidates[0] || null;
  }

  private extractResponsesText(payload: any) {
    if (typeof payload?.output_text === 'string') return payload.output_text;
    if (typeof payload?.choices?.[0]?.message?.content === 'string') return payload.choices[0].message.content;
    const texts = (payload?.output || [])
      .flatMap((item: any) => item?.content || [])
      .map((item: any) => item?.text ?? item?.ocr_result)
      .filter((value: unknown) => typeof value === 'string');
    return texts.join('');
  }

  private createSignedScanSourceUrl(scanId: string) {
    const configuredBaseUrl = this.config.get<string>('BANK_STATEMENT_PUBLIC_BASE_URL');
    if (!configuredBaseUrl) throw new Error('服务器未配置 BANK_STATEMENT_PUBLIC_BASE_URL，Qwen 无法读取银行账单 PDF');
    let url: URL;
    try {
      url = new URL(`/api/v1/reconciliation/bank/scans/${encodeURIComponent(scanId)}/source`, configuredBaseUrl);
    } catch {
      throw new Error('BANK_STATEMENT_PUBLIC_BASE_URL 配置无效');
    }
    const expires = Math.floor(Date.now() / 1000) + 15 * 60;
    url.searchParams.set('expires', String(expires));
    url.searchParams.set('signature', this.signScanSource(scanId, expires));
    return url.toString();
  }

  async getSignedBankStatementSource(scanId: string, expiresValue: unknown, signatureValue: unknown) {
    const expires = Number(expiresValue);
    const signature = typeof signatureValue === 'string' ? signatureValue : '';
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(expires) || expires < now || expires > now + 20 * 60 || !signature) {
      throw new ForbiddenException('银行账单临时访问链接无效或已过期');
    }
    const expected = this.signScanSource(scanId, expires);
    const providedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
      throw new ForbiddenException('银行账单临时访问签名无效');
    }
    const task = await this.bankStatementScanTaskStore.findUnique({ where: { id: scanId } });
    if (!task) throw new NotFoundException('银行账单扫描任务不存在');
    return { buffer: await readFile(this.resolvePrivateStoragePath(task.storageKey)), filename: task.originalFilename };
  }

  private signScanSource(scanId: string, expires: number) {
    return createHmac('sha256', this.providerMasterKey()).update(`${scanId}.${expires}`).digest('base64url');
  }

  private bankStatementExtractionSchema() {
    const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };
    const nullableNumber = { anyOf: [{ type: 'number' }, { type: 'null' }] };
    return {
      type: 'object',
      properties: {
        rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sourcePageNumber: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
              sourceRowNumber: { type: 'integer' },
              transactionDate: nullableString,
              withdrawalAmount: nullableNumber,
              depositAmount: nullableNumber,
              transactionType: nullableString,
              bankDescription: nullableString,
              remarks: nullableString,
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['sourcePageNumber', 'sourceRowNumber', 'transactionDate', 'withdrawalAmount', 'depositAmount', 'transactionType', 'bankDescription', 'remarks', 'confidence'],
            additionalProperties: false,
          },
        },
      },
      required: ['rows'],
      additionalProperties: false,
    };
  }

  private parseProviderJson(text: string) {
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try { return JSON.parse(cleaned); } catch { throw new Error('AI Provider 返回的 JSON 无法解析'); }
  }

  private validateExtractedRows(payload: any): ExtractedBankStatementRow[] {
    if (!payload || !Array.isArray(payload.rows) || payload.rows.length > 10000) throw new Error('AI Provider 返回的交易结构无效');
    return payload.rows.map((row: any, index: number) => {
      const transactionDate = typeof row.transactionDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.transactionDate) ? row.transactionDate : null;
      const numberOrNull = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
      return {
        sourcePageNumber: Number.isInteger(row.sourcePageNumber) && row.sourcePageNumber > 0 ? row.sourcePageNumber : null,
        sourceRowNumber: Number.isInteger(row.sourceRowNumber) && row.sourceRowNumber > 0 ? row.sourceRowNumber : index + 1,
        transactionDate,
        withdrawalAmount: numberOrNull(row.withdrawalAmount),
        depositAmount: numberOrNull(row.depositAmount),
        transactionType: this.sanitizeOptionalText(row.transactionType),
        bankDescription: this.sanitizeOptionalText(row.bankDescription),
        remarks: this.sanitizeOptionalText(row.remarks),
        confidence: typeof row.confidence === 'number' ? Math.min(1, Math.max(0, row.confidence)) : 0,
      };
    });
  }

  private async generateBankStatementWorkbook(task: any, provider: any, rows: ExtractedBankStatementRow[]) {
    const safeText = (value: string | null) => value && /^[=+\-@]/.test(value) ? `'${value}` : value;
    const transactionRows = rows.map((row) => ({
      'Source File': task.originalFilename,
      'Scan Task ID': task.scanNo,
      'Source Page': row.sourcePageNumber,
      'Source Row': row.sourceRowNumber,
      'Transaction Date': row.transactionDate,
      'Withdrawal Amount': row.withdrawalAmount,
      'Deposit Amount': row.depositAmount,
      'Transaction Type': safeText(row.transactionType),
      'Bank Description': safeText(row.bankDescription),
      Remarks: safeText(row.remarks),
      'OCR Confidence': row.confidence,
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(transactionRows), 'BankTransactions');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
      { Field: 'Original PDF Filename', Value: task.originalFilename },
      { Field: 'Total Pages', Value: task.pageCount },
      { Field: 'Total Extracted Rows', Value: rows.length },
      { Field: 'AI Provider', Value: provider.displayName },
      { Field: 'AI Model', Value: provider.modelName },
      { Field: 'Generated At', Value: new Date().toISOString() },
    ]), 'DocumentMetadata');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.filter((row) => row.confidence < 0.8).map((row) => ({ SourcePage: row.sourcePageNumber, SourceRow: row.sourceRowNumber, Confidence: row.confidence, Warning: 'Low confidence' }))), 'OcrWarnings');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
    const directory = join(process.cwd(), 'uploads', 'bank-statements', 'generated');
    await mkdir(directory, { recursive: true });
    const baseName = task.originalFilename.replace(/\.pdf$/i, '').replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 80) || 'bank_statement';
    const filename = `${baseName}_ocr_${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}.xlsx`;
    const storedName = `${randomUUID()}.xlsx`;
    await writeFile(join(directory, storedName), buffer, { flag: 'wx' });
    return { filename, storageKey: `uploads/bank-statements/generated/${storedName}`, fileSize: buffer.length };
  }

  private providerSnapshot(provider: any) {
    return { id: provider.id, displayName: provider.displayName, providerType: provider.providerType, transport: provider.transport, modelName: provider.modelName, supportsPdfInput: provider.supportsPdfInput, supportsStructuredJson: provider.supportsStructuredJson, supportsJapanese: provider.supportsJapanese };
  }

  private toPublicProvider(provider: any) {
    const { encryptedApiKey: _secret, ...publicProvider } = provider;
    return { ...publicProvider, apiKeyConfigured: Boolean(provider.encryptedApiKey), apiKeyMasked: provider.apiKeyLastFour ? `****${provider.apiKeyLastFour}` : null };
  }

  private validateProviderUrl(value: unknown) {
    const text = this.sanitizeText(value);
    try {
      const url = new URL(text);
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname))) throw new Error();
      return url.toString().replace(/\/$/, '');
    } catch { throw new BadRequestException('Provider Base URL 必须是 HTTPS 地址；本地服务可使用 localhost HTTP'); }
  }

  private providerMasterKey() {
    const configured = this.config.get<string>('AI_PROVIDER_MASTER_KEY');
    if (!configured || configured.length < 16) throw new BadRequestException('服务器未配置 AI_PROVIDER_MASTER_KEY，无法安全保存 API Key');
    return createHash('sha256').update(configured).digest();
  }

  private encryptProviderSecret(secret: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.providerMasterKey(), iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
  }

  private decryptProviderSecret(value: string) {
    const [ivValue, tagValue, encryptedValue] = value.split('.');
    if (!ivValue || !tagValue || !encryptedValue) throw new Error('AI Provider 密钥格式无效');
    const decipher = createDecipheriv('aes-256-gcm', this.providerMasterKey(), Buffer.from(ivValue, 'base64'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64')), decipher.final()]).toString('utf8');
  }

  private clampInteger(value: unknown, min: number, max: number, fallback: number) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
  }

  private resolvePrivateStoragePath(storageKey: string) {
    const projectRoot = resolve(process.cwd());
    const absolutePath = resolve(projectRoot, storageKey);
    const pathFromRoot = relative(projectRoot, absolutePath);
    if (!pathFromRoot || pathFromRoot.startsWith('..') || resolve(projectRoot, pathFromRoot) !== absolutePath) throw new Error('文件存储路径无效');
    return absolutePath;
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

  async deleteRecord(recordId: string, actorUserId?: string) {
    const record = await this.prisma.reconciliationRecord.findUnique({ where: { id: recordId } });
    if (!record) throw new NotFoundException('Reconciliation record not found');
    if (record.submittedAt || record.matchStatus === 'SUBMITTED') throw new BadRequestException('已提交的记录不能删除');
    await this.prisma.$transaction([
      this.prisma.auditLog.create({
        data: {
          actorUserId,
          action: 'reconciliation.bank.record.delete',
          entityType: 'ReconciliationRecord',
          entityId: recordId,
          before: this.auditRecord(record),
        },
      }),
      this.prisma.reconciliationRecord.delete({ where: { id: recordId } }),
    ]);
    await this.refreshBatchStats(record.batchId);
    return { ok: true, batchId: record.batchId };
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
