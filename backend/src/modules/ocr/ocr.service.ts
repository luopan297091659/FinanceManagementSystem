import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { detectMimeType } from './mime-type.util';
import { preparePdfFilesForWebhook } from './image-to-pdf.util';

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
    const task = await this.prisma.ocrTask.findUnique({ where: { taskId }, include: { workflow: true } });
    if (!task) throw new NotFoundException('OCR 任务不存在');
    return task;
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

    const rawRecords = this.extractRecords(callback);
    const matchedRecords = await Promise.all(rawRecords.map((record) => this.matchSystemData(record)));
    const unmatchedCount = matchedRecords.filter((record) => record.systemMatch.status !== 'MATCHED').length;
    const callbackStatus = callback?.status || callback?.data?.status;
    const failed = ['FAILED', 'ERROR'].includes(String(callbackStatus || '').toUpperCase());
    const state = failed ? 'FAILED' : unmatchedCount ? 'REVIEW_REQUIRED' : 'COMPLETED';
    const normalizedResult = { records: matchedRecords, summary: { total: matchedRecords.length, matched: matchedRecords.length - unmatchedCount, unmatched: unmatchedCount } };

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

  private extractRecords(payload: any): Record<string, any>[] {
    const candidates = [payload?.records, payload?.results, payload?.data?.records, payload?.data?.results, payload?.data];
    const records = candidates.find(Array.isArray);
    if (records) return records.filter((item: unknown) => item && typeof item === 'object');
    return payload && typeof payload === 'object' ? [payload] : [];
  }

  private async matchSystemData(record: Record<string, any>) {
    const tenantName = this.first(record, 'tenantName', 'tenant_name', 'inflow_party', 'payerName', 'payer_name');
    const ownerName = this.first(record, 'ownerName', 'owner_name', 'owner', 'outflow_party');
    const roomNumber = this.first(record, 'roomNumber', 'room_number', 'room');
    const contractNumber = this.first(record, 'contractNumber', 'contract_number', 'contractNo');
    const propertyName = this.first(record, 'propertyName', 'property_name', 'buildingName');
    const bankStatementSummary = this.first(record, 'bankStatementSummary', 'bank_statement_summary', 'summary', 'description', 'bankDescription', 'bank_description');

    const [tenants, owners, rooms, contracts] = await Promise.all([
      tenantName ? this.prisma.tenant.findMany({ where: { name: { equals: tenantName, mode: 'insensitive' } }, take: 2 }) : [],
      ownerName ? this.prisma.owner.findMany({ where: { name: { equals: ownerName, mode: 'insensitive' }, deletedAt: null }, take: 2 }) : [],
      roomNumber ? this.prisma.room.findMany({ where: { roomNumber: { equals: roomNumber, mode: 'insensitive' }, deletedAt: null, ...(propertyName ? { property: { name: { equals: propertyName, mode: 'insensitive' } } } : {}) }, include: { property: true }, take: 2 }) : [],
      contractNumber || bankStatementSummary ? this.prisma.contract.findMany({
        where: contractNumber
          ? { contractNumber: { equals: contractNumber, mode: 'insensitive' }, deletedAt: null }
          : { bankStatementSummary: { equals: bankStatementSummary, mode: 'insensitive' }, deletedAt: null },
        take: 2,
      }) : [],
    ]);

    const supplied = [tenantName, ownerName, roomNumber, contractNumber, bankStatementSummary].filter(Boolean).length;
    const uniqueMatches = [tenants, owners, rooms, contracts].filter((items) => items.length === 1).length;
    const ambiguous = [tenants, owners, rooms, contracts].some((items) => items.length > 1);
    return {
      ...record,
      systemMatch: {
        status: supplied > 0 && uniqueMatches > 0 && !ambiguous ? 'MATCHED' : ambiguous ? 'AMBIGUOUS' : 'UNMATCHED',
        tenantId: tenants.length === 1 ? tenants[0].id : null,
        ownerId: owners.length === 1 ? owners[0].id : null,
        roomId: rooms.length === 1 ? rooms[0].id : null,
        propertyId: rooms.length === 1 ? rooms[0].propertyId : null,
        contractId: contracts.length === 1 ? contracts[0].id : null,
        bankStatementSummary: contracts.length === 1 ? contracts[0].bankStatementSummary : null,
        reason: ambiguous ? '存在多个系统候选项，请人工确认' : uniqueMatches ? `已匹配 ${uniqueMatches} 类系统数据` : '未找到系统侧匹配数据',
      },
    };
  }

  private first(record: Record<string, any>, ...keys: string[]) {
    const value = keys.map((key) => record[key]).find((item) => item !== undefined && item !== null && String(item).trim());
    return value === undefined ? '' : String(value).trim();
  }
}
