-- Ensure the default RBAC administrator exists.
-- Usage after connecting with psql:
--   \i backend/scripts/ensure-admin.sql
--
-- Default login:
--   username: admin
--   password: admin123

DO $$
DECLARE
  v_admin_id TEXT;
  v_super_role_id TEXT;
  v_permission_id TEXT;
  v_permission TEXT[];
  v_module TEXT;
  v_description TEXT;
  v_permissions TEXT[][] := ARRAY[
    ARRAY['user:view', 'user', '查看用户'],
    ARRAY['user:create', 'user', '创建用户'],
    ARRAY['user:update', 'user', '更新用户'],
    ARRAY['user:delete', 'user', '删除用户'],
    ARRAY['user:reset_password', 'user', '重置密码'],
    ARRAY['role:view', 'role', '查看角色'],
    ARRAY['role:create', 'role', '创建角色'],
    ARRAY['role:update', 'role', '更新角色'],
    ARRAY['role:delete', 'role', '删除角色'],
    ARRAY['property:view', 'property', '查看房产'],
    ARRAY['property:create', 'property', '创建房产'],
    ARRAY['property:update', 'property', '更新房产'],
    ARRAY['property:delete', 'property', '删除房产'],
    ARRAY['tenant:view', 'tenant', '查看租户'],
    ARRAY['tenant:create', 'tenant', '创建租户'],
    ARRAY['tenant:update', 'tenant', '更新租户'],
    ARRAY['tenant:delete', 'tenant', '删除租户'],
    ARRAY['payment:view', 'payment', '查看出入金'],
    ARRAY['payment:create', 'payment', '创建出入金'],
    ARRAY['payment:update', 'payment', '更新出入金'],
    ARRAY['payment:delete', 'payment', '删除出入金'],
    ARRAY['payment:export', 'payment', '导出财务'],
    ARRAY['reconciliation:view', 'reconciliation', '查看对账'],
    ARRAY['reconciliation:execute', 'reconciliation', '执行对账'],
    ARRAY['reconciliation:confirm', 'reconciliation', '确认对账'],
    ARRAY['ocr:execute', 'ocr', '执行OCR'],
    ARRAY['audit_log:view', 'audit', '查看日志']
  ];
BEGIN
  INSERT INTO "Role" ("id", "name", "code", "description", "isSystem", "isActive", "dataScope", "createdAt", "updatedAt")
  VALUES (md5(random()::text || clock_timestamp()::text), '超级管理员', 'SUPER_ADMIN', '系统超级管理员', true, true, 'ALL', now(), now())
  ON CONFLICT ("code") DO UPDATE SET
    "name" = EXCLUDED."name",
    "description" = EXCLUDED."description",
    "isSystem" = true,
    "isActive" = true,
    "dataScope" = 'ALL',
    "updatedAt" = now()
  RETURNING "id" INTO v_super_role_id;

  FOREACH v_permission SLICE 1 IN ARRAY v_permissions LOOP
    v_module := v_permission[2];
    v_description := v_permission[3];

    INSERT INTO "Permission" ("id", "key", "module", "description", "createdAt", "updatedAt")
    VALUES (md5(random()::text || clock_timestamp()::text), v_permission[1], v_module, v_description, now(), now())
    ON CONFLICT ("key") DO UPDATE SET
      "module" = EXCLUDED."module",
      "description" = EXCLUDED."description",
      "updatedAt" = now();
  END LOOP;

  INSERT INTO "User" (
    "id", "username", "email", "name", "passwordHash", "role", "isActive",
    "defaultDataScope", "defaultDataScopeValue", "createdAt", "updatedAt"
  )
  VALUES (
    md5(random()::text || clock_timestamp()::text),
    'admin',
    NULL,
    'System Admin',
    '240be518fabd2724d2f79524080cb2c5d563550a03d4f62d4898e71b0a39fef7',
    'SUPER_ADMIN',
    true,
    'ALL',
    NULL,
    now(),
    now()
  )
  ON CONFLICT ("username") DO UPDATE SET
    "name" = 'System Admin',
    "passwordHash" = '240be518fabd2724d2f79524080cb2c5d563550a03d4f62d4898e71b0a39fef7',
    "role" = 'SUPER_ADMIN',
    "isActive" = true,
    "defaultDataScope" = 'ALL',
    "defaultDataScopeValue" = NULL,
    "updatedAt" = now()
  RETURNING "id" INTO v_admin_id;

  INSERT INTO "UserRole" ("id", "userId", "roleId", "createdAt")
  VALUES (md5(random()::text || clock_timestamp()::text), v_admin_id, v_super_role_id, now())
  ON CONFLICT ("userId", "roleId") DO NOTHING;

  FOR v_permission_id IN SELECT "id" FROM "Permission" LOOP
    INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt")
    VALUES (md5(random()::text || clock_timestamp()::text), v_super_role_id, v_permission_id, now())
    ON CONFLICT ("roleId", "permissionId") DO NOTHING;
  END LOOP;

  INSERT INTO "RbacAuditLog" ("id", "userId", "action", "module", "targetId", "details", "createdAt")
  VALUES (
    md5(random()::text || clock_timestamp()::text),
    v_admin_id,
    'upsert',
    'auth',
    v_admin_id,
    'Admin account ensured from psql script',
    now()
  );

  RAISE NOTICE 'Admin account ready: username=admin password=admin123 userId=%', v_admin_id;
END $$;
