DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'ContractStatus'
      AND typnamespace = current_schema()::regnamespace
  ) THEN
    CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'ContractStatus'
      AND t.typnamespace = current_schema()::regnamespace
      AND e.enumlabel = 'FUTURE'
  ) THEN
    ALTER TYPE "ContractStatus" ADD VALUE 'FUTURE';
  END IF;
END $$;

CREATE TYPE "ReconciliationBatchStatus" AS ENUM (
  'PENDING',
  'UPLOADED',
  'PARSING',
  'PARSED',
  'MATCHING',
  'MANUAL_REVIEW',
  'PARTIAL_COMPLETED',
  'COMPLETED',
  'FAILED'
);

CREATE TYPE "ReconciliationRecordMatchMode" AS ENUM (
  'AUTO',
  'MANUAL',
  'UNMATCHED'
);

CREATE TYPE "ReconciliationRecordMatchStatus" AS ENUM (
  'AUTO_MATCHED',
  'MANUAL_MATCHED',
  'MANUAL_REVIEW',
  'UNMATCHED',
  'SUBMITTED',
  'FAILED'
);

CREATE TYPE "ContractPartyType" AS ENUM (
  'CONTRACTOR',
  'PAYER',
  'TENANT',
  'GUARANTOR'
);

CREATE TYPE "TranslationStatus" AS ENUM (
  'DRAFT',
  'PUBLISHED',
  'DISABLED'
);

CREATE TABLE "ContractPaymentAlias" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "payerName" TEXT,
  "originalBankSummary" TEXT,
  "normalizedBankSummary" TEXT NOT NULL,
  "validFrom" TIMESTAMP(3),
  "validTo" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "confirmedCount" INTEGER NOT NULL DEFAULT 0,
  "lastConfirmedAt" TIMESTAMP(3),
  "remark" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContractPaymentAlias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContractPartyHistory" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "partyType" "ContractPartyType" NOT NULL,
  "partyId" TEXT,
  "partyName" TEXT NOT NULL,
  "validFrom" TIMESTAMP(3),
  "validTo" TIMESTAMP(3),
  "changeReason" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContractPartyHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReconciliationBatch" (
  "id" TEXT NOT NULL,
  "batchNo" TEXT NOT NULL,
  "status" "ReconciliationBatchStatus" NOT NULL DEFAULT 'PENDING',
  "matchingRulesJson" JSONB,
  "totalRecords" INTEGER NOT NULL DEFAULT 0,
  "autoMatchedCount" INTEGER NOT NULL DEFAULT 0,
  "manualMatchedCount" INTEGER NOT NULL DEFAULT 0,
  "unmatchedCount" INTEGER NOT NULL DEFAULT 0,
  "submittedCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "uploadedBy" TEXT,
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReconciliationBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReconciliationSourceFile" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileType" TEXT,
  "fileSize" INTEGER,
  "fileHash" TEXT NOT NULL,
  "storageKey" TEXT,
  "rawMetadata" JSONB,
  "uploadedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReconciliationSourceFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReconciliationRecord" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "sourceFileId" TEXT,
  "sourcePage" INTEGER,
  "sourceRow" INTEGER,
  "sourceDataJson" JSONB NOT NULL,
  "transactionDate" TIMESTAMP(3),
  "depositAmount" DECIMAL(18,2),
  "originalBankSummary" TEXT,
  "normalizedBankSummary" TEXT,
  "registeredBankSummaryName" TEXT,
  "propertyId" TEXT,
  "roomId" TEXT,
  "contractId" TEXT,
  "contractorId" TEXT,
  "contractorName" TEXT,
  "payerId" TEXT,
  "payerName" TEXT,
  "paymentMonth" TEXT,
  "matchMode" "ReconciliationRecordMatchMode" NOT NULL DEFAULT 'UNMATCHED',
  "matchScore" INTEGER,
  "matchStatus" "ReconciliationRecordMatchStatus" NOT NULL DEFAULT 'UNMATCHED',
  "matchReason" TEXT,
  "matchingRulesJson" JSONB,
  "targetTable" TEXT,
  "targetRecordId" TEXT,
  "bankTransactionId" TEXT,
  "transactionCategory" TEXT,
  "feeType" TEXT,
  "remark" TEXT,
  "recordHash" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3),
  "submittedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReconciliationRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TranslationEntry" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "description" TEXT,
  "version" TEXT NOT NULL,
  "status" "TranslationStatus" NOT NULL DEFAULT 'DRAFT',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TranslationEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReconciliationBatch_batchNo_key" ON "ReconciliationBatch"("batchNo");
CREATE INDEX "ContractPaymentAlias_contractId_idx" ON "ContractPaymentAlias"("contractId");
CREATE INDEX "ContractPaymentAlias_normalizedBankSummary_idx" ON "ContractPaymentAlias"("normalizedBankSummary");
CREATE INDEX "ContractPartyHistory_contractId_partyType_idx" ON "ContractPartyHistory"("contractId", "partyType");
CREATE INDEX "ContractPartyHistory_partyId_idx" ON "ContractPartyHistory"("partyId");
CREATE INDEX "ReconciliationBatch_status_createdAt_idx" ON "ReconciliationBatch"("status", "createdAt");
CREATE INDEX "ReconciliationSourceFile_batchId_idx" ON "ReconciliationSourceFile"("batchId");
CREATE INDEX "ReconciliationSourceFile_fileHash_idx" ON "ReconciliationSourceFile"("fileHash");
CREATE INDEX "ReconciliationRecord_batchId_idx" ON "ReconciliationRecord"("batchId");
CREATE INDEX "ReconciliationRecord_sourceFileId_idx" ON "ReconciliationRecord"("sourceFileId");
CREATE INDEX "ReconciliationRecord_matchStatus_idx" ON "ReconciliationRecord"("matchStatus");
CREATE INDEX "ReconciliationRecord_normalizedBankSummary_idx" ON "ReconciliationRecord"("normalizedBankSummary");
CREATE INDEX "ReconciliationRecord_transactionDate_idx" ON "ReconciliationRecord"("transactionDate");
CREATE INDEX "ReconciliationRecord_recordHash_idx" ON "ReconciliationRecord"("recordHash");
CREATE INDEX "ReconciliationRecord_targetTable_targetRecordId_idx" ON "ReconciliationRecord"("targetTable", "targetRecordId");
CREATE INDEX "ReconciliationRecord_propertyId_roomId_idx" ON "ReconciliationRecord"("propertyId", "roomId");
CREATE INDEX "ReconciliationRecord_contractId_idx" ON "ReconciliationRecord"("contractId");
CREATE UNIQUE INDEX "TranslationEntry_key_locale_version_key" ON "TranslationEntry"("key", "locale", "version");
CREATE INDEX "TranslationEntry_module_idx" ON "TranslationEntry"("module");
CREATE INDEX "TranslationEntry_locale_idx" ON "TranslationEntry"("locale");
CREATE INDEX "TranslationEntry_status_idx" ON "TranslationEntry"("status");

ALTER TABLE "ContractPaymentAlias" ADD CONSTRAINT "ContractPaymentAlias_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContractPartyHistory" ADD CONSTRAINT "ContractPartyHistory_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReconciliationSourceFile" ADD CONSTRAINT "ReconciliationSourceFile_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ReconciliationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReconciliationRecord" ADD CONSTRAINT "ReconciliationRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ReconciliationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReconciliationRecord" ADD CONSTRAINT "ReconciliationRecord_sourceFileId_fkey" FOREIGN KEY ("sourceFileId") REFERENCES "ReconciliationSourceFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReconciliationRecord" ADD CONSTRAINT "ReconciliationRecord_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReconciliationRecord" ADD CONSTRAINT "ReconciliationRecord_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReconciliationRecord" ADD CONSTRAINT "ReconciliationRecord_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReconciliationRecord" ADD CONSTRAINT "ReconciliationRecord_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "key", "module", "description", "createdAt", "updatedAt")
VALUES
  ('perm_reconciliation_bank_view', 'reconciliation.bank.view', 'reconciliation', 'View bank reconciliation', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_reconciliation_bank_upload', 'reconciliation.bank.upload', 'reconciliation', 'Upload bank statement files', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_reconciliation_bank_parse', 'reconciliation.bank.parse', 'reconciliation', 'Parse bank statement files', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_reconciliation_bank_match', 'reconciliation.bank.match', 'reconciliation', 'Run bank reconciliation matching', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_reconciliation_bank_review', 'reconciliation.bank.review', 'reconciliation', 'Review bank reconciliation records', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_reconciliation_bank_edit', 'reconciliation.bank.edit', 'reconciliation', 'Edit bank reconciliation records', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_reconciliation_bank_submit', 'reconciliation.bank.submit', 'reconciliation', 'Submit bank reconciliation records', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_reconciliation_bank_export', 'reconciliation.bank.export', 'reconciliation', 'Export bank reconciliation results', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_reconciliation_bank_history', 'reconciliation.bank.history', 'reconciliation', 'View bank reconciliation history', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_reconciliation_bank_master_data_sync', 'reconciliation.bank.master-data.sync', 'reconciliation', 'Sync bank reconciliation master data', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_reconciliation_ocr_view', 'reconciliation.ocr.view', 'reconciliation', 'View OCR reconciliation', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_i18n_translation_view', 'i18n.translation.view', 'i18n', 'View translation entries', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_i18n_translation_edit', 'i18n.translation.edit', 'i18n', 'Edit translation entries', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_i18n_translation_import', 'i18n.translation.import', 'i18n', 'Import translation entries', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_i18n_translation_export', 'i18n.translation.export', 'i18n', 'Export translation entries', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_i18n_translation_publish', 'i18n.translation.publish', 'i18n', 'Publish translation versions', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt")
SELECT 'rp_' || r."code" || '_' || p."id", r."id", p."id", CURRENT_TIMESTAMP
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."code" IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE')
  AND p."key" IN (
    'reconciliation.bank.view',
    'reconciliation.bank.upload',
    'reconciliation.bank.parse',
    'reconciliation.bank.match',
    'reconciliation.bank.review',
    'reconciliation.bank.edit',
    'reconciliation.bank.submit',
    'reconciliation.bank.export',
    'reconciliation.bank.history',
    'reconciliation.bank.master-data.sync',
    'reconciliation.ocr.view',
    'i18n.translation.view',
    'i18n.translation.edit',
    'i18n.translation.import',
    'i18n.translation.export',
    'i18n.translation.publish'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
