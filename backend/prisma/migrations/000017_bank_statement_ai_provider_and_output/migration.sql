ALTER TABLE "BankStatementScanTask"
  ADD COLUMN "generatedFilename" TEXT,
  ADD COLUMN "generatedStorageKey" TEXT,
  ADD COLUMN "reconciliationBatchId" TEXT;

CREATE TABLE "BankStatementAiProvider" (
  "id" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "providerType" TEXT NOT NULL,
  "transport" TEXT NOT NULL DEFAULT 'OPENAI_RESPONSES',
  "baseUrl" TEXT NOT NULL,
  "apiPath" TEXT NOT NULL DEFAULT '/v1/responses',
  "modelName" TEXT NOT NULL,
  "encryptedApiKey" TEXT,
  "apiKeyLastFour" TEXT,
  "supportsPdfInput" BOOLEAN NOT NULL DEFAULT true,
  "supportsStructuredJson" BOOLEAN NOT NULL DEFAULT true,
  "supportsJapanese" BOOLEAN NOT NULL DEFAULT true,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "timeoutMs" INTEGER NOT NULL DEFAULT 120000,
  "maxRetries" INTEGER NOT NULL DEFAULT 2,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BankStatementAiProvider_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BankStatementAiProvider_enabled_isDefault_idx" ON "BankStatementAiProvider"("enabled", "isDefault");
CREATE INDEX "BankStatementAiProvider_providerType_idx" ON "BankStatementAiProvider"("providerType");

INSERT INTO "Permission" ("id", "key", "module", "description", "createdAt", "updatedAt")
VALUES ('perm_reconciliation_bank_ai_provider_manage', 'reconciliation.bank.ai-provider.manage', 'reconciliation', 'Manage bank statement AI providers', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt")
SELECT 'rp_' || role."code" || '_bank_ai_provider', role."id", permission."id", CURRENT_TIMESTAMP
FROM "Role" role
JOIN "Permission" permission ON permission."key" = 'reconciliation.bank.ai-provider.manage'
WHERE role."code" IN ('SUPER_ADMIN', 'ADMIN')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
