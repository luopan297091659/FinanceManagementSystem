import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';

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
      callbackUrl: input.callbackUrl.trim(),
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
        callbackUrl: workflow.callbackUrl,
        fileNames: files.map((file) => file.originalname),
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

    try {
      const form = new FormData();
      form.append('taskId', task.taskId);
      form.append('sessionId', task.sessionId || task.taskId);
      // Keep the misspelled field for existing Make scenarios that already consume it.
      form.append('seesinId', task.sessionId || task.taskId);
      form.append('taskName', task.taskName || task.workflow.name);
      form.append('callbackUrl', task.callbackUrl);
      for (let index = 0; index < task.storagePaths.length; index += 1) {
        const buffer = await readFile(task.storagePaths[index]);
        const name = task.fileNames[index] || `request-file-${index + 1}`;
        form.append('requestFile', new Blob([buffer]), name);
      }
      const response = await fetch(task.webhookUrl, { method: 'POST', body: form });
      if (!response.ok) throw new Error(`Webhook HTTP ${response.status}: ${await response.text()}`);
      return this.getTask(taskId);
    } catch (error) {
      await this.prisma.ocrTask.update({
        where: { taskId },
        data: { state: 'FAILED', errorMessage: error instanceof Error ? error.message : String(error) },
      });
      throw new BadRequestException(error instanceof Error ? error.message : 'Webhook 调用失败');
    }
  }

  async getTask(taskId: string) {
    const task = await this.prisma.ocrTask.findUnique({ where: { taskId }, include: { workflow: true } });
    if (!task) throw new NotFoundException('OCR 任务不存在');
    return task;
  }

  async handleCallback(payload: any) {
    const correlationId = payload?.sessionId || payload?.seesinId || payload?.taskId;
    if (!correlationId) throw new BadRequestException('回调缺少 sessionId、seesinId 或 taskId');
    const task = await this.prisma.ocrTask.findFirst({
      where: { OR: [{ sessionId: String(correlationId) }, { taskId: String(correlationId) }] },
    });
    if (!task) throw new NotFoundException('OCR 任务不存在');

    const rawRecords = this.extractRecords(payload);
    const matchedRecords = await Promise.all(rawRecords.map((record) => this.matchSystemData(record)));
    const unmatchedCount = matchedRecords.filter((record) => record.systemMatch.status !== 'MATCHED').length;
    const failed = String(payload?.status || '').toUpperCase() === 'FAILED';
    const state = failed ? 'FAILED' : unmatchedCount ? 'REVIEW_REQUIRED' : 'COMPLETED';
    const normalizedResult = { records: matchedRecords, summary: { total: matchedRecords.length, matched: matchedRecords.length - unmatchedCount, unmatched: unmatchedCount } };

    return this.prisma.ocrTask.update({
      where: { taskId: task.taskId },
      data: {
        state,
        callbackPayload: payload,
        resultJson: normalizedResult,
        matchedResultJson: normalizedResult,
        reviewStatus: unmatchedCount ? 'REVIEW_REQUIRED' : 'COMPLETED',
        errorMessage: failed ? String(payload?.error || payload?.message || '工作流执行失败') : null,
        completedAt: new Date(),
      },
      include: { workflow: true },
    });
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

    const [tenants, owners, rooms, contracts] = await Promise.all([
      tenantName ? this.prisma.tenant.findMany({ where: { name: { equals: tenantName, mode: 'insensitive' } }, take: 2 }) : [],
      ownerName ? this.prisma.owner.findMany({ where: { name: { equals: ownerName, mode: 'insensitive' }, deletedAt: null }, take: 2 }) : [],
      roomNumber ? this.prisma.room.findMany({ where: { roomNumber: { equals: roomNumber, mode: 'insensitive' }, deletedAt: null, ...(propertyName ? { property: { name: { equals: propertyName, mode: 'insensitive' } } } : {}) }, include: { property: true }, take: 2 }) : [],
      contractNumber ? this.prisma.contract.findMany({ where: { contractNumber: { equals: contractNumber, mode: 'insensitive' }, deletedAt: null }, take: 2 }) : [],
    ]);

    const supplied = [tenantName, ownerName, roomNumber, contractNumber].filter(Boolean).length;
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
        reason: ambiguous ? '存在多个系统候选项，请人工确认' : uniqueMatches ? `已匹配 ${uniqueMatches} 类系统数据` : '未找到系统侧匹配数据',
      },
    };
  }

  private first(record: Record<string, any>, ...keys: string[]) {
    const value = keys.map((key) => record[key]).find((item) => item !== undefined && item !== null && String(item).trim());
    return value === undefined ? '' : String(value).trim();
  }
}
