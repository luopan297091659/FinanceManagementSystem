import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class OcrService {
  constructor(private readonly prisma: PrismaService) {}

  async createTask(dto: { taskName: string; webhookUrl: string; callbackUrl: string; fileNames: string[] }) {
    const taskId = `TASK-${Date.now()}`;
    const task = await this.prisma.ocrTask.create({
      data: {
        taskId,
        taskName: dto.taskName,
        webhookUrl: dto.webhookUrl,
        callbackUrl: dto.callbackUrl,
        fileNames: dto.fileNames,
        state: 'UPLOADING',
      },
    });
    return task;
  }

  async getTask(taskId: string) {
    const task = await this.prisma.ocrTask.findUnique({ where: { taskId } });
    if (!task) {
      throw new NotFoundException('OCR 任务不存在');
    }
    return task;
  }

  async handleCallback(payload: any) {
    const taskId = payload?.taskId;
    if (!taskId) {
      throw new NotFoundException('缺少 taskId');
    }

    const task = await this.prisma.ocrTask.findUnique({ where: { taskId } });
    if (!task) {
      throw new NotFoundException('OCR 任务不存在');
    }

    const state = payload?.status === 'SUCCESS' ? 'COMPLETED' : payload?.status === 'FAILED' ? 'FAILED' : 'PROCESSING';
    const reviewStatus = payload?.results?.some((item) => item.review_status === '需人工确认' || item.reviewStatus === 'REVIEW_REQUIRED')
      ? 'REVIEW_REQUIRED'
      : 'COMPLETED';

    return this.prisma.ocrTask.update({
      where: { taskId },
      data: {
        state,
        callbackPayload: payload,
        resultJson: payload,
        reviewStatus,
      },
    });
  }
}
