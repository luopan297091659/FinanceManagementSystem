import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { readFile, unlink } from 'fs/promises';
import { randomUUID } from 'crypto';
import { isAbsolute, relative, resolve } from 'path';
import { PrismaService } from '../../database/prisma.service';
import { detectMimeType } from './mime-type.util';
import { preparePdfFilesForWebhook } from './image-to-pdf.util';
import { extractOcrResultRecords, summarizeOcrRecords } from './ocr-result.util';
import {
  normalizedOcrTextContains,
  normalizedOcrTextEquals,
  normalizedOcrTextSimilarity,
  ocrMatchSearchVariants,
} from './ocr-match-normalization.util';

type WorkflowInput = {
  name: string;
  description?: string;
  webhookUrl: string;
  callbackUrl: string;
  enabled?: boolean;
};

type OcrMatchRule = {
  id: string;
  systemFields: string[];
  sourceFields: string[];
  operator: string;
  required: boolean;
  logicalOperator: 'AND' | 'OR';
};

type OcrMatchConfiguration = {
  version: 2;
  rules: OcrMatchRule[];
};

type OcrSystemFieldDefinition = {
  path: string[];
  type: 'text' | 'number' | 'date' | 'valid-date';
  label: string;
};

const OCR_SYSTEM_FIELDS: Record<string, OcrSystemFieldDefinition> = {
  'property.propertyCode': { path: ['property', 'propertyCode'], type: 'text', label: '物件编号' },
  'property.name': { path: ['property', 'name'], type: 'text', label: '物件名称' },
  'property.nameKana': { path: ['property', 'nameKana'], type: 'text', label: '物件名称假名' },
  'property.postalCode': { path: ['property', 'postalCode'], type: 'text', label: '邮政编码' },
  'property.address': { path: ['property', 'address'], type: 'text', label: '地址' },
  'property.ward': { path: ['property', 'ward'], type: 'text', label: '区' },
  'property.city': { path: ['property', 'city'], type: 'text', label: '城市' },
  'property.prefecture': { path: ['property', 'prefecture'], type: 'text', label: '都道府县' },
  'property.buildingType': { path: ['property', 'buildingType'], type: 'text', label: '建筑类型' },
  'property.usageType': { path: ['property', 'usageType'], type: 'text', label: '物件用途' },
  'property.currentOwnerSummary': { path: ['property', 'currentOwnerSummary'], type: 'text', label: '物件业主摘要' },
  'property.remark': { path: ['property', 'remark'], type: 'text', label: '物件备注' },
  'room.roomCode': { path: ['room', 'roomCode'], type: 'text', label: '房间编号' },
  'room.houseNumber': { path: ['room', 'houseNumber'], type: 'text', label: '房屋编号' },
  'room.roomNumber': { path: ['room', 'roomNumber'], type: 'text', label: '房间号' },
  'room.displayName': { path: ['room', 'displayName'], type: 'text', label: '房间显示名' },
  'room.unitType': { path: ['room', 'unitType'], type: 'text', label: '单元类型' },
  'room.floorLabel': { path: ['room', 'floorLabel'], type: 'text', label: '楼层' },
  'room.usageType': { path: ['room', 'usageType'], type: 'text', label: '房间用途' },
  'room.currentOwnerSummary': { path: ['room', 'currentOwnerSummary'], type: 'text', label: '房间业主摘要' },
  'room.remark': { path: ['room', 'remark'], type: 'text', label: '房间备注' },
  'contract.contractNumber': { path: ['contractNumber'], type: 'text', label: '合同编号' },
  'contract.externalContractId': { path: ['externalContractId'], type: 'text', label: '外部契约ID' },
  'contract.contractorName': { path: ['contractorName'], type: 'text', label: '契约者' },
  'contract.contractorNameKana': { path: ['contractorNameKana'], type: 'text', label: '契约者假名' },
  'contract.contractorType': { path: ['contractorType'], type: 'text', label: '契约者类型' },
  'contract.payerName': { path: ['payerName'], type: 'text', label: '支付人' },
  'contract.payerNameKana': { path: ['payerNameKana'], type: 'text', label: '支付人假名' },
  'contract.bankStatementSummary': { path: ['bankStatementSummary'], type: 'text', label: '银行账单摘要' },
  'contract.bankSummaryName': { path: ['bankSummaryName'], type: 'text', label: '入金名义' },
  'contract.startDate': { path: ['startDate'], type: 'date', label: '契约开始日' },
  'contract.endDate': { path: ['endDate'], type: 'date', label: '契约结束日' },
  'contract.validDate': { path: [], type: 'valid-date', label: '契约有效日期' },
  'contract.paymentMethod': { path: ['paymentMethod'], type: 'text', label: '支付方式' },
  'contract.paymentMonthType': { path: ['paymentMonthType'], type: 'text', label: '支付月份类型' },
  'contract.monthlyRent': { path: ['monthlyRent'], type: 'number', label: '月租金额' },
  'contract.managementFee': { path: ['managementFee'], type: 'number', label: '管理费' },
  'contract.deposit': { path: ['deposit'], type: 'number', label: '押金' },
  'contract.keyMoney': { path: ['keyMoney'], type: 'number', label: '礼金' },
  'contract.guaranteeDeposit': { path: ['guaranteeDeposit'], type: 'number', label: '保证金' },
  'contract.guaranteeFee': { path: ['guaranteeFee'], type: 'number', label: '保证费' },
  'contract.guaranteeCompanyName': { path: ['guaranteeCompanyName'], type: 'text', label: '保证公司' },
  'contract.guaranteeCompanyNameKana': { path: ['guaranteeCompanyNameKana'], type: 'text', label: '保证公司假名' },
  'contract.keyReplacementFee': { path: ['keyReplacementFee'], type: 'number', label: '换锁费' },
  'contract.renewalAdministrativeFee': { path: ['renewalAdministrativeFee'], type: 'number', label: '更新事务手续费' },
  'contract.insuranceName': { path: ['insuranceName'], type: 'text', label: '保险名称' },
  'contract.insuranceFee': { path: ['insuranceFee'], type: 'number', label: '保险费' },
  'contract.insurancePeriod': { path: ['insurancePeriod'], type: 'text', label: '保险期间' },
  'contract.insuranceStartDate': { path: ['insuranceStartDate'], type: 'date', label: '保险开始日' },
  'contract.insuranceEndDate': { path: ['insuranceEndDate'], type: 'date', label: '保险结束日' },
  'contract.collectionAccount': { path: ['collectionAccount'], type: 'text', label: '收租账户' },
  'contract.managementContractType': { path: ['managementContractType'], type: 'text', label: '管理委托契约方式' },
  'contract.remark': { path: ['remark'], type: 'text', label: '契约备注' },
  'tenant.customerCode': { path: ['tenant', 'customerCode'], type: 'text', label: '租客编号' },
  'tenant.name': { path: ['tenant', 'name'], type: 'text', label: '租客名称' },
  'tenant.nameKana': { path: ['tenant', 'nameKana'], type: 'text', label: '租客名称假名' },
  'tenant.phone': { path: ['tenant', 'phone'], type: 'text', label: '租客电话' },
  'tenant.email': { path: ['tenant', 'email'], type: 'text', label: '租客邮箱' },
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
      select: {
        id: true,
        taskId: true,
        sessionId: true,
        workflowId: true,
        taskName: true,
        state: true,
        fileNames: true,
        reviewStatus: true,
        errorMessage: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
        resultSummary: true,
        workflow: { select: { id: true, name: true, enabled: true } },
      },
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
    const task = await this.prisma.ocrTask.create({
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
    return this.toPublicTask(task);
  }

  async startTask(taskId: string) {
    const task = await this.prisma.ocrTask.findUnique({ where: { taskId }, include: { workflow: true } });
    if (!task) throw new NotFoundException('OCR 任务不存在');
    if (!task.workflow?.enabled) throw new BadRequestException('该 LLM 工作流已停用或删除');
    if (!task.storagePaths.length) throw new BadRequestException('任务没有可发送的文件');
    if (task.state === 'PROCESSING') return this.toPublicTask(task);

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
        matchConfig: (storedResult as any)?.matchConfig || { version: 2, rules: [] },
        matchHistory: Array.isArray((storedResult as any)?.matchHistory) ? (storedResult as any).matchHistory : [],
      };
      const pending = normalizedResult.summary.unmatched > 0;
      task = await this.prisma.ocrTask.update({
        where: { taskId },
        data: {
          resultJson: normalizedResult,
          matchedResultJson: normalizedResult,
          resultSummary: normalizedResult.summary,
          state: pending ? 'REVIEW_REQUIRED' : 'COMPLETED',
          reviewStatus: pending ? 'REVIEW_REQUIRED' : 'COMPLETED',
        },
        include: { workflow: true },
      });
    }
    return this.toPublicTask(task);
  }

  async deleteTask(taskId: string, actorUserId?: string) {
    const task = await this.prisma.ocrTask.findUnique({ where: { taskId } });
    if (!task) throw new NotFoundException('OCR 历史执行任务不存在');
    if (task.state === 'PROCESSING') throw new BadRequestException('工作流正在执行中，暂时不能删除');
    await this.prisma.$transaction([
      this.prisma.auditLog.create({
        data: {
          actorUserId,
          action: 'reconciliation.ocr.task.delete',
          entityType: 'OcrTask',
          entityId: taskId,
          before: {
            taskId: task.taskId,
            sessionId: task.sessionId,
            workflowId: task.workflowId,
            taskName: task.taskName,
            state: task.state,
            fileNames: task.fileNames,
            createdAt: task.createdAt.toISOString(),
          },
        },
      }),
      this.prisma.ocrTask.delete({ where: { taskId } }),
    ]);
    const uploadRoot = resolve(process.cwd(), 'uploads', 'ocr');
    await Promise.all(task.storagePaths.map(async (storagePath) => {
      const target = resolve(storagePath);
      const pathFromUploadRoot = relative(uploadRoot, target);
      if (!pathFromUploadRoot || pathFromUploadRoot.startsWith('..') || isAbsolute(pathFromUploadRoot)) return;
      await unlink(target).catch(() => undefined);
    }));
    return { deleted: true, taskId };
  }

  async saveMatchConfig(taskId: string, configuration: unknown, actorUserId?: string) {
    const task = await this.getTask(taskId);
    const normalizedConfiguration = this.validateMatchConfiguration(configuration);
    const result = (task.resultJson || {}) as Record<string, any>;
    const normalizedResult = {
      ...result,
      matchConfig: { ...normalizedConfiguration, updatedAt: new Date().toISOString(), updatedBy: actorUserId || null },
    };
    const updated = await this.prisma.ocrTask.update({
      where: { taskId },
      data: { resultJson: normalizedResult, matchedResultJson: normalizedResult, resultSummary: (result as any).summary || null },
      include: { workflow: true },
    });
    return this.toPublicTask(updated);
  }

  async executeMatching(taskId: string, configuration: unknown, recordIds: unknown, actorUserId?: string) {
    const task = await this.getTask(taskId);
    const result = (task.resultJson || {}) as Record<string, any>;
    const normalizedConfiguration = this.validateMatchConfiguration(
      configuration && typeof configuration === 'object' ? configuration : result.matchConfig,
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
      targetIndexes.map(({ record }) => this.matchSystemData(record, normalizedConfiguration)),
    );
    targetIndexes.forEach(({ index }, targetIndex) => { records[index] = matchedTargets[targetIndex]; });
    const summary = summarizeOcrRecords(records);
    const runMatched = matchedTargets.filter((record) => record.systemMatch?.status === 'MATCHED').length;
    const historyEntry = {
      executedAt: new Date().toISOString(),
      executedBy: actorUserId || null,
      configuration: normalizedConfiguration,
      requestedRecordIds: selectedRecordIds ? [...selectedRecordIds] : null,
      processed: matchedTargets.length,
      matched: runMatched,
      remaining: summary.unmatched,
    };
    const normalizedResult = {
      ...result,
      records,
      summary,
      matchConfig: { ...normalizedConfiguration, updatedAt: new Date().toISOString(), updatedBy: actorUserId || null },
      matchHistory: [...(Array.isArray(result.matchHistory) ? result.matchHistory : []), historyEntry].slice(-100),
    };
    const pending = summary.unmatched > 0;
    const [updated] = await this.prisma.$transaction([
      this.prisma.ocrTask.update({
        where: { taskId },
        data: {
          resultJson: normalizedResult,
          matchedResultJson: normalizedResult,
          resultSummary: summary,
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
    return this.toPublicTask(updated);
  }

  async listMatchCandidates(query = '') {
    const search = query.trim();
    const searchVariants = ocrMatchSearchVariants(search);
    let contracts = await this.prisma.contract.findMany({
      where: {
        deletedAt: null,
        ...(searchVariants.length ? {
          OR: searchVariants.flatMap((value) => [
            { contractNumber: { contains: value, mode: 'insensitive' as const } },
            { contractorName: { contains: value, mode: 'insensitive' as const } },
            { payerName: { contains: value, mode: 'insensitive' as const } },
            { bankSummaryName: { contains: value, mode: 'insensitive' as const } },
            { bankStatementSummary: { contains: value, mode: 'insensitive' as const } },
            { tenant: { name: { contains: value, mode: 'insensitive' as const } } },
            { room: { roomNumber: { contains: value, mode: 'insensitive' as const } } },
            { property: { name: { contains: value, mode: 'insensitive' as const } } },
          ]),
        } : {}),
      },
      include: { tenant: true, room: { include: { property: true } }, property: true },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    if (search && !contracts.length) {
      contracts = await this.prisma.contract.findMany({
        where: { deletedAt: null },
        include: { tenant: true, room: { include: { property: true } }, property: true },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      });
    }
    return contracts
      .map((contract) => ({ contract, score: this.candidateMatchScore(search, contract) }))
      .sort((left, right) => right.score.matchScore - left.score.matchScore)
      .slice(0, 50)
      .map(({ contract, score }) => ({
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
        ...score,
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
      const sourceSummary = this.first(before, 'contentSummary', 'counterpartyRaw', 'counterparty', 'summary', 'description');
      const manualScore = this.candidateMatchScore(sourceSummary, contract).matchScore;
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
          matchScore: manualScore,
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
          resultSummary: normalizedResult.summary,
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
    return this.toPublicTask(updated);
  }

  async updateRecordFields(
    taskId: string,
    recordId: string,
    input: { actualMonth?: string | null },
    actorUserId?: string,
  ) {
    const task = await this.getTask(taskId);
    const result = (task.resultJson || {}) as Record<string, any>;
    const records = Array.isArray(result.records) ? result.records.map((record: Record<string, any>) => ({ ...record })) : [];
    const recordIndex = records.findIndex((record: Record<string, any>) => record._recordId === recordId);
    if (recordIndex < 0) throw new NotFoundException('OCR 明细记录不存在');
    const actualMonth = input.actualMonth === undefined || input.actualMonth === null
      ? null
      : String(input.actualMonth).trim() || null;
    if (actualMonth && !/^\d{4}-(0[1-9]|1[0-2])$/.test(actualMonth)) {
      throw new BadRequestException('实际月份格式必须为 YYYY-MM');
    }
    const before = records[recordIndex];
    records[recordIndex] = { ...before, actualMonth, actual_month: actualMonth };
    const normalizedResult = { ...result, records };
    const [updated] = await this.prisma.$transaction([
      this.prisma.ocrTask.update({
        where: { taskId },
        data: { resultJson: normalizedResult, matchedResultJson: normalizedResult, resultSummary: result.summary || null },
        include: { workflow: true },
      }),
      this.prisma.auditLog.create({
        data: {
          actorUserId,
          action: 'reconciliation.ocr.actual-month.update',
          entityType: 'OcrTaskRecord',
          entityId: `${taskId}:${recordId}`,
          before: { actualMonth: before.actual_month || null },
          after: { actualMonth },
        },
      }),
    ]);
    return this.toPublicTask(updated);
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
      matchConfig: { version: 2, rules: [] },
      matchHistory: [],
    };

    const updated = await this.prisma.ocrTask.update({
      where: { taskId: task.taskId },
      data: {
        state,
        callbackPayload: callback,
        resultJson: normalizedResult,
        matchedResultJson: normalizedResult,
        resultSummary: summary,
        reviewStatus: unmatchedCount ? 'REVIEW_REQUIRED' : 'COMPLETED',
        errorMessage: failed ? String(callback?.error || callback?.message || callback?.data?.error || '工作流执行失败') : null,
        completedAt: new Date(),
      },
      include: { workflow: true },
    });
    return this.toPublicTask(updated);
  }

  private toPublicTask(task: any) {
    // These fields contain duplicate OCR records or server-only routing data.
    // The management UI only consumes resultJson.
    const {
      matchedResultJson: _matchedResultJson,
      callbackPayload: _callbackPayload,
      storagePaths: _storagePaths,
      webhookUrl: _webhookUrl,
      callbackUrl: _callbackUrl,
      ...publicTask
    } = task;
    return publicTask;
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

  private async matchSystemData(record: Record<string, any>, configuration: OcrMatchConfiguration) {
    // Normalize again at the matching boundary so persisted v1 configurations and
    // internal callers that bypass the controller remain fully backward compatible.
    configuration = this.validateMatchConfiguration(configuration);
    const missingRules = configuration.rules.filter((rule) => rule.required && !this.ruleSourceValues(record, rule).length);
    if (missingRules.length) {
      return {
        ...record,
        systemMatch: {
          status: 'UNMATCHED',
          matchMode: null,
          reason: `回调数据缺少规则所需字段：${missingRules.map((rule) => rule.sourceFields.join(' / ')).join('、')}`,
          matchingConfiguration: configuration,
        },
      };
    }

    const activeRules = configuration.rules.filter((rule) => this.ruleSourceValues(record, rule).length);
    const condition = this.combineRuleConditions(activeRules, (rule) => this.buildRuleCondition(record, rule, false));
    if (!condition) {
      return { ...record, systemMatch: { status: 'UNMATCHED', matchMode: null, reason: '所选 JSON 字段没有可用于匹配的数据', matchingConfiguration: configuration } };
    }
    const directContracts = await this.prisma.contract.findMany({
      where: { deletedAt: null, AND: [condition] },
      include: { tenant: true, room: { include: { property: true } }, property: true },
      take: 2,
    });
    let usedNormalizedFallback = false;
    const directRankedCandidates = directContracts
      .map((contract) => ({ contract, score: this.contractMatchScore(contract, record, activeRules) }))
      .sort((left, right) => right.score - left.score);
    let bestCandidateScore = directRankedCandidates[0]?.score ?? 0;
    let contracts = directRankedCandidates
      .filter((candidate) => candidate.score === 100)
      .map((candidate) => candidate.contract)
      .slice(0, 2);
    if (!contracts.length && activeRules.some((rule) => rule.systemFields.some((field) => this.isTextSystemField(field)))) {
      const candidateCondition = this.combineRuleConditions(activeRules, (rule) => this.buildRuleCondition(record, rule, true));
      const candidates = await this.prisma.contract.findMany({
        where: { deletedAt: null, AND: candidateCondition ? [candidateCondition] : [{ id: '__no_candidate__' }] },
        include: { tenant: true, room: { include: { property: true } }, property: true },
        take: 100,
      });
      const rankedCandidates = candidates
        .map((contract) => ({ contract, score: this.contractMatchScore(contract, record, activeRules) }))
        .sort((left, right) => right.score - left.score);
      bestCandidateScore = Math.max(bestCandidateScore, rankedCandidates[0]?.score ?? 0);
      contracts = rankedCandidates
        .filter((candidate) => candidate.score === 100)
        .map((candidate) => candidate.contract)
        .slice(0, 2);
      usedNormalizedFallback = contracts.length > 0;
    }
    if (contracts.length !== 1) {
      return {
        ...record,
        systemMatch: {
          status: contracts.length > 1 ? 'AMBIGUOUS' : 'UNMATCHED',
          matchMode: null,
          matchScore: contracts.length > 1 ? 100 : bestCandidateScore,
          reason: contracts.length > 1 ? '匹配到多个系统合同，请手工选择' : '未找到满足所配置规则的系统合同',
          matchingConfiguration: configuration,
        },
      };
    }
    const contract = contracts[0];
    return {
      ...record,
      systemMatch: {
        status: 'MATCHED', matchMode: 'AUTO', matchingConfiguration: configuration,
        matchScore: 100,
        contractId: contract.id, contractNumber: contract.contractNumber,
        tenantId: contract.tenantId, tenantName: contract.tenant?.name || contract.contractorName,
        roomId: contract.roomId, roomNumber: contract.room.roomNumber,
        propertyId: contract.propertyId, propertyName: contract.property.name,
        bankStatementSummary: contract.bankStatementSummary || contract.bankSummaryName,
        reason: `按 ${activeRules.map((rule, index) => `${index ? `${rule.logicalOperator} ` : ''}${rule.systemFields.map((field) => this.systemFieldLabel(field)).join(' / ')}←${rule.sourceFields.join(' / ')}`).join('、')} 自动匹配成功${usedNormalizedFallback ? '（已统一空格、字符宽度及 Unicode 形式）' : ''}`,
      },
    };
  }

  private async matchSystemDataLegacy(record: Record<string, any>, fields: string[]) {
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

  private validateMatchConfiguration(value: unknown): OcrMatchConfiguration {
    const legacyMappings: Record<string, [string, string]> = {
      partyName: ['contract.payerName', 'counterparty'],
      summary: ['contract.bankStatementSummary', 'contentSummary'],
      propertyName: ['property.name', 'propertyName'],
      roomNumber: ['room.roomNumber', 'roomNumber'],
      contractNumber: ['contract.contractNumber', 'contractNumber'],
      amount: ['contract.monthlyRent', 'statisticalAmount'],
      date: ['contract.validDate', 'date'],
    };
    const supportedFields = new Set(Object.keys(OCR_SYSTEM_FIELDS));
    const supportedOperators = new Set(['equals', 'contains', 'normalized_equals', 'within_date_range']);
    const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
    const legacyFields = Array.isArray(value) ? value : Array.isArray(raw.fields) ? raw.fields : [];
    const rawRules = Array.isArray(raw.rules)
      ? raw.rules
      : legacyFields.map((field: unknown) => {
        const mapping = legacyMappings[String(field)];
        return mapping ? { systemField: mapping[0], sourceField: mapping[1] } : null;
      }).filter(Boolean);
    const globalOperator = raw.logicalOperator === 'OR' ? 'OR' : 'AND';
    const rules: OcrMatchRule[] = rawRules.map<OcrMatchRule>((rule: any, index: number) => {
      const systemFields = (Array.isArray(rule?.systemFields) ? rule.systemFields : [rule?.systemField])
        .map((field: unknown) => String(field || '').trim())
        .filter((field: string) => supportedFields.has(field));
      const sourceFields = (Array.isArray(rule?.sourceFields) ? rule.sourceFields : [rule?.sourceField])
        .map((field: unknown) => String(field || '').trim())
        .filter(Boolean);
      return {
        id: String(rule?.id || `rule-${index + 1}`),
        systemFields: [...new Set<string>(systemFields)],
        sourceFields: [...new Set<string>(sourceFields)],
        operator: supportedOperators.has(String(rule?.operator)) ? String(rule.operator) : 'equals',
        required: rule?.required !== false,
        logicalOperator: index === 0 ? 'AND' : (rule?.logicalOperator === 'OR' ? 'OR' : globalOperator),
      };
    }).filter((rule: OcrMatchRule) => rule.systemFields.length > 0 && rule.sourceFields.length > 0);
    if (!rules.length) throw new BadRequestException('执行匹配前，请至少配置一条有效的系统字段与 JSON 字段映射');
    return { version: 2, rules };
  }

  private recordValue(record: Record<string, any>, path: string) {
    const value = path.split('.').reduce<any>((current, key) => current?.[key], record);
    return value === undefined || value === null || String(value).trim() === '' ? '' : value;
  }

  private ruleSourceValues(record: Record<string, any>, rule: OcrMatchRule) {
    return rule.sourceFields
      .map((field) => ({ field, value: this.recordValue(record, field) }))
      .filter((item) => item.value !== '');
  }

  private buildRuleCondition(record: Record<string, any>, rule: OcrMatchRule, normalizedFallback: boolean) {
    const conditions = this.ruleSourceValues(record, rule).flatMap(({ value }) => rule.systemFields.map((systemField) => (
      normalizedFallback
        ? this.buildNormalizedCandidateCondition(systemField, value, rule.operator)
        : this.buildSystemCondition(systemField, value, rule.operator)
    )));
    if (!conditions.length) return null;
    return conditions.length === 1 ? conditions[0] : { OR: conditions };
  }

  private combineRuleConditions(
    rules: OcrMatchRule[],
    conditionForRule: (rule: OcrMatchRule) => Record<string, any> | null,
  ): Record<string, any> | null {
    let combined: Record<string, any> | null = null;
    for (const rule of rules) {
      const condition = conditionForRule(rule);
      if (!condition) continue;
      combined = combined === null
        ? condition
        : { [rule.logicalOperator]: [combined, condition] };
    }
    return combined;
  }

  private buildSystemCondition(systemField: string, rawValue: any, operator: string): Record<string, any> {
    const definition = OCR_SYSTEM_FIELDS[systemField];
    if (!definition) return { id: '__unsupported_field__' };
    const stringFilter = operator === 'contains'
      ? { contains: String(rawValue).trim(), mode: 'insensitive' }
      : { equals: String(rawValue).trim(), mode: 'insensitive' };
    if (definition.type === 'text') return this.buildPathCondition(definition.path, stringFilter);
    if (definition.type === 'number') {
      const amount = Number(String(rawValue).replace(/[,￥¥\s]/g, ''));
      return Number.isFinite(amount) ? this.buildPathCondition(definition.path, amount) : { id: '__invalid_amount__' };
    }
    const date = new Date(rawValue);
    if (Number.isNaN(date.getTime())) return { id: '__invalid_date__' };
    if (definition.type === 'valid-date') return { AND: [{ startDate: { lte: date } }, { OR: [{ endDate: null }, { endDate: { gte: date } }] }] };
    return this.buildPathCondition(definition.path, date);
  }

  private buildNormalizedCandidateCondition(systemField: string, rawValue: any, operator: string): Record<string, any> {
    if (!this.isTextSystemField(systemField)) return this.buildSystemCondition(systemField, rawValue, operator);
    const variants = ocrMatchSearchVariants(rawValue);
    if (!variants.length) return { id: '__invalid_text__' };
    return {
      OR: variants.map((value) => this.buildPathCondition(OCR_SYSTEM_FIELDS[systemField].path, { contains: value, mode: 'insensitive' })),
    };
  }

  private buildPathCondition(path: string[], value: unknown): Record<string, any> {
    if (!path.length) return { id: '__unsupported_path__' };
    const [head, ...tail] = path;
    return { [head]: tail.length ? this.buildPathCondition(tail, value) : value };
  }

  private isTextSystemField(systemField: string) {
    return OCR_SYSTEM_FIELDS[systemField]?.type === 'text';
  }

  private contractMatchScore(contract: any, record: Record<string, any>, rules: OcrMatchRule[]) {
    let combinedScore: number | null = null;
    for (const rule of rules) {
      const scores = this.ruleSourceValues(record, rule).flatMap(({ value }) => rule.systemFields.map((systemField) => (
        this.contractRuleScore(contract, systemField, value, rule.operator)
      )));
      if (!scores.length) continue;
      const ruleScore = Math.max(...scores);
      combinedScore = combinedScore === null
        ? ruleScore
        : rule.logicalOperator === 'OR'
          ? Math.max(combinedScore, ruleScore)
          : Math.round((combinedScore + ruleScore) / 2);
    }
    return combinedScore ?? 0;
  }

  private contractRuleScore(contract: any, systemField: string, rawValue: any, operator: string) {
    if (this.isTextSystemField(systemField)) {
      const systemValue = this.contractSystemText(contract, systemField);
      return normalizedOcrTextSimilarity(systemValue, rawValue);
    }
    return this.contractMatchesRule(contract, systemField, rawValue, operator) ? 100 : 0;
  }

  private candidateMatchScore(search: string, contract: any) {
    if (!search) return { matchScore: 0, matchedField: null };
    const fields = [
      ['bankStatementSummary', contract.bankStatementSummary],
      ['bankSummaryName', contract.bankSummaryName],
      ['payerName', contract.payerName],
      ['contractorName', contract.contractorName],
      ['tenantName', contract.tenant?.name],
      ['contractNumber', contract.contractNumber],
      ['roomNumber', contract.room?.roomNumber],
      ['propertyName', contract.property?.name],
    ] as Array<[string, unknown]>;
    const ranked = fields
      .filter(([, value]) => value !== undefined && value !== null && String(value).trim())
      .map(([matchedField, value]) => ({ matchedField, matchScore: normalizedOcrTextSimilarity(search, value) }))
      .sort((left, right) => right.matchScore - left.matchScore);
    return ranked[0] ?? { matchScore: 0, matchedField: null };
  }

  private contractMatchesRule(contract: any, systemField: string, rawValue: any, operator: string) {
    const definition = OCR_SYSTEM_FIELDS[systemField];
    if (!definition) return false;
    if (definition.type === 'text') {
      const systemValue = this.contractSystemValue(contract, systemField);
      return operator === 'contains'
        ? normalizedOcrTextContains(systemValue, rawValue)
        : normalizedOcrTextEquals(systemValue, rawValue);
    }
    if (definition.type === 'number') {
      const sourceAmount = Number(String(rawValue).replace(/[,￥¥\s]/g, ''));
      const systemAmount = this.contractSystemValue(contract, systemField);
      return Number.isFinite(sourceAmount) && systemAmount != null && Number(systemAmount) === sourceAmount;
    }
    if (definition.type === 'valid-date') {
      const date = new Date(rawValue);
      if (Number.isNaN(date.getTime())) return false;
      return contract.startDate <= date && (!contract.endDate || contract.endDate >= date);
    }
    const sourceDate = new Date(rawValue);
    const systemDate = this.contractSystemValue(contract, systemField);
    return !Number.isNaN(sourceDate.getTime()) && systemDate instanceof Date
      && systemDate.toISOString().slice(0, 10) === sourceDate.toISOString().slice(0, 10);
  }

  private contractSystemValue(contract: any, systemField: string) {
    return OCR_SYSTEM_FIELDS[systemField]?.path.reduce<any>((current, key) => current?.[key], contract);
  }

  private contractSystemText(contract: any, systemField: string) {
    return this.contractSystemValue(contract, systemField);
  }

  private systemFieldLabel(field: string) {
    return OCR_SYSTEM_FIELDS[field]?.label || field;
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
