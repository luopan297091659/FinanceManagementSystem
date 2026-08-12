import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { Request } from 'express';
import { CreateOcrUploadTaskDto } from './dto/create-ocr-upload-task.dto';
import { SaveOcrWorkflowDto } from './dto/save-ocr-workflow.dto';
import { OcrService } from './ocr.service';
import { RequirePermission } from '../rbac/permissions.decorator';

const OCR_UPLOAD_DIR = join(process.cwd(), 'uploads', 'ocr');
if (!existsSync(OCR_UPLOAD_DIR)) mkdirSync(OCR_UPLOAD_DIR, { recursive: true });

@Controller('ocr')
export class OcrController {
  constructor(private readonly ocrService: OcrService) {}

  @Get('workflows')
  @RequirePermission('reconciliation.ocr.view')
  listWorkflows() { return this.ocrService.listWorkflows(); }

  @Get('match-rule-templates')
  @RequirePermission('reconciliation.ocr.view')
  listMatchRuleTemplates(@Req() request: Request) {
    return this.ocrService.listMatchRuleTemplates(this.actorUserId(request));
  }

  @Post('match-rule-templates')
  @RequirePermission('ocr:execute')
  saveMatchRuleTemplate(
    @Body() body: { name?: string; description?: string; configuration?: unknown },
    @Req() request: Request,
  ) {
    return this.ocrService.saveMatchRuleTemplate(body, this.actorUserId(request));
  }

  @Delete('match-rule-templates/:templateId')
  @RequirePermission('ocr:execute')
  deleteMatchRuleTemplate(@Param('templateId') templateId: string, @Req() request: Request) {
    return this.ocrService.deleteMatchRuleTemplate(templateId, this.actorUserId(request));
  }

  @Post('workflows')
  @RequirePermission('ocr:execute')
  createWorkflow(@Body() dto: SaveOcrWorkflowDto, @Req() request: Request) {
    return this.ocrService.saveWorkflow(dto, this.actorUserId(request));
  }

  @Patch('workflows/:workflowId')
  @RequirePermission('ocr:execute')
  updateWorkflow(@Param('workflowId') workflowId: string, @Body() dto: SaveOcrWorkflowDto) {
    return this.ocrService.saveWorkflow(dto, undefined, workflowId);
  }

  @Delete('workflows/:workflowId')
  @RequirePermission('ocr:execute')
  deleteWorkflow(@Param('workflowId') workflowId: string) { return this.ocrService.deleteWorkflow(workflowId); }

  @Get('tasks')
  @RequirePermission('reconciliation.ocr.view')
  listTasks(@Query('workflowId') workflowId?: string) { return this.ocrService.listTasks(workflowId); }

  @Post('tasks/upload')
  @RequirePermission('ocr:execute')
  @UseInterceptors(AnyFilesInterceptor({
    storage: diskStorage({
      destination: OCR_UPLOAD_DIR,
      filename: (_request, file, callback) => callback(null, `${Date.now()}-${randomSuffix()}${extname(file.originalname)}`),
    }),
    limits: { fileSize: 100 * 1024 * 1024 },
  }))
  uploadTask(@Body() dto: CreateOcrUploadTaskDto, @UploadedFiles() files: Express.Multer.File[]) {
    if (!files?.length) throw new BadRequestException('至少上传一个文件');
    return this.ocrService.uploadTaskFiles(dto, files);
  }

  @Post('tasks/:taskId/start')
  @RequirePermission('ocr:execute')
  startTask(@Param('taskId') taskId: string) { return this.ocrService.startTask(taskId); }

  @Get('tasks/:taskId')
  @RequirePermission('reconciliation.ocr.view')
  getTask(@Param('taskId') taskId: string) { return this.ocrService.getTask(taskId); }

  @Delete('tasks/:taskId')
  @RequirePermission('ocr:execute')
  deleteTask(@Param('taskId') taskId: string, @Req() request: Request) {
    return this.ocrService.deleteTask(taskId, this.actorUserId(request));
  }

  @Get('tasks/:taskId/match-candidates')
  @RequirePermission('reconciliation.ocr.view')
  matchCandidates(@Query('query') query?: string) { return this.ocrService.listMatchCandidates(query); }

  @Patch('tasks/:taskId/match-config')
  @RequirePermission('ocr:execute')
  saveMatchConfig(@Param('taskId') taskId: string, @Body() body: { configuration?: unknown; fields?: string[] }, @Req() request: Request) {
    return this.ocrService.saveMatchConfig(taskId, body?.configuration ?? body?.fields, this.actorUserId(request));
  }

  @Post('tasks/:taskId/match')
  @RequirePermission('ocr:execute')
  executeMatching(
    @Param('taskId') taskId: string,
    @Body() body: { configuration?: unknown; fields?: string[]; recordIds?: string[]; rematch?: boolean },
    @Req() request: Request,
  ) {
    return this.ocrService.executeMatching(taskId, body?.configuration ?? body?.fields, body?.recordIds, this.actorUserId(request), body?.rematch !== false);
  }

  @Post('tasks/:taskId/sync-matched')
  @RequirePermission('ocr:execute')
  syncMatchedRecords(@Param('taskId') taskId: string, @Req() request: Request) {
    return this.ocrService.syncMatchedRecords(taskId, this.actorUserId(request));
  }

  @Patch('tasks/:taskId/records/:recordId')
  @RequirePermission('ocr:execute')
  updateRecordFields(
    @Param('taskId') taskId: string,
    @Param('recordId') recordId: string,
    @Body() body: { actualMonth?: string | null },
    @Req() request: Request,
  ) {
    return this.ocrService.updateRecordFields(taskId, recordId, body, this.actorUserId(request));
  }

  @Patch('tasks/:taskId/records/:recordId/review')
  @RequirePermission('ocr:execute')
  reviewRecord(
    @Param('taskId') taskId: string,
    @Param('recordId') recordId: string,
    @Body() body: { action?: string; contractId?: string; contractIds?: string[]; reason?: string },
    @Req() request: Request,
  ) {
    return this.ocrService.reviewRecord(taskId, recordId, body, this.actorUserId(request));
  }

  @Post('callback')
  receiveCallback(@Body() payload: unknown) { return this.ocrService.handleCallback(payload); }

  private actorUserId(request: Request) {
    return (request as Request & { user?: { id?: string; sub?: string } }).user?.id
      || (request as Request & { user?: { id?: string; sub?: string } }).user?.sub;
  }
}

function randomSuffix() {
  return Math.round(Math.random() * 1e9).toString(36);
}
