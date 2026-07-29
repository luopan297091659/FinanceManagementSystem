import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { RequirePermission } from '../rbac/permissions.decorator';
import { ContractsService } from './contracts.service';

@Controller('contracts')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  @RequirePermission('contract.view')
  list(@Query('search') search?: string) {
    return this.contracts.list(search);
  }

  @Post()
  @RequirePermission('contract.create')
  create(@Body() body: any, @Req() request: Request) {
    return this.contracts.create(body, this.actor(request));
  }

  @Get('export')
  @RequirePermission('contract.view')
  export(@Query('search') search?: string) {
    return this.contracts.exportRows(search);
  }

  @Post('batch-delete')
  @RequirePermission('contract.edit')
  batchDelete(@Body('ids') ids: unknown, @Req() request: Request) {
    return this.contracts.batchDelete(ids, this.actor(request));
  }

  @Get(':contractId')
  @RequirePermission('contract.view')
  get(@Param('contractId') contractId: string) {
    return this.contracts.get(contractId);
  }

  @Patch(':contractId')
  @RequirePermission('contract.edit')
  update(@Param('contractId') contractId: string, @Body() body: any, @Req() request: Request) {
    return this.contracts.update(contractId, body, this.actor(request));
  }

  @Delete(':contractId')
  @RequirePermission('contract.edit')
  delete(@Param('contractId') contractId: string, @Req() request: Request) {
    return this.contracts.delete(contractId, this.actor(request));
  }

  private actor(request: Request) {
    return (request as any).user?.id as string | undefined;
  }
}

@Controller('integrated-import')
export class IntegratedImportController {
  constructor(private readonly contracts: ContractsService) {}

  @Post('upload')
  @RequirePermission('contract.import')
  upload(@Body() body: any, @Req() request: Request) {
    return this.contracts.uploadIntegrated(body, this.actor(request));
  }

  @Get('batches')
  @RequirePermission('contract.import')
  batches() {
    return this.contracts.listImportBatches();
  }

  @Get(':batchId')
  @RequirePermission('integrated-import.preview')
  preview(@Param('batchId') batchId: string, @Query() query: any) {
    return this.contracts.getImportBatch(batchId, query);
  }

  @Patch(':batchId/rows/:rowId')
  @RequirePermission('integrated-import.preview')
  updateRow(@Param('batchId') batchId: string, @Param('rowId') rowId: string, @Body() body: any, @Req() request: Request) {
    return this.contracts.updateImportRow(batchId, rowId, body, this.actor(request));
  }

  @Post(':batchId/commit')
  @RequirePermission('integrated-import.commit')
  commit(@Param('batchId') batchId: string, @Req() request: Request) {
    return this.contracts.commitIntegrated(batchId, this.actor(request));
  }

  private actor(request: Request) {
    return (request as any).user?.id as string | undefined;
  }
}

@Controller()
export class LinkedContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get('properties/:propertyId/contracts')
  @RequirePermission('contract.view')
  propertyContracts(@Param('propertyId') propertyId: string) {
    return this.contracts.listLinked({ propertyId });
  }

  @Get('rooms/:roomId/contracts')
  @RequirePermission('contract.view')
  roomContracts(@Param('roomId') roomId: string) {
    return this.contracts.listLinked({ roomId });
  }

  @Patch('rooms/:roomId/current-contract')
  @RequirePermission('contract.edit')
  setRoomCurrentContract(@Param('roomId') roomId: string, @Body('contractId') contractId: unknown, @Req() request: Request) {
    return this.contracts.setRoomCurrentContract(roomId, contractId, (request as any).user?.id as string | undefined);
  }

  @Get('properties/:propertyId/contract-summary')
  @RequirePermission('contract.view')
  propertySummary(@Param('propertyId') propertyId: string) {
    return this.contracts.propertySummary(propertyId);
  }
}
