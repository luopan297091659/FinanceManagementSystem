import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { RequirePermission } from '../rbac/permissions.decorator';
import { I18nService } from './i18n.service';

@Controller()
export class I18nController {
  constructor(private readonly i18n: I18nService) {}

  @Get('i18n/locales')
  locales() {
    return this.i18n.locales();
  }

  @Get('i18n/translations/:locale')
  translations(@Param('locale') locale: string, @Query('version') version?: string) {
    return this.i18n.publishedTranslations(locale, version);
  }

  @Get('admin/i18n/translations')
  @RequirePermission('i18n.translation.view')
  listAdmin(@Query() query: any) {
    return this.i18n.listAdmin(query);
  }

  @Post('admin/i18n/translations')
  @RequirePermission('i18n.translation.edit')
  create(@Body() body: any, @Req() request: Request) {
    return this.i18n.createEntry(body, this.actorUserId(request));
  }

  @Patch('admin/i18n/translations/:id')
  @RequirePermission('i18n.translation.edit')
  update(@Param('id') id: string, @Body() body: any, @Req() request: Request) {
    return this.i18n.updateEntry(id, body, this.actorUserId(request));
  }

  @Post('admin/i18n/import')
  @RequirePermission('i18n.translation.import')
  import(@Body() body: any, @Req() request: Request) {
    if (body?.preview) return this.i18n.importPreview(body.rows ?? [], body.version);
    return this.i18n.importCommit(body.rows ?? [], { version: body.version, mode: body.mode }, this.actorUserId(request));
  }

  @Get('admin/i18n/export')
  @RequirePermission('i18n.translation.export')
  export(@Query() query: any) {
    return this.i18n.exportEntries(query);
  }

  @Post('admin/i18n/publish')
  @RequirePermission('i18n.translation.publish')
  publish(@Body() body: any, @Req() request: Request) {
    return this.i18n.publish(body.version, this.actorUserId(request));
  }

  @Get('admin/i18n/versions')
  @RequirePermission('i18n.translation.view')
  versions() {
    return this.i18n.versions();
  }

  @Post('admin/i18n/versions/:version/rollback')
  @RequirePermission('i18n.translation.publish')
  rollback(@Param('version') version: string, @Req() request: Request) {
    return this.i18n.rollback(version, this.actorUserId(request));
  }

  private actorUserId(request: Request) {
    return (request as any).user?.id as string | undefined;
  }
}
