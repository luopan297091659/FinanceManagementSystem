import { BadRequestException, Body, Controller, Get, Param, Post, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { CreateOcrTaskDto } from './dto/create-ocr-task.dto';
import { CreateOcrUploadTaskDto } from './dto/create-ocr-upload-task.dto';
import { OcrService } from './ocr.service';

const OCR_UPLOAD_DIR = join(process.cwd(), 'uploads', 'ocr');

if (!existsSync(OCR_UPLOAD_DIR)) {
  mkdirSync(OCR_UPLOAD_DIR, { recursive: true });
}

@Controller('ocr')
export class OcrController {
  constructor(private readonly ocrService: OcrService) {}

  @Post('tasks')
  createTask(@Body() dto: CreateOcrTaskDto) {
    return this.ocrService.createTask(dto);
  }

  @Post('tasks/upload')
  @UseInterceptors(
    FilesInterceptor('files', 50, {
      storage: diskStorage({
        destination: OCR_UPLOAD_DIR,
        filename: (_req, file, cb) => {
          const suffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
          cb(null, `${suffix}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async uploadTask(@Body() dto: CreateOcrUploadTaskDto, @UploadedFiles() files: Express.Multer.File[]) {
    if (!files || !files.length) {
      throw new BadRequestException('至少上传一个文件');
    }
    return this.ocrService.uploadTaskFiles(dto, files);
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
