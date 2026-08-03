# OCR LLM 工作流 Webhook 与回调协议

## 1. 系统调用 Make Webhook

请求方法为 `POST`，内容类型为 `multipart/form-data`。系统不手工设置 `Content-Type`，由 HTTP 客户端自动生成包含 boundary 的请求头。

字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `taskId` | text | 系统任务编号 |
| `sessionId` | text | 本次执行的唯一会话编号，推荐 Make 使用此字段 |
| `seesinId` | text | 与 `sessionId` 值相同，兼容已有场景中的拼写 |
| `taskName` | text | 用户填写的本次执行任务名称 |
| `callbackUrl` | text | Make 完成后应调用的系统 JSON 回调地址 |
| `requestFile` | file，可重复 | 所有本地文件均使用这个字段名发送，不限制文件个数 |

等效请求示例：

```powershell
curl.exe -X POST "https://hook.eu1.make.com/your-hook" `
  -F "taskId=OCR-1720000000000-abcd1234" `
  -F "sessionId=4be2e455-b0a8-43cc-b603-4a09cf36c954" `
  -F "seesinId=4be2e455-b0a8-43cc-b603-4a09cf36c954" `
  -F "taskName=2026年8月合同对账" `
  -F "callbackUrl=https://your-domain/api/v1/ocr/callback" `
  -F "requestFile=@D:\requestFile.pdf" `
  -F "requestFile=@D:\doc02618920260710170908.pdf"
```

## 2. Make 回调系统

请求方法为 `POST`，请求头必须包含 `Content-Type: application/json`。推荐 JSON：

```json
{
  "sessionId": "4be2e455-b0a8-43cc-b603-4a09cf36c954",
  "status": "SUCCESS",
  "records": [
    {
      "original_file_name": "requestFile.pdf",
      "date": "2026-08-03",
      "summary": "8月租金",
      "amount": 120000,
      "tenant_name": "山田太郎",
      "owner_name": "佐藤花子",
      "property_name": "中央大厦",
      "room_number": "101",
      "contract_number": "CT-2026-001"
    }
  ]
}
```

系统也接受 `seesinId` 或 `taskId` 作为关联键，并兼容 `results`、`data.records`、`data.results` 数组。失败时使用：

```json
{
  "sessionId": "4be2e455-b0a8-43cc-b603-4a09cf36c954",
  "status": "FAILED",
  "error": "OCR provider timeout"
}
```

回调记录会按租客姓名、业主姓名、房间号/物业名、合同编号匹配系统数据。唯一候选为自动匹配；无候选或多候选进入人工确认。
