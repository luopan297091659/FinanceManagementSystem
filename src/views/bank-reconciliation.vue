<template>
  <section class="page-shell bank-reconciliation-page">
    <div class="page-title-row">
      <div>
        <p class="eyebrow">{{ t.menu.aiReconciliation }}</p>
        <h2>{{ t.menu.bankReconciliation }}</h2>
        <p class="subtle">{{ t.help.subtitle }}</p>
      </div>
      <button class="secondary-button" type="button" @click="loadBatches">{{ t.action.refresh }}</button>
    </div>

    <div class="panel-card">
      <div class="toolbar">
        <label class="file-button">
          {{ selectedFiles.length ? t.action.addFiles : t.action.upload }}
          <input ref="fileInput" type="file" multiple accept=".csv,.tsv,.txt,.html,.xls,.xlsx" @change="selectFiles" />
        </label>
        <button class="primary-button" type="button" :disabled="!selectedFiles.length || loading" @click="uploadRows">{{ t.action.createBatch }}</button>
        <button class="secondary-button" type="button" :disabled="!activeBatchId || loading" @click="runMatch">{{ t.action.match }}</button>
        <button class="primary-button" type="button" :disabled="!activeBatchId || loading" @click="submitBatch">{{ t.action.submit }}</button>
      </div>

      <div class="rule-panel">
        <strong>{{ t.matching.title }}</strong>
        <label v-for="rule in ruleOptions" :key="rule.key">
          <input v-model="matchingRules" type="checkbox" :value="rule.key" />
          {{ rule.label }}
        </label>
      </div>

      <div v-if="selectedFiles.length" class="file-list">
        <span v-for="file in selectedFiles" :key="file.name">{{ file.name }}</span>
      </div>
      <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>
      <p v-if="loading" class="form-hint">{{ t.common.loading }}</p>
    </div>

    <div class="stats-grid">
      <article v-for="stat in stats" :key="stat.key" class="stat-card">
        <span>{{ stat.label }}</span>
        <strong>{{ stat.value }}</strong>
      </article>
    </div>

    <div class="content-grid">
      <aside class="panel-card batch-panel">
        <div class="table-head">
          <strong>{{ t.history.title }}</strong>
          <span>{{ batches.length }}</span>
        </div>
        <button
          v-for="batch in batches"
          :key="batch.id"
          class="batch-row"
          :class="{ active: activeBatchId === batch.id }"
          type="button"
          @click="selectBatch(batch.id)"
        >
          <strong>{{ batch.batchNo }}</strong>
          <span>{{ statusLabel(batch.status) }}</span>
          <small>{{ batch.sourceFiles?.[0]?.fileName || t.history.noFile }}</small>
        </button>
      </aside>

      <section class="panel-card records-panel">
        <div class="table-head">
          <div class="tabs">
            <button v-for="tab in tabs" :key="tab.key" type="button" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">
              {{ tab.label }}
            </button>
          </div>
          <input v-model="searchQuery" class="search-input" type="search" :placeholder="t.action.search" />
        </div>

        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>{{ t.table.source }}</th>
                <th>{{ t.table.date }}</th>
                <th>{{ t.table.summary }}</th>
                <th>{{ t.table.amount }}</th>
                <th>{{ t.table.contract }}</th>
                <th>{{ t.table.status }}</th>
                <th>{{ t.table.remark }}</th>
                <th>{{ t.table.actions }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="record in filteredRecords" :key="record.id">
                <td>{{ record.sourceFileName || "-" }}<br />{{ record.sourcePage || "-" }} / {{ record.sourceRow || "-" }}</td>
                <td><input v-model="record.transactionDate" type="date" @change="saveRecord(record)" /></td>
                <td>
                  <small>{{ record.originalBankSummary || "-" }}</small>
                  <input v-model="record.normalizedBankSummary" @change="saveRecord(record)" />
                </td>
                <td><input v-model="record.depositAmount" inputmode="decimal" @change="saveRecord(record)" /></td>
                <td>
                  <select v-model="record.roomId" @change="loadContracts(record)">
                    <option value="">{{ t.common.select }}</option>
                    <option v-for="room in rooms" :key="room.id" :value="room.id">{{ room.property?.name || room.propertyName || "-" }} / {{ room.roomNumber }}</option>
                  </select>
                  <select v-model="record.contractId" @change="manualMatch(record)">
                    <option value="">{{ t.common.select }}</option>
                    <option v-for="contract in contractsByRecord[record.id] || []" :key="contract.id" :value="contract.id">
                      {{ contract.contractNo || contract.id }} / {{ contract.contractorName }} / {{ contract.startDate }} - {{ contract.endDate || "-" }}
                    </option>
                  </select>
                </td>
                <td>
                  <span class="status-badge" :class="record.matchStatus">{{ matchStatusLabel(record) }}</span>
                  <small>{{ record.matchReason }}</small>
                </td>
                <td><textarea v-model="record.remark" rows="2" @change="saveRecord(record)" /></td>
                <td class="row-actions">
                  <button class="secondary-button mini" type="button" @click="manualMatch(record)">{{ t.action.manualMatch }}</button>
                  <button class="ghost-button mini" type="button" @click="unmatch(record)">{{ t.action.unmatch }}</button>
                </td>
              </tr>
              <tr v-if="!filteredRecords.length">
                <td colspan="8" class="empty-state">{{ t.common.noData }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { locale } from "../i18n";
import { api } from "../services/api";
import { parseTableFile } from "../utils/tableFiles";

const translations = {
  ja: {
    menu: { aiReconciliation: "AI 照合センター", bankReconciliation: "銀行明細照合" },
    help: { subtitle: "銀行入金を物件、部屋、契約、支払名義へ紐付け、明示的な提出まで保持します。" },
    action: { upload: "ファイル選択", addFiles: "ファイル追加", createBatch: "バッチ作成", match: "照合実行", submit: "提出", refresh: "更新", search: "摘要、契約、部屋を検索", manualMatch: "手動確定", unmatch: "未照合へ戻す" },
    matching: { title: "照合条件", summary: "銀行摘要名", amount: "銀行入金額", date: "入金日", month: "入金月", property: "物件", room: "部屋番号", contract: "契約ID" },
    table: { source: "原始ファイル", date: "入金日", summary: "銀行摘要", amount: "入金額", contract: "部屋 / 契約", status: "結果", remark: "備考", actions: "操作" },
    history: { title: "履歴バッチ", noFile: "ファイルなし" },
    status: { AUTO_MATCHED: "100%", MANUAL_MATCHED: "手動", MANUAL_REVIEW: "要確認", UNMATCHED: "未照合", SUBMITTED: "提出済み", FAILED: "失敗" },
    common: { loading: "処理中...", select: "選択してください", noData: "データがありません" },
  },
  zh: {
    menu: { aiReconciliation: "AI 对账中心", bankReconciliation: "银行账单对账" },
    help: { subtitle: "将银行入金追溯到物件、房间、契约书与支付名义，提交前保存在对账主表中。" },
    action: { upload: "选择文件", addFiles: "继续添加", createBatch: "创建批次", match: "执行匹配", submit: "提交", refresh: "刷新", search: "搜索摘要、契约、房间", manualMatch: "手工确认", unmatch: "退回未匹配" },
    matching: { title: "匹配条件", summary: "银行摘要名", amount: "银行入金金额", date: "入金日期", month: "入金月份", property: "物件", room: "部屋番号", contract: "契约书ID" },
    table: { source: "原始文件", date: "入金日期", summary: "银行摘要", amount: "入金金额", contract: "房间 / 契约", status: "结果", remark: "备注", actions: "操作" },
    history: { title: "历史批次", noFile: "无文件" },
    status: { AUTO_MATCHED: "100%", MANUAL_MATCHED: "手工", MANUAL_REVIEW: "待人工", UNMATCHED: "未匹配", SUBMITTED: "已提交", FAILED: "失败" },
    common: { loading: "处理中...", select: "请选择", noData: "暂无数据" },
  },
  en: {
    menu: { aiReconciliation: "AI Reconciliation Center", bankReconciliation: "Bank Statement Reconciliation" },
    help: { subtitle: "Trace bank deposits to property, room, contract, and payment alias before explicit submission." },
    action: { upload: "Choose Files", addFiles: "Add Files", createBatch: "Create Batch", match: "Run Match", submit: "Submit", refresh: "Refresh", search: "Search summary, contract, room", manualMatch: "Manual Match", unmatch: "Unmatch" },
    matching: { title: "Matching Conditions", summary: "Bank Summary", amount: "Deposit Amount", date: "Deposit Date", month: "Deposit Month", property: "Property", room: "Room", contract: "Contract ID" },
    table: { source: "Source", date: "Deposit Date", summary: "Bank Summary", amount: "Amount", contract: "Room / Contract", status: "Result", remark: "Remark", actions: "Actions" },
    history: { title: "Batch History", noFile: "No file" },
    status: { AUTO_MATCHED: "100%", MANUAL_MATCHED: "Manual", MANUAL_REVIEW: "Review", UNMATCHED: "Unmatched", SUBMITTED: "Submitted", FAILED: "Failed" },
    common: { loading: "Working...", select: "Select", noData: "No data" },
  },
};

const t = computed(() => translations[locale.value] || translations.ja);
const selectedFiles = ref([]);
const batches = ref([]);
const records = ref([]);
const rooms = ref([]);
const contractsByRecord = ref({});
const activeBatchId = ref("");
const activeTab = ref("ALL");
const searchQuery = ref("");
const errorMessage = ref("");
const loading = ref(false);
const matchingRules = ref(["normalizedBankSummary", "depositAmount"]);

const ruleOptions = computed(() => [
  { key: "normalizedBankSummary", label: t.value.matching.summary },
  { key: "depositAmount", label: t.value.matching.amount },
  { key: "transactionDate", label: t.value.matching.date },
  { key: "paymentMonth", label: t.value.matching.month },
  { key: "propertyId", label: t.value.matching.property },
  { key: "roomId", label: t.value.matching.room },
  { key: "contractId", label: t.value.matching.contract },
]);

const tabs = computed(() => [
  { key: "ALL", label: "All" },
  { key: "AUTO_MATCHED", label: t.value.status.AUTO_MATCHED },
  { key: "MANUAL_REVIEW", label: t.value.status.MANUAL_REVIEW },
  { key: "UNMATCHED", label: t.value.status.UNMATCHED },
  { key: "SUBMITTED", label: t.value.status.SUBMITTED },
]);

const activeBatch = computed(() => batches.value.find((batch) => batch.id === activeBatchId.value));
const stats = computed(() => [
  { key: "total", label: "Total", value: activeBatch.value?.totalRecords || 0 },
  { key: "auto", label: t.value.status.AUTO_MATCHED, value: activeBatch.value?.autoMatchedCount || 0 },
  { key: "manual", label: t.value.status.MANUAL_MATCHED, value: activeBatch.value?.manualMatchedCount || 0 },
  { key: "unmatched", label: t.value.status.UNMATCHED, value: activeBatch.value?.unmatchedCount || 0 },
  { key: "submitted", label: t.value.status.SUBMITTED, value: activeBatch.value?.submittedCount || 0 },
]);

const filteredRecords = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return records.value.filter((record) => {
    const statusMatch = activeTab.value === "ALL" || record.matchStatus === activeTab.value;
    const textMatch = !query || [record.originalBankSummary, record.normalizedBankSummary, record.contractNo, record.roomNumber, record.payerName]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
    return statusMatch && textMatch;
  });
});

const selectFiles = (event) => {
  selectedFiles.value.push(...Array.from(event.target.files || []));
  event.target.value = "";
};

const uploadRows = async () => {
  loading.value = true;
  errorMessage.value = "";
  try {
    const files = [];
    for (const file of selectedFiles.value) {
      const table = await parseTableFile(file);
      const [header = [], ...dataRows] = table;
      files.push({
        fileName: file.name,
        fileType: file.name.split(".").pop(),
        fileSize: file.size,
        rows: dataRows.map((row) => Object.fromEntries(header.map((key, index) => [key, row[index] ?? ""]))),
      });
    }
    const batch = await api.uploadBankReconciliation({ files, matchingRules: matchingRules.value });
    selectedFiles.value = [];
    await loadBatches();
    await selectBatch(batch.id);
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
};

const loadBatches = async () => {
  batches.value = await api.listReconciliationBatches();
  if (!activeBatchId.value && batches.value[0]) await selectBatch(batches.value[0].id);
};

const selectBatch = async (batchId) => {
  activeBatchId.value = batchId;
  records.value = await api.listReconciliationRecords(batchId);
};

const runMatch = async () => {
  if (!activeBatchId.value || !matchingRules.value.length) return;
  loading.value = true;
  try {
    await api.matchReconciliationBatch(activeBatchId.value, matchingRules.value);
    await loadBatches();
    await selectBatch(activeBatchId.value);
  } finally {
    loading.value = false;
  }
};

const submitBatch = async () => {
  if (!activeBatchId.value) return;
  loading.value = true;
  try {
    await api.submitReconciliationBatch(activeBatchId.value);
    await loadBatches();
    await selectBatch(activeBatchId.value);
  } finally {
    loading.value = false;
  }
};

const saveRecord = async (record) => {
  await api.updateReconciliationRecord(record.id, {
    transactionDate: record.transactionDate,
    depositAmount: record.depositAmount,
    normalizedBankSummary: record.normalizedBankSummary,
    paymentMonth: record.paymentMonth,
    remark: record.remark,
  });
};

const loadContracts = async (record) => {
  if (!record.roomId) return;
  contractsByRecord.value[record.id] = await api.reconciliationContracts(record.roomId, record.transactionDate);
};

const manualMatch = async (record) => {
  if (!record.contractId) return;
  const contracts = contractsByRecord.value[record.id] || await api.reconciliationContracts(record.roomId, record.transactionDate);
  const contract = contracts.find((item) => item.id === record.contractId);
  await api.manualMatchReconciliationRecord(record.id, {
    contractId: record.contractId,
    roomId: record.roomId || contract?.roomId,
    propertyId: contract?.propertyId,
    contractorId: contract?.contractorId,
    contractorName: contract?.contractorName,
    payerId: contract?.payerId,
    payerName: contract?.payerName,
    normalizedBankSummary: record.normalizedBankSummary,
    depositAmount: record.depositAmount,
    transactionDate: record.transactionDate,
    paymentMonth: record.paymentMonth,
    remark: record.remark,
  });
  await selectBatch(activeBatchId.value);
};

const unmatch = async (record) => {
  await api.unmatchReconciliationRecord(record.id);
  await selectBatch(activeBatchId.value);
};

const statusLabel = (status) => t.value.status[status] || status;
const matchStatusLabel = (record) => record.matchStatus === "AUTO_MATCHED" ? "100%" : statusLabel(record.matchStatus);

onMounted(async () => {
  rooms.value = await api.reconciliationRooms();
  await loadBatches();
});
</script>

<style scoped>
.bank-reconciliation-page {
  display: grid;
  gap: 18px;
}

.page-title-row,
.toolbar,
.table-head,
.tabs,
.row-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.page-title-row {
  align-items: flex-end;
}

.subtle {
  color: var(--muted);
}

.panel-card,
.stat-card {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 18px;
  box-shadow: 0 8px 30px rgba(25, 37, 70, 0.04);
}

.toolbar,
.rule-panel,
.file-list {
  flex-wrap: wrap;
}

.file-button {
  position: relative;
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  padding: 0 14px;
  border-radius: 8px;
  background: var(--primary);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.file-button input {
  display: none;
}

.primary-button,
.secondary-button,
.ghost-button {
  min-height: 36px;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0 12px;
  font-weight: 700;
  cursor: pointer;
}

.primary-button {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.secondary-button,
.ghost-button {
  background: #fff;
  color: #1f2937;
}

.mini {
  min-height: 30px;
  font-size: 12px;
}

.rule-panel,
.file-list {
  display: flex;
  gap: 12px;
  margin-top: 14px;
}

.file-list span,
.status-badge {
  border-radius: 999px;
  padding: 4px 9px;
  background: #f1f5f9;
  font-size: 12px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}

.stat-card span {
  color: var(--muted);
  font-size: 12px;
}

.stat-card strong {
  display: block;
  margin-top: 6px;
  font-size: 24px;
}

.content-grid {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 16px;
}

.batch-panel {
  align-self: start;
}

.batch-row {
  width: 100%;
  display: grid;
  gap: 5px;
  margin-top: 8px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  text-align: left;
}

.batch-row.active {
  border-color: var(--primary);
  background: #eefaf8;
}

.tabs {
  justify-content: flex-start;
}

.tabs button {
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  padding: 8px 4px;
  cursor: pointer;
}

.tabs button.active {
  border-bottom-color: var(--primary);
  color: var(--primary);
  font-weight: 800;
}

.search-input,
input,
select,
textarea {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 8px;
}

.table-wrapper {
  overflow: auto;
}

table {
  width: 100%;
  min-width: 1120px;
  border-collapse: collapse;
}

th,
td {
  border-bottom: 1px solid var(--line);
  padding: 10px;
  text-align: left;
  vertical-align: top;
}

th {
  position: sticky;
  top: 0;
  background: #fff;
  color: var(--muted);
  font-size: 12px;
}

td small {
  display: block;
  color: var(--muted);
  margin-top: 4px;
}

.AUTO_MATCHED,
.SUBMITTED {
  background: #e8f9ee;
  color: #177b3f;
}

.MANUAL_REVIEW,
.UNMATCHED {
  background: #fff4d6;
  color: #996400;
}

.FAILED {
  background: #ffe9e9;
  color: #c63a3a;
}

.empty-state {
  color: var(--muted);
  text-align: center;
}

.form-error {
  color: #c63a3a;
}

@media (max-width: 960px) {
  .stats-grid,
  .content-grid {
    grid-template-columns: 1fr;
  }
}
</style>
