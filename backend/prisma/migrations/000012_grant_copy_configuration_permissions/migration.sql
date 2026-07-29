-- Ensure copy configuration is available to existing system administrators.
INSERT INTO "Permission" ("id", "key", "module", "description", "createdAt", "updatedAt")
VALUES
  ('perm_i18n_translation_view', 'i18n.translation.view', 'i18n', '查看文案配置', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_i18n_translation_edit', 'i18n.translation.edit', 'i18n', '编辑文案配置', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_i18n_translation_import', 'i18n.translation.import', 'i18n', '导入文案配置', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_i18n_translation_export', 'i18n.translation.export', 'i18n', '导出文案配置', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_i18n_translation_publish', 'i18n.translation.publish', 'i18n', '发布文案配置', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET
  "module" = EXCLUDED."module",
  "description" = EXCLUDED."description",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt")
SELECT
  md5(role."id" || permission."id" || 'copy-configuration'),
  role."id",
  permission."id",
  CURRENT_TIMESTAMP
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."code" IN ('SUPER_ADMIN', 'ADMIN')
  AND permission."key" IN (
    'i18n.translation.view',
    'i18n.translation.edit',
    'i18n.translation.import',
    'i18n.translation.export',
    'i18n.translation.publish'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
