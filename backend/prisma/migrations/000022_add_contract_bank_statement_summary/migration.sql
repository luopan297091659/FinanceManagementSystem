ALTER TABLE "Contract"
  ADD COLUMN "bankStatementSummary" TEXT;

CREATE INDEX "Contract_bankStatementSummary_idx"
  ON "Contract"("bankStatementSummary");
