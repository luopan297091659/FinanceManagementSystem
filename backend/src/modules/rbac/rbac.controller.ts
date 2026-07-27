import { Body, Controller, Delete, Get, Param, Post, Put, Req } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { Request } from 'express';
import { RequirePermission } from './permissions.decorator';

@Controller('rbac')
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('me')
  async me(@Req() req: Request) {
    const userId = (req as any).user?.id;
    if (!userId) return { user: null };
    const user = await this.rbacService.getCurrentUser(userId);
    const permissions = await this.rbacService.getUserPermissions(userId);
    return { user, permissions };
  }

  @Post('login')
  async login(@Body() body: { username: string; password: string }) {
    const result = await this.rbacService.login(body.username, body.password);
    await this.rbacService.logAction(result.user.id, 'login', 'auth', result.user.id, undefined, 'login success');
    return result;
  }

  @Get('roles')
  @RequirePermission('role:view')
  async listRoles() {
    return this.rbacService.listRoles();
  }

  @Post('roles')
  @RequirePermission('role:create')
  async createRole(@Body() body: any) {
    return this.rbacService.createRole(body);
  }

  @Put('roles/:id')
  @RequirePermission('role:update')
  async updateRole(@Param('id') id: string, @Body() body: any) {
    return this.rbacService.updateRole(id, body);
  }

  @Delete('roles/:id')
  @RequirePermission('role:delete')
  async deleteRole(@Param('id') id: string) {
    await this.rbacService.deleteRole(id);
    return { success: true };
  }

  @Get('users')
  @RequirePermission('user:view')
  async listUsers() {
    return this.rbacService.listUsers();
  }

  @Post('users')
  @RequirePermission('user:create')
  async createUser(@Body() body: any) {
    return this.rbacService.createUser(body);
  }

  @Put('users/:id')
  @RequirePermission('user:update')
  async updateUser(@Param('id') id: string, @Body() body: any) {
    return this.rbacService.updateUser(id, body);
  }

  @Post('password-reset')
  async requestReset(@Body() body: { username: string }) {
    const user = await this.rbacService.getCurrentUserByUsername(body.username);
    if (!user) return { success: false, message: '用户不存在' };
    if (!user.email) return { success: false, message: '当前账号未绑定邮箱，请联系管理员重置密码。' };
    const token = await this.rbacService.createPasswordResetToken(user.id);
    return { success: true, token };
  }

  @Post('password-reset/confirm')
  async confirmReset(@Body() body: { token: string; password: string }) {
    const resetToken = await this.rbacService.validatePasswordResetToken(body.token);
    await this.rbacService.resetPassword(resetToken.userId, body.password);
    await this.rbacService.consumePasswordResetToken(body.token);
    return { success: true };
  }

  @Get('audit-logs')
  @RequirePermission('audit_log:view')
  async logs() {
    return this.rbacService.listAuditLogs();
  }
}
