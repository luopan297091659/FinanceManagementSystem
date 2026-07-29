-- Repair configuration storage for databases whose earlier migrations were only partially applied.
CREATE TABLE IF NOT EXISTS "SystemSetting" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SystemSetting_key_key" ON "SystemSetting"("key");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TranslationStatus') THEN
    CREATE TYPE "TranslationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'DISABLED');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "TranslationEntry" (
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
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TranslationEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TranslationEntry_key_locale_version_key" ON "TranslationEntry"("key", "locale", "version");
CREATE INDEX IF NOT EXISTS "TranslationEntry_module_idx" ON "TranslationEntry"("module");
CREATE INDEX IF NOT EXISTS "TranslationEntry_locale_idx" ON "TranslationEntry"("locale");
CREATE INDEX IF NOT EXISTS "TranslationEntry_status_idx" ON "TranslationEntry"("status");
