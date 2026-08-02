UPDATE "BankStatementAiProvider"
SET
  "transport" = 'OPENAI_CHAT_COMPLETIONS',
  "apiPath" = '/compatible-mode/v1/chat/completions',
  "modelName" = 'qwen3-vl-plus',
  "structuringModelName" = NULL,
  "structuringApiPath" = NULL,
  "supportsPdfInput" = TRUE,
  "supportsStructuredJson" = TRUE,
  "supportsJapanese" = TRUE,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "providerType" = 'QWEN';
