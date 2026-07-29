-- Incremental integrated property + contract management support.
-- Existing Property, Room, Tenant and Contract data is retained and backfilled.
ALTER TYPE "ContractStatus" ADD VALUE IF NOT EXISTS 'CANCELLATION_SETTLEMENT';

ALTER TABLE "PropertyImportBatch"
  ADD COLUMN "importType" TEXT NOT NULL DEFAULT 'PROPERTY';

ALTER TABLE "Contract"
  ADD COLUMN "propertyId" TEXT,
  ADD COLUMN "externalContractId" TEXT,
  ADD COLUMN "contractorName" TEXT,
  ADD COLUMN "contractorNameKana" TEXT,
  ADD COLUMN "contractorType" TEXT,
  ADD COLUMN "payerName" TEXT,
  ADD COLUMN "payerNameKana" TEXT,
  ADD COLUMN "bankSummaryName" TEXT,
  ADD COLUMN "paymentMethod" TEXT,
  ADD COLUMN "paymentMonthType" TEXT,
  ADD COLUMN "guaranteeDeposit" DECIMAL(18,2),
  ADD COLUMN "keyReplacementFee" DECIMAL(18,2),
  ADD COLUMN "renewalAdministrativeFee" DECIMAL(18,2),
  ADD COLUMN "guaranteeCompanyName" TEXT,
  ADD COLUMN "guaranteeCompanyNameKana" TEXT,
  ADD COLUMN "insuranceName" TEXT,
  ADD COLUMN "insuranceFee" DECIMAL(18,2),
  ADD COLUMN "insurancePeriod" TEXT,
  ADD COLUMN "insuranceStartDate" TIMESTAMP(3),
  ADD COLUMN "insuranceEndDate" TIMESTAMP(3),
  ADD COLUMN "collectionAccount" TEXT,
  ADD COLUMN "managementContractType" TEXT,
  ADD COLUMN "remark" TEXT,
  ADD COLUMN "sourceDataJson" JSONB,
  ADD COLUMN "createdBy" TEXT,
  ADD COLUMN "updatedBy" TEXT,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

UPDATE "Contract" c
SET "propertyId" = r."propertyId"
FROM "Room" r
WHERE c."roomId" = r."id";

UPDATE "Contract" c
SET "contractorName" = COALESCE(c."contractorName", t."name"),
    "contractorNameKana" = COALESCE(c."contractorNameKana", t."nameKana")
FROM "Tenant" t
WHERE c."tenantId" = t."id";

ALTER TABLE "Contract"
  ALTER COLUMN "propertyId" SET NOT NULL,
  ALTER COLUMN "tenantId" DROP NOT NULL,
  ALTER COLUMN "startDate" DROP NOT NULL,
  ALTER COLUMN "monthlyRent" DROP NOT NULL;

CREATE UNIQUE INDEX "Contract_contractNumber_key" ON "Contract"("contractNumber");
CREATE UNIQUE INDEX "Contract_externalContractId_key" ON "Contract"("externalContractId");
CREATE INDEX "Contract_propertyId_idx" ON "Contract"("propertyId");
CREATE INDEX "Contract_bankSummaryName_idx" ON "Contract"("bankSummaryName");
CREATE INDEX "Contract_startDate_endDate_idx" ON "Contract"("startDate", "endDate");
CREATE INDEX "Contract_deletedAt_idx" ON "Contract"("deletedAt");
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ContractCharge" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "chargeType" TEXT NOT NULL,
  "itemName" TEXT NOT NULL,
  "amount" DECIMAL(18,2),
  "monthCount" DECIMAL(8,2),
  "billingMode" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContractCharge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ContractCharge_contractId_idx" ON "ContractCharge"("contractId");
CREATE INDEX "ContractCharge_chargeType_idx" ON "ContractCharge"("chargeType");
ALTER TABLE "ContractCharge" ADD CONSTRAINT "ContractCharge_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PropertyImportRow"
  ADD COLUMN "contractId" TEXT,
  ADD COLUMN "contractAction" TEXT,
  ADD COLUMN "contractStatus" TEXT,
  ADD COLUMN "contractDataJson" JSONB,
  ADD COLUMN "contractConflictReason" TEXT;
CREATE INDEX "PropertyImportRow_contractId_idx" ON "PropertyImportRow"("contractId");
ALTER TABLE "PropertyImportRow" ADD CONSTRAINT "PropertyImportRow_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "ContractPaymentAlias" (
  "id", "contractId", "payerName", "originalBankSummary", "normalizedBankSummary", "isActive", "confirmedCount", "createdAt", "updatedAt"
)
SELECT
  md5(random()::text || clock_timestamp()::text || c."id"), c."id", c."contractorName", c."bankSummaryName",
  lower(regexp_replace(COALESCE(c."bankSummaryName", ''), '[[:space:]　]+', '', 'g')), true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Contract" c
WHERE c."bankSummaryName" IS NOT NULL AND c."bankSummaryName" <> ''
  AND NOT EXISTS (SELECT 1 FROM "ContractPaymentAlias" a WHERE a."contractId" = c."id" AND a."originalBankSummary" = c."bankSummaryName");
