# Make OpenAI 财务 OCR 配置

## 银行流水对账专用配置

银行流水对账不要继续使用通用财务单据的提示词和超大 Schema。`Generate a response` 模块应成对使用：

- **Text Prompt**：完整粘贴英文版 `make-openai-bank-reconciliation-prompt.txt`
- **Name**：`bank_reconciliation_finance_transaction_v1`
- **Schema**：完整粘贴英文说明版 `make-openai-bank-reconciliation-schema.json`
- **Strict**：开启

该银行专用输出仍使用系统现有的 `finance-transaction-v1` 字段名，因此无需在 Make 回调前改名。其中银行表格的「番号」直接写入 `sequenceNo`；该值允许按日期重新开始或重复，不是 Make 自行生成的数组序号。

系统回调还兼容历史银行结构中的 `transactions`/`rows`、`transactionNumber`/`sequenceNumber`、`depositAmount`/`withdrawalAmount`、`transactionType`、`branchName` 和 `description`。历史输出中的「001」会规范化为系统整数 `sequenceNo = 1`，但新流程仍应优先使用本专用 Schema，避免依赖兼容层。

通用请款书、送金明细、费用单据等非银行流水文件继续使用下方原有配置。

## Generate a response 模块

在 **Advanced settings** 中选择 JSON Schema/Structured Output，并填写：

- **Name**：`finance_transaction_ocr_v1`
- **Schema**：完整粘贴 `make-openai-finance-ocr-schema.json` 的内容
- **Strict**：开启

Schema 文本框中只能放从 `{ "type": "object" ... }` 开始的纯 JSON Schema。不要放 `text`、`format`、`name`、`strict` 外壳，也不要把 `{{43.name}}` 等 Make 映射变量写进 Schema。文件名应在提示词中传入，例如：

```text
请解析上传文件并严格按照 JSON Schema 返回结果。
当前原始文件名：{{43.name}}
sourceFileName 必须原样使用上述文件名。
只输出结构化结果，不要输出 Markdown 或解释文本。
```

Make 会把上述界面配置转换成 OpenAI Responses API 所需的参数：

```json
{
  "text": {
    "format": {
      "type": "json_schema",
      "name": "finance_transaction_ocr_v1",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {},
        "required": [],
        "additionalProperties": false
      }
    }
  }
}
```

如果使用 Make 的 HTTP 模块直接调用 `/v1/responses`，则必须使用上面的完整 `text.format.schema` 外壳，并将 `schema` 的值替换为 `make-openai-finance-ocr-schema.json` 的完整对象。

## 回调模块

多文件结果应先通过 Array aggregator 汇总，再发送到系统。不要使用 Text aggregator 将多个对象拼成字符串。

```json
{
  "taskId": "{{taskId}}",
  "sessionId": "{{sessionId}}",
  "records": [
    "{{每个 OpenAI 模块的 result 对象}}"
  ]
}
```

系统仍兼容历史字符串格式，但标准数组格式更容易在 Make 和 Web 前端中检查。
