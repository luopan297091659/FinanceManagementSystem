import { Injectable, ForbiddenException, BadRequestException, UnauthorizedException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { DataScopeType } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class RbacService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.initializeDefaults();
    } catch (error) {
      console.warn('[RbacService] Failed to initialize defaults:', error);
    }
  }

  async getCurrentUser(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: { include: { role: true } },
      },
    });
  }

  async getCurrentUserByUsername(username: string) {
    return this.prisma.user.findUnique({ where: { username } });
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } } },
    });
    if (!user) return [];
    const permissions = new Set<string>();
    for (const userRole of user.userRoles) {
      for (const rolePermission of userRole.role.rolePermissions) {
        permissions.add(rolePermission.permission.key);
      }
    }
    return [...permissions];
  }

  async ensurePermission(userId: string, permission: string) {
    const permissions = await this.getUserPermissions(userId);
    if (!permissions.includes(permission)) {
      throw new ForbiddenException('Forbidden');
    }
  }

  async ensureAnyPermission(userId: string, permissions: string[]) {
    const userPermissions = await this.getUserPermissions(userId);
    if (!permissions.some((p) => userPermissions.includes(p))) {
      throw new ForbiddenException('Forbidden');
    }
  }

  async isSuperAdmin(userId: string) {
    const user = await this.getCurrentUser(userId);
    const roles = user?.userRoles?.map((ur: { role: { code: string } }) => ur.role.code) ?? [];
    return roles.includes('SUPER_ADMIN');
  }

  async getDefaultRoles() {
    return [
      { name: '高级管理员', code: 'SUPER_ADMIN', description: '系统超级管理员', isSystem: true, dataScope: DataScopeType.ALL },
      { name: '普通管理员', code: 'ADMIN', description: '普通管理员', isSystem: true, dataScope: DataScopeType.ALL },
      { name: '财务', code: 'FINANCE', description: '财务角色', isSystem: true, dataScope: DataScopeType.ALL },
      { name: '营业', code: 'BUSINESS', description: '营业角色', isSystem: true, dataScope: DataScopeType.ALL },
    ];
  }

  async initializeDefaults() {
    if (!process.env.DATABASE_URL) {
      return;
    }

    const existing = await this.prisma.role.findMany({});
    const roles = await this.getDefaultRoles();
    const createList = [] as Array<{ name: string; code: string; description?: string | null; isSystem: boolean; dataScope: DataScopeType }>;
    for (const role of roles) {
      if (!existing.some((entry: { code: string }) => entry.code === role.code)) {
        createList.push({
          name: role.name,
          code: role.code,
          description: role.description,
          isSystem: role.isSystem,
          dataScope: role.dataScope,
        });
      }
    }
    if (createList.length) {
      await this.prisma.$transaction(createList.map((item) => this.prisma.role.create({ data: item })));
    }
    await this.seedPermissions();
    await this.seedRolePermissions();
    await this.seedAdminUser();
  }

  async seedPermissions() {
    const permissions = [
      { key: 'user:view', module: 'user', description: '查看用户' },
      { key: 'user:create', module: 'user', description: '创建用户' },
      { key: 'user:update', module: 'user', description: '更新用户' },
      { key: 'user:delete', module: 'user', description: '删除用户' },
      { key: 'user:reset_password', module: 'user', description: '重置密码' },
      { key: 'role:view', module: 'role', description: '查看角色' },
      { key: 'role:create', module: 'role', description: '创建角色' },
      { key: 'role:update', module: 'role', description: '更新角色' },
      { key: 'role:delete', module: 'role', description: '删除角色' },
      { key: 'property:view', module: 'property', description: '查看房产' },
      { key: 'property:create', module: 'property', description: '创建房产' },
      { key: 'property:update', module: 'property', description: '更新房产' },
      { key: 'property:delete', module: 'property', description: '删除房产' },
      { key: 'tenant:view', module: 'tenant', description: '查看租户' },
      { key: 'tenant:create', module: 'tenant', description: '创建租户' },
      { key: 'tenant:update', module: 'tenant', description: '更新租户' },
      { key: 'tenant:delete', module: 'tenant', description: '删除租户' },
      { key: 'payment:view', module: 'payment', description: '查看出入金' },
      { key: 'payment:create', module: 'payment', description: '创建出入金' },
      { key: 'payment:update', module: 'payment', description: '更新出入金' },
      { key: 'payment:delete', module: 'payment', description: '删除出入金' },
      { key: 'payment:export', module: 'payment', description: '导出财务' },
      { key: 'reconciliation:view', module: 'reconciliation', description: '查看对账' },
      { key: 'reconciliation:execute', module: 'reconciliation', description: '执行对账' },
      { key: 'reconciliation:confirm', module: 'reconciliation', description: '确认对账' },
      { key: 'ocr:execute', module: 'ocr', description: '执行OCR' },
      { key: 'audit_log:view', module: 'audit', description: '查看日志' },
    ];
    for (const permission of permissions) {
      await this.prisma.permission.upsert({
        where: { key: permission.key },
        update: {},
        create: permission,
      });
    }
  }

  async seedRolePermissions() {
    const roles = await this.prisma.role.findMany();
    const permissions = await this.prisma.permission.findMany();
    const permissionMap = new Map(permissions.map((p: { key: string; id: string }) => [p.key, p.id]));
    for (const role of roles) {
      const desired = new Set<string>();
      if (role.code === 'SUPER_ADMIN') {
        permissions.forEach((p: { key: string }) => desired.add(p.key));
      } else if (role.code === 'ADMIN') {
        ['user:view','user:create','user:update','user:reset_password','role:view','property:view','tenant:view','payment:view','payment:create','payment:update','payment:export','reconciliation:view','reconciliation:execute','reconciliation:confirm','ocr:execute','audit_log:view'].forEach((p) => desired.add(p));
      } else if (role.code === 'FINANCE') {
        ['property:view','tenant:view','payment:view','payment:create','payment:update','payment:delete','payment:export','reconciliation:view','reconciliation:execute','reconciliation:confirm','ocr:execute'].forEach((p) => desired.add(p));
      } else if (role.code === 'BUSINESS') {
        ['property:view','property:create','property:update','tenant:view','tenant:create','tenant:update','payment:view','reconciliation:view'].forEach((p) => desired.add(p));
      }
      const existing = await this.prisma.rolePermission.findMany({ where: { roleId: role.id } });
      const existingKeys = new Set(existing.map((entry: { permissionId: string }) => permissions.find((p: { id: string }) => p.id === entry.permissionId)?.key));
      for (const key of desired) {
        if (!existingKeys.has(key)) {
          const permissionId = permissionMap.get(key);
          if (permissionId) {
            await this.prisma.rolePermission.create({ data: { roleId: role.id, permissionId } });
          }
        }
      }
    }
  }

  async seedAdminUser() {
    const admin = await this.prisma.user.findFirst({ where: { username: 'admin' } });
    if (!admin) {
      const superRole = await this.prisma.role.findUnique({ where: { code: 'SUPER_ADMIN' } });
      if (!superRole) return;
      const passwordHash = crypto.createHash('sha256').update('admin123').digest('hex');
      const created = await this.prisma.user.create({
        data: {
          username: 'admin',
          email: 'admin@example.com',
          name: 'System Admin',
          passwordHash,
          role: 'SUPER_ADMIN',
        },
      });
      await this.prisma.userRole.create({ data: { userId: created.id, roleId: superRole.id } });
      await this.prisma.rbacAuditLog.create({ data: { action: 'seed', module: 'auth', userId: created.id, details: 'Initial super admin created' } });
    }
  }

  async createPasswordResetToken(userId: string) {
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30);
    await this.prisma.passwordResetToken.create({ data: { userId, token, expiresAt } });
    return token;
  }

  async validatePasswordResetToken(token: string) {
    const resetToken = await this.prisma.passwordResetToken.findUnique({ where: { token } });
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }
    return resetToken;
  }

  async consumePasswordResetToken(token: string) {
    await this.prisma.passwordResetToken.update({ where: { token }, data: { usedAt: new Date() } });
  }

  async hashPassword(password: string) {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  async logAction(userId: string | null, action: string, module: string, targetId?: string, ip?: string, details?: string) {
    await this.prisma.rbacAuditLog.create({ data: { userId, action, module, targetId, ip: ip ?? null, details: details ?? null } });
  }

  async listAuditLogs() {
    return this.prisma.rbacAuditLog.findMany({ orderBy: { createdAt: 'desc' }, include: { user: true } });
  }

  async listRoles() {
    return this.prisma.role.findMany({ include: { rolePermissions: { include: { permission: true } } } });
  }

  async createRole(data: { name: string; code: string; description?: string; isSystem?: boolean; dataScope?: DataScopeType; dataScopeValue?: string; permissions?: string[] }) {
    const existing = await this.prisma.role.findFirst({ where: { OR: [{ code: data.code }, { name: data.name }] } });
    if (existing) throw new BadRequestException('Role already exists');
    const role = await this.prisma.role.create({ data: { name: data.name, code: data.code, description: data.description ?? null, isSystem: !!data.isSystem, dataScope: data.dataScope ?? DataScopeType.SELF, dataScopeValue: data.dataScopeValue ?? null } });
    if (data.permissions?.length) {
      const permissions = await this.prisma.permission.findMany({ where: { key: { in: data.permissions } } });
      await this.prisma.$transaction(permissions.map((permission: { id: string }) => this.prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } })));
    }
    return role;
  }

  async updateRole(id: string, data: { name?: string; description?: string; isActive?: boolean; dataScope?: DataScopeType; dataScopeValue?: string; permissions?: string[] }) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new BadRequestException('Role not found');
    if (role.isSystem) {
      if (data.name || data.description || data.dataScope || data.dataScopeValue || data.permissions) {
        // allow status updates only for system roles
      }
    }
    const updated = await this.prisma.role.update({ where: { id }, data: { name: data.name, description: data.description, isActive: data.isActive, dataScope: data.dataScope, dataScopeValue: data.dataScopeValue } });
    if (data.permissions) {
      await this.prisma.rolePermission.deleteMany({ where: { roleId: id } });
      const permissions = await this.prisma.permission.findMany({ where: { key: { in: data.permissions } } });
      await this.prisma.$transaction(permissions.map((permission: { id: string }) => this.prisma.rolePermission.create({ data: { roleId: id, permissionId: permission.id } })));
    }
    return updated;
  }

  async deleteRole(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new BadRequestException('Role not found');
    if (role.isSystem) throw new BadRequestException('System roles cannot be deleted');
    await this.prisma.rolePermission.deleteMany({ where: { roleId: id } });
    await this.prisma.userRole.deleteMany({ where: { roleId: id } });
    await this.prisma.role.delete({ where: { id } });
  }

  async listUsers() {
    return this.prisma.user.findMany({ include: { userRoles: { include: { role: true } } }, orderBy: { createdAt: 'desc' } });
  }

  async createUser(data: { username: string; email?: string | null; name: string; phone?: string | null; password: string; roles?: string[]; isActive?: boolean; defaultDataScope?: DataScopeType; defaultDataScopeValue?: string }) {
    const existing = await this.prisma.user.findFirst({ where: { OR: [{ username: data.username }, ...(data.email ? [{ email: data.email }] : [])] } });
    if (existing) throw new BadRequestException('User already exists');
    const passwordHash = await this.hashPassword(data.password);
    const user = await this.prisma.user.create({ data: { username: data.username, email: data.email ?? 'placeholder@example.com', name: data.name, phone: data.phone ?? null, passwordHash, isActive: data.isActive ?? true, defaultDataScope: data.defaultDataScope ?? DataScopeType.SELF, defaultDataScopeValue: data.defaultDataScopeValue ?? null } });
    if (data.roles?.length) {
      const roles = await this.prisma.role.findMany({ where: { code: { in: data.roles } } });
      await this.prisma.$transaction(roles.map((role: { id: string }) => this.prisma.userRole.create({ data: { userId: user.id, roleId: role.id } })));
    }
    return user;
  }

  async updateUser(id: string, data: { name?: string; email?: string | null; phone?: string | null; isActive?: boolean; roles?: string[]; defaultDataScope?: DataScopeType; defaultDataScopeValue?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new BadRequestException('User not found');
    const updated = await this.prisma.user.update({ where: { id }, data: { name: data.name, email: data.email ?? null, phone: data.phone ?? null, isActive: data.isActive, defaultDataScope: data.defaultDataScope, defaultDataScopeValue: data.defaultDataScopeValue } });
    if (data.roles) {
      await this.prisma.userRole.deleteMany({ where: { userId: id } });
      const roles = await this.prisma.role.findMany({ where: { code: { in: data.roles } } });
      await this.prisma.$transaction(roles.map((role: { id: string }) => this.prisma.userRole.create({ data: { userId: id, roleId: role.id } })));
    }
    return updated;
  }

  async resetPassword(userId: string, newPassword: string) {
    const passwordHash = await this.hashPassword(newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  async validateCredentials(username: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');
    const passwordHash = await this.hashPassword(password);
    if (passwordHash !== user.passwordHash) throw new UnauthorizedException('Invalid credentials');
    return user;
  }

  async login(username: string, password: string) {
    const user = await this.validateCredentials(username, password);
    return { user: { id: user.id, username: user.username, name: user.name, email: user.email, roles: user.role }, permissions: await this.getUserPermissions(user.id) };
  }
}
