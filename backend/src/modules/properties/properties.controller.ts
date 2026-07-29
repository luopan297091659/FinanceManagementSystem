import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { RequirePermission } from '../rbac/permissions.decorator';
import { PropertiesService } from './properties.service';
import { PropertyImportService } from './property-import.service';

@Controller('properties')
export class PropertiesController {
  constructor(
    private readonly properties: PropertiesService,
    private readonly imports: PropertyImportService,
  ) {}

  @Post('import/upload')
  @RequirePermission('property.import')
  upload(@Body() body: any, @Req() request: Request) {
    return this.imports.upload(body, this.actor(request));
  }

  @Post('import/:batchId/preview')
  @RequirePermission('property.import')
  preview(@Param('batchId') batchId: string, @Body() body: any) {
    return this.imports.getBatch(batchId, body ?? {});
  }

  @Patch('import/:batchId/rows/:rowId')
  @RequirePermission('property.import')
  updateImportRow(@Param('batchId') batchId: string, @Param('rowId') rowId: string, @Body() body: any, @Req() request: Request) {
    return this.imports.updateRow(batchId, rowId, body, this.actor(request));
  }

  @Post('import/:batchId/commit')
  @RequirePermission('property.import.commit')
  commit(@Param('batchId') batchId: string, @Req() request: Request) {
    return this.imports.commit(batchId, this.actor(request));
  }

  @Get('import/batches')
  @RequirePermission('property.import')
  batches() {
    return this.imports.listBatches();
  }

  @Get('import/batches/:batchId')
  @RequirePermission('property.import')
  batch(@Param('batchId') batchId: string, @Query() query: any) {
    return this.imports.getBatch(batchId, query);
  }

  @Get('import/:batchId/errors')
  @RequirePermission('property.import')
  errors(@Param('batchId') batchId: string) {
    return this.imports.getErrors(batchId);
  }

  @Get()
  @RequirePermission('property.view')
  list(@Query('search') search?: string) {
    return this.properties.list(search);
  }

  @Get('rooms/list')
  @RequirePermission('property.view')
  rooms(@Query() query: any) {
    return this.properties.listRooms(query);
  }

  @Get('rooms/export')
  @RequirePermission('property.view')
  exportRooms(@Query('search') search?: string) {
    return this.properties.exportRooms(search);
  }

  @Get('room-options/search')
  @RequirePermission('property.view')
  roomOptions(@Query('search') search?: string) {
    return this.properties.roomOptions(search);
  }

  @Get(':propertyId')
  @RequirePermission('property.view')
  get(@Param('propertyId') propertyId: string) {
    return this.properties.get(propertyId);
  }

  @Patch(':propertyId')
  @RequirePermission('property.edit')
  update(@Param('propertyId') propertyId: string, @Body() body: any, @Req() request: Request) {
    return this.properties.update(propertyId, body, this.actor(request));
  }

  private actor(request: Request) {
    return (request as any).user?.id as string | undefined;
  }
}
