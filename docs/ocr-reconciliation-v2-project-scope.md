# OCR 对账 V2：当前项目落地范围

本轮只优化“AI 分析 → OCR 对账”，不改变财务中心其他入出金流程，也不让 AI 直接写入会计金额。

## 当前数据与 V2 概念的对应关系

- 银行原文：OCR 回调记录的 `counterpartyRaw`、`contentSummary`，始终保留原始字符。
- 付款身份：`ContractPaymentAlias`，用于保存人工确认过的银行付款名义及确认次数。
- 应收候选：有效期内的 `Contract`，当前应收金额使用 `monthlyPaymentTotal`（月租、管理费及三个其他月费的合计）。
- 对账结果：OCR 记录中的 `systemMatch`。组合匹配时包含 `contractIds`、`allocations`、`identityScore`、`allocationScore`、`allocatedAmount`、`unallocatedAmount` 和 `difference`。

## 本轮确定性匹配流程

1. 支出记录直接排除，不参与租金入金匹配。
2. 保留 OCR 原文，并生成全半角统一、平假名转片假名、法人简称清理和浊音不敏感的比较形式。
3. 对漏一个假名、浊音/半浊音误识别进行受控容错；容错匹配不会被标记为 100% OCR 一致。
4. 先检查单份契约精确金额匹配，单份命中优先。
5. 单份未命中时，仅在同一付款身份候选及契约有效期范围内，依次搜索 2、3、4、5 份契约组合。
6. 组合总额必须与银行入金严格一致；不使用 AI 计算或修改金额。
7. 只有组合唯一时自动匹配；存在多个同分精确组合时标记为 `AMBIGUOUS`，交由人工确认。
8. 人工确认单份契约后，将 OCR 付款名义写入或强化 `ContractPaymentAlias`，供后续对账复用。

## 组合匹配结果示例

```json
{
  "status": "MATCHED",
  "matchMode": "AUTO",
  "matchType": "COMBINATION",
  "identityScore": 94,
  "allocationScore": 100,
  "bankAmount": 215000,
  "allocatedAmount": 215000,
  "unallocatedAmount": 0,
  "difference": 0,
  "contractIds": ["contract-a", "contract-b"],
  "allocations": [
    { "contractId": "contract-a", "allocatedAmount": 85000 },
    { "contractId": "contract-b", "allocatedAmount": 130000 }
  ]
}
```

## 明确不在本轮范围

- 部分付款、超额付款、少额付款及手续费调整的自动入账。
- 新建完整的 Receivable、Reconciliation、ReconciliationAllocation 数据库领域模型。
- 让 LLM 决定余额、分配金额或会计状态。

这些能力可在后续财务分配阶段建设；当前系统遇到非零差额时仍保留人工确认，避免猜测性对账。
