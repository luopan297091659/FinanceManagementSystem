import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateOcrTaskDto } from './dto/create-ocr-task.dto';
import { OcrService } from './ocr.service';

@Controller('ocr')
export class OcrController {
  constructor(private readonly ocrService: OcrService) {}

  @Post('tasks')
  createTask(@Body() dto: CreateOcrTaskDto) {
    return this.ocrService.createTask(dto);
  }

  @Get('tasks/:taskId')
  getTask(@Param('taskId') taskId: string) {
    return this.ocrService.getTask(taskId);
  }

  @Post('callback')
  receiveCallback(@Body() payload: unknown) {
    return this.ocrService.handleCallback(payload);
  }
}
