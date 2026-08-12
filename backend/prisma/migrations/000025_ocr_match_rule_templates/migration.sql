CREATE TABLE "OcrMatchRuleTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "configurationJson" JSONB NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OcrMatchRuleTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OcrMatchRuleTemplate_createdByUserId_name_key"
  ON "OcrMatchRuleTemplate"("createdByUserId", "name");
CREATE INDEX "OcrMatchRuleTemplate_createdByUserId_isActive_idx"
  ON "OcrMatchRuleTemplate"("createdByUserId", "isActive");

ALTER TABLE "OcrMatchRuleTemplate"
  ADD CONSTRAINT "OcrMatchRuleTemplate_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
