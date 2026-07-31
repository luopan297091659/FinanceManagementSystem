import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, Req, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ReconciliationRecordMatchStatus } from '@prisma/client';
import { Request } from 'express';
import { memoryStorage } from 'multer';
import { RequirePermission } from '../rbac/permissions.decorator';
import { ReconciliationService } from './reconciliation.service';

@Controller('reconciliation/bank')
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Get('ai-providers')
  @RequirePermission('reconciliation.bank.ai-provider.manage')
  bankStatementAiProviders() {
    return this.reconciliation.listBankStatementAiProviders();
  }

  @Post('ai-providers')
  @RequirePermission('reconciliation.bank.ai-provider.manage')
  createBankStatementAiProvider(@Body() body: any, @Req() request: Request) {
    return this.reconciliation.saveBankStatementAiProvider(body, this.actorUserId(request));
  }

  @Patch('ai-providers/:providerId')
  @RequirePermission('reconciliation.bank.ai-provider.manage')
  updateBankStatementAiProvider(@Param('providerId') providerId: string, @Body() body: any, @Req() request: Request) {
    return this.reconciliation.saveBankStatementAiProvider(body, this.actorUserId(request), providerId);
  }

  @Post('ai-providers/:providerId/test')
  @RequirePermission('reconciliation.bank.ai-provider.manage')
  testBankStatementAiProvider(@Param('providerId') providerId: string) {
    return this.reconciliation.testBankStatementAiProvider(providerId);
  }

  @Delete('ai-providers/:providerId')
  @RequirePermission('reconciliation.bank.ai-provider.manage')
  deleteBankStatementAiProvider(@Param('providerId') providerId: string, @Req() request: Request) {
    return this.reconciliation.deleteBankStatementAiProvider(providerId, this.actorUserId(request));
  }

  @Post('scans/upload')
  @RequirePermission('reconciliation.bank.upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { files: 1, fileSize: 100 * 1024 * 1024 },
  }))
  uploadBankStatementPdf(@UploadedFile() file: Express.Multer.File, @Req() request: Request) {
    return this.reconciliation.uploadBankStatementPdf(file, this.actorUserId(request));
  }

  @Get('scans')
  @RequirePermission('reconciliation.bank.view')
  bankStatementScans(@Req() request: Request) {
    return this.reconciliation.listBankStatementScans(this.actorUserId(request));
  }

  @Get('scans/:scanId/source')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  async bankStatementScanSource(@Param('scanId') scanId: string, @Query('expires') expires: string, @Query('signature') signature: string) {
    const source = await this.reconciliation.getSignedBankStatementSource(scanId, expires, signature);
    return new StreamableFile(source.buffer, {
      type: 'application/pdf',
      disposition: `inline; filename="bank-statement.pdf"`,
    });
  }

  @Get('scans/:scanId')
  @RequirePermission('reconciliation.bank.view')
  bankStatementScan(@Param('scanId') scanId: string, @Req() request: Request) {
    return this.reconciliation.getBankStatementScan(scanId, this.actorUserId(request));
  }

  @Post('scans/:scanId/start')
  @RequirePermission('reconciliation.bank.upload')
  startBankStatementScan(@Param('scanId') scanId: string, @Req() request: Request) {
    return this.reconciliation.startBankStatementScan(scanId, this.actorUserId(request));
  }

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

  @Delete('records/:recordId')
  @RequirePermission('reconciliation.bank.edit')
  deleteRecord(@Param('recordId') recordId: string, @Req() request: Request) {
    return this.reconciliation.deleteRecord(recordId, this.actorUserId(request));
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
