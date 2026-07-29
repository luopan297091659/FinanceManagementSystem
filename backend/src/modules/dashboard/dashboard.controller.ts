import { BadRequestException, Body, Controller, Get, Patch, Put, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { RequirePermission } from '../rbac/permissions.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('overview')
  @RequirePermission('overview:view')
  overview(@Req() req: Request, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    const range = this.dashboard.parseRange(startDate, endDate);
    return this.dashboard.getOverview((req as any).user.id, range);
  }

  @Get('config')
  @RequirePermission('overview:view')
  getConfig(@Req() req: Request) {
    return this.dashboard.getConfigForUser((req as any).user.id);
  }

  @Put('config')
  @RequirePermission('dashboard:config')
  updateConfig(@Req() req: Request, @Body() body: { cards?: unknown[] }) {
    if (!Array.isArray(body.cards)) throw new BadRequestException('cards must be an array');
    return this.dashboard.updateConfig((req as any).user.id, body.cards);
  }

  @Patch('reminders/read')
  @RequirePermission('overview:view')
  readReminder(@Req() req: Request, @Body() body: { id?: string }) {
    if (!body.id) throw new BadRequestException('id is required');
    return this.dashboard.updateReminderState((req as any).user.id, body.id, 'read');
  }

  @Patch('reminders/ignore')
  @RequirePermission('overview:view')
  ignoreReminder(@Req() req: Request, @Body() body: { id?: string }) {
    if (!body.id) throw new BadRequestException('id is required');
    return this.dashboard.updateReminderState((req as any).user.id, body.id, 'ignored');
  }
}
