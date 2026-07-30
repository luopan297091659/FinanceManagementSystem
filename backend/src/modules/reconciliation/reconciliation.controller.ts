import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ReconciliationRecordMatchStatus } from '@prisma/client';
import { Request } from 'express';
import { RequirePermission } from '../rbac/permissions.decorator';
import { ReconciliationService } from './reconciliation.service';

@Controller('reconciliation/bank')
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Post('upload')
  @RequirePermission('reconciliation.bank.upload')
  upload(@Body() body: any, @Req() request: Request) {
    return this.reconciliation.uploadBankRows(body, this.actorUserId(request));
  }

  @Post('batches/:batchId/parse')
  @RequirePermission('reconciliation.bank.parse')
  parse(@Param('batchId') batchId: string, @Req() request: Request) {
    return this.reconciliation.parseBatch(batchId, this.actorUserId(request));
  }

  @Post('batches/:batchId/match')
  @RequirePermission('reconciliation.bank.match')
  match(@Param('batchId') batchId: string, @Body() body: any, @Req() request: Request) {
    return this.reconciliation.matchBatch(batchId, body?.configuration ?? body?.matchingRules, this.actorUserId(request));
  }

  @Post('batches/:batchId/rematch')
  @RequirePermission('reconciliation.bank.match')
  rematch(@Param('batchId') batchId: string, @Body() body: any, @Req() request: Request) {
    return this.reconciliation.matchBatch(batchId, body?.configuration ?? body?.matchingRules, this.actorUserId(request));
  }

  @Get('field-metadata')
  @RequirePermission('reconciliation.bank.view')
  fieldMetadata() {
    return this.reconciliation.getFieldMetadata();
  }

  @Get('batches/:batchId/headers')
  @RequirePermission('reconciliation.bank.view')
  headers(@Param('batchId') batchId: string) {
    return this.reconciliation.getBatchHeaders(batchId);
  }

  @Post('batches/:batchId/configuration')
  @RequirePermission('reconciliation.bank.match')
  saveConfiguration(@Param('batchId') batchId: string, @Body() body: any, @Req() request: Request) {
    return this.reconciliation.saveBatchConfiguration(batchId, body?.configuration, body?.templateId, this.actorUserId(request));
  }

  @Post('batches/:batchId/preview')
  @RequirePermission('reconciliation.bank.match')
  preview(@Param('batchId') batchId: string, @Body() body: any) {
    return this.reconciliation.previewConfiguration(batchId, body?.configuration);
  }

  @Get('templates')
  @Header('Cache-Control', 'no-store')
  @RequirePermission('reconciliation.bank.view')
  templates(@Req() request: Request) {
    return this.reconciliation.listTemplates(this.actorUserId(request));
  }

  @Post('templates')
  @RequirePermission('reconciliation.bank.match')
  createTemplate(@Body() body: any, @Req() request: Request) {
    return this.reconciliation.createTemplate(body, this.actorUserId(request));
  }

  @Patch('templates/:templateId')
  @RequirePermission('reconciliation.bank.match')
  updateTemplate(@Param('templateId') templateId: string, @Body() body: any, @Req() request: Request) {
    return this.reconciliation.updateTemplate(templateId, body, this.actorUserId(request));
  }

  @Delete('templates/:templateId')
  @RequirePermission('reconciliation.bank.match')
  deleteTemplate(@Param('templateId') templateId: string, @Req() request: Request) {
    return this.reconciliation.deleteTemplate(templateId, this.actorUserId(request));
  }

  @Post('templates/:templateId/duplicate')
  @RequirePermission('reconciliation.bank.match')
  duplicateTemplate(@Param('templateId') templateId: string, @Body() body: any, @Req() request: Request) {
    return this.reconciliation.duplicateTemplate(templateId, body?.name, this.actorUserId(request));
  }

  @Post('batches/:batchId/submit')
  @RequirePermission('reconciliation.bank.submit')
  submit(@Param('batchId') batchId: string, @Req() request: Request) {
    return this.reconciliation.submitBatch(batchId, this.actorUserId(request));
  }

  @Get('batches')
  @RequirePermission('reconciliation.bank.view')
  batches() {
    return this.reconciliation.listBatches();
  }

  @Get('batches/:batchId')
  @RequirePermission('reconciliation.bank.view')
  batch(@Param('batchId') batchId: string) {
    return this.reconciliation.getBatch(batchId);
  }

  @Delete('batches/:batchId')
  @RequirePermission('reconciliation.bank.history')
  deleteBatch(@Param('batchId') batchId: string, @Req() request: Request) {
    return this.reconciliation.deleteBatch(batchId, this.actorUserId(request));
  }

  @Get('batches/:batchId/records')
  @RequirePermission('reconciliation.bank.view')
  records(@Param('batchId') batchId: string, @Query('status') status?: ReconciliationRecordMatchStatus) {
    return this.reconciliation.getRecords(batchId, status);
  }

  @Get('batches/:batchId/export-excel')
  @RequirePermission('reconciliation.bank.export')
  exportExcel(@Param('batchId') batchId: string) {
    return this.reconciliation.getRecords(batchId);
  }

  @Get('batches/:batchId/unmatched-json')
  @RequirePermission('reconciliation.bank.export')
  unmatchedJson(@Param('batchId') batchId: string) {
    return this.reconciliation.exportUnmatchedJson(batchId);
  }

  @Patch('records/:recordId')
  @RequirePermission('reconciliation.bank.edit')
  updateRecord(@Param('recordId') recordId: string, @Body() body: any, @Req() request: Request) {
    return this.reconciliation.updateRecord(recordId, body, this.actorUserId(request));
  }

  @Post('records/:recordId/manual-match')
  @RequirePermission('reconciliation.bank.review')
  manualMatch(@Param('recordId') recordId: string, @Body() body: any, @Req() request: Request) {
    return this.reconciliation.manualMatch(recordId, body, this.actorUserId(request));
  }

  @Post('records/:recordId/unmatch')
  @RequirePermission('reconciliation.bank.review')
  unmatch(@Param('recordId') recordId: string, @Req() request: Request) {
    return this.reconciliation.unmatch(recordId, this.actorUserId(request));
  }

  @Get('records/:recordId/candidates')
  @RequirePermission('reconciliation.bank.view')
  candidates(@Param('recordId') recordId: string) {
    return this.reconciliation.getCandidates(recordId);
  }

  @Get('options/properties')
  @RequirePermission('reconciliation.bank.view')
  properties(@Query('search') search?: string) {
    return this.reconciliation.optionsProperties(search);
  }

  @Get('options/rooms')
  @RequirePermission('reconciliation.bank.view')
  rooms(@Query('propertyId') propertyId?: string, @Query('search') search?: string) {
    return this.reconciliation.optionsRooms(propertyId, search);
  }

  @Get('options/contracts')
  @RequirePermission('reconciliation.bank.view')
  contracts(@Query('roomId') roomId?: string, @Query('transactionDate') transactionDate?: string) {
    return this.reconciliation.optionsContracts(roomId, transactionDate);
  }

  @Post('master-data/preview')
  @RequirePermission('reconciliation.bank.master-data.sync')
  masterDataPreview(@Body() body: any) {
    return { rows: body?.rows ?? [], count: body?.rows?.length ?? 0 };
  }

  @Post('master-data/sync')
  @RequirePermission('reconciliation.bank.master-data.sync')
  masterDataSync(@Body() body: any, @Req() request: Request) {
    return this.reconciliation.masterDataSync(body?.rows ?? [], this.actorUserId(request));
  }

  private actorUserId(request: Request) {
    return (request as any).user?.id as string | undefined;
  }
}
