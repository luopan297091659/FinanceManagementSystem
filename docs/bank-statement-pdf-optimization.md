# 银行账单 PDF 对账优化实施说明

## 范围

本次优化仅适用于“银行账单对账”。现有“OCR 对账”页面、`/ocr` 接口、`OcrTask` 数据模型及 Make 工作流保持不变。

银行账单对账保留两种输入方式：

1. 上传现有 Excel、CSV 等表格文件并创建对账批次。
2. 上传银行账单 PDF，经 AI 扫描生成 Excel 后，再进入现有文件选择和批次创建流程。

## 第一阶段已实现

- 在银行账单对账页面增加 Excel/CSV 与 PDF 双入口。
- PDF 前端限制为单文件选择。
- 后端验证 PDF 文件头、结束标记、文件大小、页数和加密状态。
- 使用 SHA-256 检测同一用户的重复上传。
- 原始 PDF 保存到非公开目录 `uploads/bank-statements`。
- 新增独立的 `BankStatementScanTask`，不复用 `OcrTask`。
- 新增扫描任务上传、列表、详情和启动接口。
- 扫描任务按用户隔离，并复用银行对账的 RBAC 权限。
- 上传与进入队列操作写入审计日志。
- API 不返回文件存储路径和校验哈希。

## 接口

```http
POST /api/v1/reconciliation/bank/scans/upload
GET  /api/v1/reconciliation/bank/scans
GET  /api/v1/reconciliation/bank/scans/:scanId
POST /api/v1/reconciliation/bank/scans/:scanId/start
```

## 配置

```text
BANK_STATEMENT_PDF_MAX_MB=25
BANK_STATEMENT_PDF_MAX_PAGES=100
BANK_STATEMENT_PUBLIC_BASE_URL=https://your-public-finance-host.example.com
```

Qwen 需要通过该公网基址读取短期签名 PDF。该值只填写站点 origin，
不要追加 `/api/v1`。PM2 配置允许使用同名环境变量覆盖部署默认值；修改后需使用
`pm2 restart ecosystem.config.cjs --update-env` 让运行进程加载新环境。

## 后续阶段

1. 建立银行账单专属 AI Provider Profile、能力声明和密钥引用。
2. 实现 PDF 页面渲染、预处理和异步作业执行器。
3. 实现 Provider Adapter、逐页结构化抽取、重试与回退。
4. 实现交易行、字段置信度、边界框和人工复核界面。
5. 生成 `.xlsx`，注册为内部文件，并自动传入现有 Select File 步骤。
6. 增加失败页重试、取消、成本统计和 Provider 健康监控。

当前的“开始 AI 扫描”会把任务置为 `QUEUED`，并明确显示正在等待银行账单 Provider Worker。完成后续第 1 至第 3 项前，不会伪造识别结果或自动创建对账批次。
