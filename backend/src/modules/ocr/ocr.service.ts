import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { detectMimeType } from './mime-type.util';
import { preparePdfFilesForWebhook } from './image-to-pdf.util';
import { extractOcrResultRecords, summarizeOcrRecords } from './ocr-result.util';

type WorkflowInput = {
  name: string;
  description?: string;
  webhookUrl: string;
  callbackUrl: string;
  enabled?: boolean;
};

@Injectable()
export class OcrService {
  constructor(private readonly prisma: PrismaService) {}

  listWorkflows() {
    return this.prisma.ocrWorkflow.findMany({ orderBy: { createdAt: 'desc' } });
  }

  saveWorkflow(input: WorkflowInput, actorUserId?: string, workflowId?: string) {
    const data = {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      webhookUrl: input.webhookUrl.trim(),
      callbackUrl: this.normalizeCallbackUrl(input.callbackUrl),
      enabled: input.enabled ?? true,
    };
    if (workflowId) {
      return this.prisma.ocrWorkflow.update({ where: { id: workflowId }, data });
    }
    return this.prisma.ocrWorkflow.create({ data: { ...data, createdBy: actorUserId } });
  }

  async deleteWorkflow(workflowId: string) {
    const workflow = await this.prisma.ocrWorkflow.findUnique({ where: { id: workflowId } });
    if (!workflow) throw new NotFoundException('LLM 工作流不存在');
    return this.prisma.ocrWorkflow.delete({ where: { id: workflowId } });
  }

  listTasks(workflowId?: string) {
    return this.prisma.ocrTask.findMany({
      where: workflowId ? { workflowId } : undefined,
      include: { workflow: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async uploadTaskFiles(
    dto: { taskName: string; workflowId: string; sessionId?: string },
    files: Express.Multer.File[],
  ) {
    const workflow = await this.prisma.ocrWorkflow.findUnique({ where: { id: dto.workflowId } });
    if (!workflow || !workflow.enabled) throw new BadRequestException('请选择有效的 LLM 工作流');
    const taskId = `OCR-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const sessionId = dto.sessionId?.trim() || randomUUID();
    return this.prisma.ocrTask.create({
      data: {
        taskId,
        sessionId,
        workflowId: workflow.id,
        taskName: dto.taskName.trim(),
        webhookUrl: workflow.webhookUrl,
        callbackUrl: this.normalizeCallbackUrl(workflow.callbackUrl),
        fileNames: files.map((file) => file.originalname),
        fileMimeTypes: files.map((file) => detectMimeType(file.originalname, file.mimetype)),
        storagePaths: files.map((file) => file.path),
        state: 'UPLOADING',
      },
      include: { workflow: true },
    });
  }

  async startTask(taskId: string) {
    const task = await this.prisma.ocrTask.findUnique({ where: { taskId }, include: { workflow: true } });
    if (!task) throw new NotFoundException('OCR 任务不存在');
    if (!task.workflow?.enabled) throw new BadRequestException('该 LLM 工作流已停用或删除');
    if (!task.storagePaths.length) throw new BadRequestException('任务没有可发送的文件');
    if (task.state === 'PROCESSING') return task;

    await this.prisma.ocrTask.update({
      where: { taskId },
      data: { state: 'PROCESSING', startedAt: new Date(), errorMessage: null },
    });

    const maxAttempts = 3;
    let totalMegabytes = '0.0';
    let lastStatus = 0;
    let lastDetail = '';
    let attempts = 0;

    try {
      const sourceFiles = await Promise.all(task.storagePaths.map(async (storagePath, index) => {
        const buffer = await readFile(storagePath);
        const fileName = task.fileNames[index] || `request-file-${index + 1}`;
        const mimeType = detectMimeType(fileName, task.fileMimeTypes[index]);
        return { buffer, fileName, mimeType };
      }));
      const preparedFiles = await preparePdfFilesForWebhook(sourceFiles);
      const totalBytes = preparedFiles.reduce((sum, file) => sum + file.buffer.length, 0);
      totalMegabytes = (totalBytes / 1024 / 1024).toFixed(1);

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        attempts = attempt;
        try {
          const form = new FormData();
          form.append('taskId', task.taskId);
          form.append('sessionId', task.sessionId || task.taskId);
          form.append('taskName', task.taskName || task.workflow.name);
          form.append('callbackUrl', task.callbackUrl);
          for (const file of preparedFiles) {
            form.append(
              'requestFile',
              new Blob([file.buffer], { type: file.mimeType }),
              file.fileName,
            );
          }
          const response = await fetch(task.webhookUrl, {
            method: 'POST',
            body: form,
            signal: AbortSignal.timeout(120_000),
          });
          if (response.ok) return this.getTask(taskId);
          lastStatus = response.status;
          lastDetail = this.compactUpstreamError(await response.text());
          if (![502, 503, 504].includes(response.status) || attempt === maxAttempts) break;
        } catch (error) {
          lastStatus = 0;
          lastDetail = error instanceof Error ? error.message : String(error);
          if (attempt === maxAttempts) break;
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 800));
      }
      const statusLabel = lastStatus ? `HTTP ${lastStatus}` : 'network/timeout error';
      throw new Error(
        `Make Webhook failed after ${attempts} attempt(s): ${statusLabel}. `
        + `${task.fileNames.length} file(s), ${totalMegabytes} MB total. ${lastDetail} `
        + 'Check the Make file-size limit (Free 5 MB, Core 100 MB, Pro 250 MB, Teams 500 MB, Enterprise 1 GB).',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.ocrTask.update({
        where: { taskId },
        data: { state: 'FAILED', errorMessage: message },
      });
      throw new BadGatewayException(message);
    }
  }

  async getTask(taskId: string) {
    let task = await this.prisma.ocrTask.findUnique({ where: { taskId }, include: { workflow: true } });
    if (!task) throw new NotFoundException('OCR 任务不存在');
    const storedResult = task.resultJson as { records?: Record<string, any>[] } | null;
    const storedRecords = Array.isArray(storedResult?.records) ? storedResult.records : [];
    const requiresNormalization = storedRecords.some((record) => (
      !record?._recordId || typeof record?.records === 'string' || Array.isArray(record?.records)
    ));
    if (storedRecords.length && requiresNormalization) {
      const rawRecords = extractOcrResultRecords({ records: storedRecords });
      const normalizedRecords = rawRecords.map((record) => record.systemMatch ? record : ({
        ...record,
        systemMatch: { status: 'PENDING', matchMode: null, reason: '已解析，等待配置匹配字段并执行匹配' },
      }));
      const normalizedResult = {
        ...(storedResult || {}),
        records: normalizedRecords,
        summary: summarizeOcrRecords(normalizedRecords),
        matchConfig: (storedResult as any)?.matchConfig || { fields: [] },
        matchHistory: Array.isArray((storedResult as any)?.matchHistory) ? (storedResult as any).matchHistory : [],
      };
      const pending = normalizedResult.summary.unmatched > 0;
      task = await this.prisma.ocrTask.update({
        where: { taskId },
        data: {
          resultJson: normalizedResult,
          matchedResultJson: normalizedResult,
          state: pending ? 'REVIEW_REQUIRED' : 'COMPLETED',
          reviewStatus: pending ? 'REVIEW_REQUIRED' : 'COMPLETED',
        },
        include: { workflow: true },
      });
    }
    return task;
  }

  async saveMatchConfig(taskId: string, fields: unknown, actorUserId?: string) {
    const task = await this.getTask(taskId);
    const selectedFields = this.validateMatchFields(fields);
    const result = (task.resultJson || {}) as Record<string, any>;
    const normalizedResult = {
      ...result,
      matchConfig: { fields: selectedFields, updatedAt: new Date().toISOString(), updatedBy: actorUserId || null },
    };
    return this.prisma.ocrTask.update({
      where: { taskId },
      data: { resultJson: normalizedResult, matchedResultJson: normalizedResult },
      include: { workflow: true },
    });
  }

  async executeMatching(taskId: string, fields: unknown, recordIds: unknown, actorUserId?: string) {
    const task = await this.getTask(taskId);
    const result = (task.resultJson || {}) as Record<string, any>;
    const selectedFields = this.validateMatchFields(
      Array.isArray(fields) && fields.length ? fields : result.matchConfig?.fields,
    );
    const selectedRecordIds = Array.isArray(recordIds)
      ? new Set(recordIds.map((value) => String(value)))
      : null;
    const records = Array.isArray(result.records) ? result.records.map((record: Record<string, any>) => ({ ...record })) : [];
    const targetIndexes = records
      .map((record: Record<string, any>, index: number) => ({ record, index }))
      .filter(({ record }) => (
        !['MATCHED', 'MANUAL_SYNC'].includes(record.systemMatch?.status)
        && (!selectedRecordIds || selectedRecordIds.has(String(record._recordId)))
      ));
    if (!targetIndexes.length) throw new BadRequestException('没有需要执行匹配的剩余数据');

    const matchedTargets = await Promise.all(
      targetIndexes.map(({ record }) => this.matchSystemData(record, selectedFields)),
    );
    targetIndexes.forEach(({ index }, targetIndex) => { records[index] = matchedTargets[targetIndex]; });
    const summary = summarizeOcrRecords(records);
    const runMatched = matchedTargets.filter((record) => record.systemMatch?.status === 'MATCHED').length;
    const historyEntry = {
      executedAt: new Date().toISOString(),
      executedBy: actorUserId || null,
      fields: selectedFields,
      requestedRecordIds: selectedRecordIds ? [...selectedRecordIds] : null,
      processed: matchedTargets.length,
      matched: runMatched,
      remaining: summary.unmatched,
    };
    const normalizedResult = {
      ...result,
      records,
      summary,
      matchConfig: { fields: selectedFields, updatedAt: new Date().toISOString(), updatedBy: actorUserId || null },
      matchHistory: [...(Array.isArray(result.matchHistory) ? result.matchHistory : []), historyEntry].slice(-100),
    };
    const pending = summary.unmatched > 0;
    const [updated] = await this.prisma.$transaction([
      this.prisma.ocrTask.update({
        where: { taskId },
        data: {
          resultJson: normalizedResult,
          matchedResultJson: normalizedResult,
          state: pending ? 'REVIEW_REQUIRED' : 'COMPLETED',
          reviewStatus: pending ? 'REVIEW_REQUIRED' : 'COMPLETED',
        },
        include: { workflow: true },
      }),
      this.prisma.auditLog.create({
        data: {
          actorUserId,
          action: 'reconciliation.ocr.auto-match',
          entityType: 'OcrTask',
          entityId: taskId,
          after: historyEntry,
        },
      }),
    ]);
    return updated;
  }

  async listMatchCandidates(query = '') {
    const search = query.trim();
    const contracts = await this.prisma.contract.findMany({
      where: {
        deletedAt: null,
        ...(search ? {
          OR: [
            { contractNumber: { contains: search, mode: 'insensitive' as const } },
            { contractorName: { contains: search, mode: 'insensitive' as const } },
            { payerName: { contains: search, mode: 'insensitive' as const } },
            { bankSummaryName: { contains: search, mode: 'insensitive' as const } },
            { bankStatementSummary: { contains: search, mode: 'insensitive' as const } },
            { tenant: { name: { contains: search, mode: 'insensitive' as const } } },
            { room: { roomNumber: { contains: search, mode: 'insensitive' as const } } },
            { property: { name: { contains: search, mode: 'insensitive' as const } } },
          ],
        } : {}),
      },
      include: { tenant: true, room: { include: { property: true } }, property: true },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    return contracts.map((contract) => ({
      id: contract.id,
      contractNumber: contract.contractNumber,
      propertyId: contract.propertyId,
      propertyName: contract.property.name,
      roomId: contract.roomId,
      roomNumber: contract.room.roomNumber,
      tenantId: contract.tenantId,
      tenantName: contract.tenant?.name,
      contractorName: contract.contractorName,
      payerName: contract.payerName,
      bankStatementSummary: contract.bankStatementSummary || contract.bankSummaryName,
      status: contract.status,
    }));
  }

  async reviewRecord(
    taskId: string,
    recordId: string,
    input: { action?: string; contractId?: string; reason?: string },
    actorUserId?: string,
  ) {
    const task = await this.getTask(taskId);
    const result = task.resultJson as { records?: Record<string, any>[] } | null;
    const records = Array.isArray(result?.records) ? result.records.map((record) => ({ ...record })) : [];
    const recordIndex = records.findIndex((record) => record._recordId === recordId);
    if (recordIndex < 0) throw new NotFoundException('OCR 明细记录不存在');

    const before = records[recordIndex];
    const action = String(input.action || 'MATCH').toUpperCase();
    if (action === 'MANUAL_SYNC') {
      records[recordIndex] = {
        ...before,
        systemMatch: {
          ...(before.systemMatch || {}),
          status: 'MANUAL_SYNC',
          matchMode: 'MANUAL',
          reason: input.reason?.trim() || '未能匹配系统数据，已标记为手工同步',
          reviewedAt: new Date().toISOString(),
          reviewedBy: actorUserId || null,
        },
      };
    } else {
      if (!input.contractId) throw new BadRequestException('请选择需要匹配的系统合同');
      const contract = await this.prisma.contract.findFirst({
        where: { id: input.contractId, deletedAt: null },
        include: { tenant: true, room: { include: { property: true } }, property: true },
      });
      if (!contract) throw new BadRequestException('选择的系统合同不存在或已删除');
      records[recordIndex] = {
        ...before,
        systemMatch: {
          status: 'MATCHED',
          matchMode: 'MANUAL',
          contractId: contract.id,
          contractNumber: contract.contractNumber,
          tenantId: contract.tenantId,
          tenantName: contract.tenant?.name || contract.contractorName,
          roomId: contract.roomId,
          roomNumber: contract.room.roomNumber,
          propertyId: contract.propertyId,
          propertyName: contract.property.name,
          bankStatementSummary: contract.bankStatementSummary || contract.bankSummaryName,
          reason: input.reason?.trim() || '已由操作员选择系统合同并完成匹配',
          reviewedAt: new Date().toISOString(),
          reviewedBy: actorUserId || null,
        },
      };
    }

    const normalizedResult = { ...(result || {}), records, summary: summarizeOcrRecords(records) };
    const pending = normalizedResult.summary.unmatched > 0;
    const [updated] = await this.prisma.$transaction([
      this.prisma.ocrTask.update({
        where: { taskId },
        data: {
          resultJson: normalizedResult,
          matchedResultJson: normalizedResult,
          state: pending ? 'REVIEW_REQUIRED' : 'COMPLETED',
          reviewStatus: pending ? 'REVIEW_REQUIRED' : 'COMPLETED',
        },
        include: { workflow: true },
      }),
      this.prisma.auditLog.create({
        data: {
          actorUserId,
          action: action === 'MANUAL_SYNC' ? 'reconciliation.ocr.manual-sync' : 'reconciliation.ocr.manual-match',
          entityType: 'OcrTaskRecord',
          entityId: `${taskId}:${recordId}`,
          before,
          after: records[recordIndex],
        },
      }),
    ]);
    return updated;
  }

  async handleCallback(payload: any) {
    const callback = this.normalizeCallbackPayload(payload);
    const correlationId = callback?.sessionId || callback?.seesinId || callback?.taskId
      || callback?.data?.sessionId || callback?.data?.seesinId || callback?.data?.taskId;
    if (!correlationId) throw new BadRequestException('回调缺少 sessionId、seesinId 或 taskId');
    const task = await this.prisma.ocrTask.findFirst({
      where: { OR: [{ sessionId: String(correlationId) }, { taskId: String(correlationId) }] },
    });
    if (!task) throw new NotFoundException('OCR 任务不存在');

    const rawRecords = extractOcrResultRecords(callback);
    const parsedRecords = rawRecords.map((record) => ({
      ...record,
      systemMatch: { status: 'PENDING', matchMode: null, reason: '已解析，等待配置匹配字段并执行匹配' },
    }));
    const summary = summarizeOcrRecords(parsedRecords);
    const unmatchedCount = summary.unmatched;
    const callbackStatus = callback?.status || callback?.data?.status;
    const failed = ['FAILED', 'ERROR'].includes(String(callbackStatus || '').toUpperCase());
    const state = failed ? 'FAILED' : unmatchedCount ? 'REVIEW_REQUIRED' : 'COMPLETED';
    const normalizedResult = {
      records: parsedRecords,
      summary,
      matchConfig: { fields: [] },
      matchHistory: [],
    };

    return this.prisma.ocrTask.update({
      where: { taskId: task.taskId },
      data: {
        state,
        callbackPayload: callback,
        resultJson: normalizedResult,
        matchedResultJson: normalizedResult,
        reviewStatus: unmatchedCount ? 'REVIEW_REQUIRED' : 'COMPLETED',
        errorMessage: failed ? String(callback?.error || callback?.message || callback?.data?.error || '工作流执行失败') : null,
        completedAt: new Date(),
      },
      include: { workflow: true },
    });
  }

  private normalizeCallbackPayload(payload: any) {
    if (typeof payload !== 'string') return payload;
    try {
      return JSON.parse(payload);
    } catch {
      throw new BadRequestException('回调内容不是有效 JSON');
    }
  }

  private normalizeCallbackUrl(url: string) {
    const normalized = url.trim();
    return normalized.replace(
      /^https:\/\/(www\.)?kotabi\.top\/api\/v1\/ocr\/callback$/i,
      'https://kotabi.top/finance/api/v1/ocr/callback',
    );
  }

  private compactUpstreamError(value: string) {
    return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
  }

  private async matchSystemData(record: Record<string, any>, fields: string[]) {
    const values = {
      partyName: this.first(record, 'tenantName', 'tenant_name', 'inflow_party', 'outflow_party', 'payerName', 'payer_name', 'ownerName', 'owner_name'),
      summary: this.first(record, 'bankStatementSummary', 'bank_statement_summary', 'summary', 'description', 'bankDescription', 'bank_description'),
      roomNumber: this.first(record, 'roomNumber', 'room_number', 'room'),
      contractNumber: this.first(record, 'contractNumber', 'contract_number', 'contractNo'),
      propertyName: this.first(record, 'propertyName', 'property_name', 'buildingName'),
      amount: this.first(record, 'net_amount', 'document_amount', 'amount'),
      date: this.first(record, 'date', 'transactionDate', 'transaction_date'),
    };
    const missingFields = fields.filter((field) => !values[field as keyof typeof values]);
    if (missingFields.length) {
      return {
        ...record,
        systemMatch: {
          status: 'UNMATCHED',
          matchMode: null,
          reason: `缺少已配置的匹配字段：${missingFields.map((field) => this.matchFieldLabel(field)).join('、')}`,
          matchingFields: fields,
        },
      };
    }

    const conditions: Record<string, any>[] = [];
    if (fields.includes('partyName')) conditions.push({ OR: [
      { payerName: { equals: values.partyName, mode: 'insensitive' } },
      { contractorName: { equals: values.partyName, mode: 'insensitive' } },
      { bankSummaryName: { equals: values.partyName, mode: 'insensitive' } },
      { tenant: { name: { equals: values.partyName, mode: 'insensitive' } } },
    ] });
    if (fields.includes('summary')) conditions.push({ OR: [
      { bankStatementSummary: { equals: values.summary, mode: 'insensitive' } },
      { bankSummaryName: { equals: values.summary, mode: 'insensitive' } },
    ] });
    if (fields.includes('roomNumber')) conditions.push({ room: { roomNumber: { equals: values.roomNumber, mode: 'insensitive' } } });
    if (fields.includes('contractNumber')) conditions.push({ contractNumber: { equals: values.contractNumber, mode: 'insensitive' } });
    if (fields.includes('propertyName')) conditions.push({ property: { name: { equals: values.propertyName, mode: 'insensitive' } } });
    if (fields.includes('amount')) conditions.push({ monthlyRent: values.amount });
    if (fields.includes('date')) {
      const transactionDate = new Date(values.date);
      if (Number.isNaN(transactionDate.getTime())) {
        return { ...record, systemMatch: { status: 'UNMATCHED', matchMode: null, reason: '匹配日期格式无效', matchingFields: fields } };
      }
      conditions.push({ startDate: { lte: transactionDate } });
      conditions.push({ OR: [{ endDate: null }, { endDate: { gte: transactionDate } }] });
    }

    const contracts = await this.prisma.contract.findMany({
      where: { deletedAt: null, AND: conditions },
      include: { tenant: true, room: { include: { property: true } }, property: true },
      take: 2,
    });
    if (contracts.length !== 1) {
      return {
        ...record,
        systemMatch: {
          status: contracts.length > 1 ? 'AMBIGUOUS' : 'UNMATCHED',
          matchMode: null,
          reason: contracts.length > 1 ? '匹配到多个系统合同，请手工选择' : '未找到满足所选字段的系统合同',
          matchingFields: fields,
        },
      };
    }

    const contract = contracts[0];
    return {
      ...record,
      systemMatch: {
        status: 'MATCHED',
        matchMode: 'AUTO',
        matchingFields: fields,
        contractId: contract.id,
        contractNumber: contract.contractNumber,
        tenantId: contract.tenantId,
        tenantName: contract.tenant?.name || contract.contractorName,
        roomId: contract.roomId,
        roomNumber: contract.room.roomNumber,
        propertyId: contract.propertyId,
        propertyName: contract.property.name,
        bankStatementSummary: contract.bankStatementSummary || contract.bankSummaryName,
        reason: `按 ${fields.map((field) => this.matchFieldLabel(field)).join('、')} 自动匹配成功`,
      },
    };
  }

  private validateMatchFields(fields: unknown): string[] {
    const supported = new Set(['partyName', 'summary', 'propertyName', 'roomNumber', 'contractNumber', 'amount', 'date']);
    const selected = Array.isArray(fields)
      ? [...new Set(fields.map((field) => String(field)).filter((field) => supported.has(field)))]
      : [];
    if (!selected.length) throw new BadRequestException('执行匹配前，请至少配置一个有效的匹配字段');
    return selected;
  }

  private matchFieldLabel(field: string) {
    return ({
      partyName: '对方名称',
      summary: '银行摘要',
      propertyName: '物件名称',
      roomNumber: '房间号',
      contractNumber: '合同编号',
      amount: '金额/月租',
      date: '交易日期/合同有效期',
    } as Record<string, string>)[field] || field;
  }

  private first(record: Record<string, any>, ...keys: string[]) {
    const value = keys.map((key) => record[key]).find((item) => item !== undefined && item !== null && String(item).trim());
    return value === undefined ? '' : String(value).trim();
  }
}
