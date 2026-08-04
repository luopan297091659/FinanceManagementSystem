import { Body, Controller, Delete, Get, Logger, Param, Post, Put, Req, UnauthorizedException } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { Request } from 'express';
import { RequirePermission } from './permissions.decorator';
import { EmailSettingsService } from './email-settings.service';

type LoginBody = {
  username?: unknown;
  password?: unknown;
  userName?: unknown;
  account?: unknown;
};

@Controller('rbac')
export class RbacController {
  private readonly logger = new Logger(RbacController.name);

  constructor(
    private readonly rbacService: RbacService,
    private readonly emailSettingsService: EmailSettingsService,
  ) {}

  @Get('me')
  async me(@Req() req: Request) {
    const userId = (req as any).user?.id;
    if (!userId) return { user: null };
    const user = await this.rbacService.getCurrentUser(userId);
    const permissions = await this.rbacService.getUserPermissions(userId);
    return { user, permissions };
  }

  @Post('login')
  async login(@Body() body: LoginBody = {}, @Req() req: Request) {
    this.logger.debug(`Login request body keys: ${Object.keys(body).join(',') || '(empty)'}; content-type: ${req.headers['content-type'] || '(empty)'}`);
    const username = this.normalizeString(body.username ?? body.userName ?? body.account);
    const password = this.normalizeString(body.password);
    if (!username || !password) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const result = await this.rbacService.login(username, password);
    await this.rbacService.logAction(result.user.id, 'login', 'auth', result.user.id, undefined, 'login success');
    return result;
  }

  private normalizeString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
  }

  @Get('roles')
  @RequirePermission('role:view')
  async listRoles() {
    return this.rbacService.listRoles();
  }

  @Get('permissions')
  @RequirePermission('role:view')
  async listPermissions() {
    return this.rbacService.listPermissions();
  }

  @Post('roles')
  @RequirePermission('role:create')
  async createRole(@Body() body: any, @Req() req: Request) {
    const role = await this.rbacService.createRole(body);
    await this.rbacService.logAction((req as any).user?.id ?? null, 'create', 'role', role?.id, req.ip, `Role ${role?.code} created`);
    return role;
  }

  @Put('roles/:id')
  @RequirePermission('role:update')
  async updateRole(@Param('id') id: string, @Body() body: any, @Req() req: Request) {
    const role = await this.rbacService.updateRole(id, body);
    await this.rbacService.logAction((req as any).user?.id ?? null, 'update', 'role', id, req.ip, `Role ${role?.code} updated`);
    return role;
  }

  @Delete('roles/:id')
  @RequirePermission('role:delete')
  async deleteRole(@Param('id') id: string, @Req() req: Request) {
    await this.rbacService.deleteRole(id);
    await this.rbacService.logAction((req as any).user?.id ?? null, 'delete', 'role', id, req.ip, 'Role deleted');
    return { success: true };
  }

  @Get('users')
  @RequirePermission('user:view')
  async listUsers() {
    return this.rbacService.listUsers();
  }

  @Get('users/role-options')
  @RequirePermission('user:view')
  async listUserRoleOptions() {
    return this.rbacService.listUserRoleOptions();
  }

  @Post('users')
  @RequirePermission('user:create')
  async createUser(@Body() body: any, @Req() req: Request) {
    const user = await this.rbacService.createUser(body);
    await this.rbacService.logAction((req as any).user?.id ?? null, 'create', 'user', user?.id, req.ip, `User ${user?.username} created`);
    return user;
  }

  @Put('users/:id')
  @RequirePermission('user:update')
  async updateUser(@Param('id') id: string, @Body() body: any, @Req() req: Request) {
    const user = await this.rbacService.updateUser(id, body);
    await this.rbacService.logAction((req as any).user?.id ?? null, 'update', 'user', id, req.ip, `User ${user?.username} updated`);
    return user;
  }

  @Delete('users/:id')
  @RequirePermission('user:delete')
  async deleteUser(@Param('id') id: string, @Req() req: Request) {
    await this.rbacService.deleteUser(id, (req as any).user?.id ?? null, req.ip);
    return { success: true };
  }

  @Post('password-reset')
  async requestReset(@Body() body: { username: string }) {
    const user = await this.rbacService.getCurrentUserByUsername(body.username);
    if (!user) return { success: false, message: '用户不存在' };
    if (!user.email) return { success: false, message: '当前账号未绑定邮箱，请联系管理员重置密码。' };
    const token = await this.rbacService.createPasswordResetToken(user.id);
    await this.emailSettingsService.sendPasswordResetEmail(user.email, token);
    return { success: true, message: '密码重置邮件已发送，请检查邮箱。' };
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

  @Get('email-settings')
  @RequirePermission('setting:email')
  async getEmailSettings() {
    return this.emailSettingsService.getSettings();
  }

  @Put('email-settings')
  @RequirePermission('setting:email')
  async saveEmailSettings(@Body() body: any, @Req() req: Request) {
    const result = await this.emailSettingsService.saveSettings(body);
    await this.rbacService.logAction((req as any).user?.id ?? null, 'update', 'setting', 'email_settings', req.ip, 'Email settings updated');
    return result;
  }

  @Post('email-settings/test')
  @RequirePermission('setting:email')
  async testEmailSettings(@Body() body: { to?: string }, @Req() req: Request) {
    const result = await this.emailSettingsService.sendTestEmail(body.to || '');
    await this.rbacService.logAction((req as any).user?.id ?? null, 'test', 'setting', 'email_settings', req.ip, `Test email sent to ${body.to || ''}`);
    return result;
  }
}
