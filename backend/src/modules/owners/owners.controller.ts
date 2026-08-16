import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { RequirePermission } from '../rbac/permissions.decorator';
import { OwnersService } from './owners.service';

@Controller('owners')
export class OwnersController {
  constructor(private readonly owners: OwnersService) {}

  @Get()
  @RequirePermission('property.owner.view')
  list(@Query() query: Record<string, unknown>) {
    return this.owners.list(query);
  }

  @Get(':ownerId')
  @RequirePermission('property.owner.view')
  get(@Param('ownerId') ownerId: string) {
    return this.owners.get(ownerId);
  }

  @Post()
  @RequirePermission('property.owner.edit')
  create(@Body() body: Record<string, unknown>, @Req() request: Request) {
    return this.owners.create(body, this.actor(request));
  }

  @Patch(':ownerId')
  @RequirePermission('property.owner.edit')
  update(@Param('ownerId') ownerId: string, @Body() body: Record<string, unknown>, @Req() request: Request) {
    return this.owners.update(ownerId, body, this.actor(request));
  }

  @Post('import')
  @RequirePermission('property.owner.edit')
  import(@Body() body: Record<string, unknown>, @Req() request: Request) {
    return this.owners.importRows(body, this.actor(request));
  }

  @Post(':ownerId/rooms')
  @RequirePermission('property.owner.edit')
  attachRooms(@Param('ownerId') ownerId: string, @Body() body: Record<string, unknown>, @Req() request: Request) {
    return this.owners.attachRooms(ownerId, body, this.actor(request));
  }

  @Delete(':ownerId/rooms/:roomId')
  @RequirePermission('property.owner.edit')
  detachRoom(@Param('ownerId') ownerId: string, @Param('roomId') roomId: string, @Req() request: Request) {
    return this.owners.detachRoom(ownerId, roomId, this.actor(request));
  }

  private actor(request: Request) {
    return (request as any).user?.id as string | undefined;
  }
}
