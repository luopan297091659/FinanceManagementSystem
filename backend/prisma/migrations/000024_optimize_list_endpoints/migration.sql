-- Keep OCR list responses independent from the potentially very large result payload.
ALTER TABLE "OcrTask"
  ADD COLUMN IF NOT EXISTS "resultSummary" JSONB;

UPDATE "OcrTask"
SET "resultSummary" = COALESCE("resultJson"->'summary', "matchedResultJson"->'summary')
WHERE "resultSummary" IS NULL
  AND ("resultJson"->'summary' IS NOT NULL OR "matchedResultJson"->'summary' IS NOT NULL);

-- The management screens use case-insensitive substring search. B-tree indexes
-- cannot serve those predicates, while trigram GIN indexes can.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 000011_optimize_management_search already covers property name/code/address,
-- room code/number/house number, contract number/contractor/payer/bank summary,
-- and the default contract list order. Only add the previously uncovered fields.
CREATE INDEX IF NOT EXISTS "Room_displayName_trgm_idx"
  ON "Room" USING GIN ("displayName" gin_trgm_ops)
  WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "Contract_externalContractId_trgm_idx"
  ON "Contract" USING GIN ("externalContractId" gin_trgm_ops)
  WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "Contract_contractorNameKana_trgm_idx"
  ON "Contract" USING GIN ("contractorNameKana" gin_trgm_ops)
  WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "Contract_payerNameKana_trgm_idx"
  ON "Contract" USING GIN ("payerNameKana" gin_trgm_ops)
  WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "Contract_bankStatementSummary_trgm_idx"
  ON "Contract" USING GIN ("bankStatementSummary" gin_trgm_ops)
  WHERE "deletedAt" IS NULL;
