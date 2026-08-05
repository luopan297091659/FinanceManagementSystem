ALTER TABLE "Transaction"
  ADD COLUMN "contractId" TEXT,
  ADD COLUMN "transactionCategory" TEXT,
  ADD COLUMN "financialInstitutionName" TEXT,
  ADD COLUMN "bankBranchName" TEXT,
  ADD COLUMN "manuallyReconciled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reconciledByUserId" TEXT,
  ADD COLUMN "reconciledByName" TEXT,
  ADD COLUMN "reconciledAt" TIMESTAMP(3);

ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "Contract"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Transaction_contractId_date_idx"
  ON "Transaction"("contractId", "date");

CREATE INDEX "Transaction_manuallyReconciled_reconciledAt_idx"
  ON "Transaction"("manuallyReconciled", "reconciledAt");

ALTER TABLE "BankTransaction"
  ADD COLUMN "transactionCategory" TEXT,
  ADD COLUMN "financialInstitutionName" TEXT,
  ADD COLUMN "branchName" TEXT;

ALTER TABLE "ReconciliationRecord"
  ADD COLUMN "withdrawalAmount" DECIMAL(18,2),
  ADD COLUMN "financialInstitutionName" TEXT,
  ADD COLUMN "bankBranchName" TEXT;

UPDATE "Transaction" AS txn
SET
  "contractId" = record."contractId",
  "manuallyReconciled" = (record."matchMode" = 'MANUAL'),
  "reconciledByUserId" = record."submittedBy",
  "reconciledByName" = COALESCE(
    (SELECT app_user."name" FROM "User" AS app_user WHERE app_user."id" = record."submittedBy"),
    record."submittedBy"
  ),
  "reconciledAt" = record."submittedAt"
FROM "ReconciliationRecord" AS record
WHERE record."targetTable" = 'Transaction'
  AND record."targetRecordId" = txn."id";
