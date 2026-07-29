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
        <div class="workflow-actions">
          <label class="file-button step-button">
            {{ selectedFiles.length ? t.action.addFiles : t.action.upload }}
            <input ref="fileInput" type="file" multiple accept=".csv,.tsv,.txt,.html,.xls,.xlsx" @change="selectFiles" />
          </label>
          <span class="step-arrow" aria-hidden="true">→</span>
          <button class="primary-button step-button" type="button" :disabled="!selectedFiles.length || loading" @click="uploadRows">{{ t.action.createBatch }}</button>
          <span class="step-arrow" aria-hidden="true">→</span>
          <button class="primary-button step-button" type="button" :disabled="!activeBatchId || loading" @click="runMatch">{{ t.action.match }}</button>
          <span class="step-arrow" aria-hidden="true">→</span>
          <button class="primary-button step-button" type="button" :disabled="!activeBatchId || loading" @click="submitBatch">{{ t.action.submit }}</button>
        </div>
        <div class="toolbar-exports">
          <button class="secondary-button" type="button" :disabled="!activeBatchId || loading" @click="exportFinalResult">{{ t.action.exportExcel }}</button>
          <button class="secondary-button" type="button" :disabled="!activeBatchId || loading" @click="exportUnmatchedJson">{{ t.action.exportJson }}</button>
        </div>
      </div>

      <div class="rule-panel">
        <strong>{{ t.matching.title }}</strong>
        <div class="rule-options">
          <label
            v-for="rule in ruleOptions"
            :key="rule.key"
            class="rule-option"
            :class="{ checked: matchingRules.includes(rule.key) }"
          >
            <input v-model="matchingRules" type="checkbox" :value="rule.key" />
            <span class="rule-check" aria-hidden="true"></span>
            <span class="rule-label">{{ rule.label }}</span>
          </label>
        </div>
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
        <div
          v-for="batch in batches"
          :key="batch.id"
          class="batch-row"
          :class="{ active: activeBatchId === batch.id }"
        >
          <button class="batch-select" type="button" @click="selectBatch(batch.id)">
            <strong>{{ batch.batchNo }}</strong>
            <span>{{ statusLabel(batch.status) }}</span>
            <small>{{ batch.sourceFiles?.[0]?.fileName || t.history.noFile }}</small>
          </button>
          <button class="danger-button mini batch-delete" type="button" :disabled="loading" @click="deleteBatch(batch.id)">
            {{ t.action.delete }}
          </button>
        </div>
      </aside>

      <section class="panel-card records-panel">
        <div class="table-head">
          <div class="tabs">
            <button v-for="tab in tabs" :key="tab.key" type="button" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">
              {{ tab.label }}
            </button>
          </div>
          <div class="records-table-tools">
            <input v-model="searchQuery" class="search-input" type="search" :placeholder="t.action.search" />
            <div class="column-panel-container">
              <button class="secondary-button" type="button" @click="showColumnPanel = !showColumnPanel">{{ t.action.showColumns }} ▾</button>
              <div v-if="showColumnPanel" class="column-panel" role="dialog" :aria-label="t.action.showColumns">
                <div class="column-panel-header">
                  <strong>{{ t.action.showColumns }}</strong>
                  <button class="column-reset-button" type="button" @click="resetBankColumns">{{ t.action.resetColumns }}</button>
                </div>
                <div class="panel-body">
                  <label v-for="column in bankColumns" :key="column.key" class="panel-item">
                    <input v-model="column.visible" type="checkbox" />
                    {{ bankColumnLabel(column.key) }}
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DualScrollTable wrapper-class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th v-if="isBankColumnVisible('source')">{{ t.table.source }}</th>
                <th v-if="isBankColumnVisible('date')">{{ t.table.date }}</th>
                <th v-if="isBankColumnVisible('summary')">{{ t.table.summary }}</th>
                <th v-if="isBankColumnVisible('amount')">{{ t.table.amount }}</th>
                <th v-if="isBankColumnVisible('room')">{{ roomColumnLabel }}</th>
                <th v-if="isBankColumnVisible('contract')">{{ contractColumnLabel }}</th>
                <th v-if="isBankColumnVisible('status')">{{ t.table.status }}</th>
                <th v-if="isBankColumnVisible('remark')">{{ t.table.remark }}</th>
                <th>{{ t.table.actions }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="record in paginatedRecords" :key="record.id">
                <td v-if="isBankColumnVisible('source')"><span v-if="record.sourceFileName">{{ record.sourceFileName }}</span><small v-if="sourcePosition(record)">{{ sourcePosition(record) }}</small></td>
                <td v-if="isBankColumnVisible('date')"><input v-model="record.transactionDate" type="date" @change="saveRecord(record)" /></td>
                <td v-if="isBankColumnVisible('summary')">
                  <small v-if="record.originalBankSummary">{{ record.originalBankSummary }}</small>
                  <input v-model="record.normalizedBankSummary" @change="saveRecord(record)" />
                </td>
                <td v-if="isBankColumnVisible('amount')"><input v-model="record.depositAmount" inputmode="decimal" @change="saveRecord(record)" /></td>
                <td v-if="isBankColumnVisible('room')">
                  <select v-model="record.roomId" @change="loadContracts(record)">
                    <option value="">{{ t.common.select }}</option>
                    <option v-for="room in rooms" :key="room.id" :value="room.id">{{ roomOptionLabel(room) }}</option>
                  </select>
                </td>
                <td v-if="isBankColumnVisible('contract')">
                  <select v-model="record.contractId" @change="manualMatch(record)">
                    <option value="">{{ t.common.select }}</option>
                    <option v-for="contract in contractsByRecord[record.id] || []" :key="contract.id" :value="contract.id">
                      {{ contractOptionLabel(contract) }}
                    </option>
                  </select>
                </td>
                <td v-if="isBankColumnVisible('status')">
                  <span class="status-badge" :class="record.matchStatus">{{ matchStatusLabel(record) }}</span>
                  <small v-if="record.matchReason">{{ record.matchReason }}</small>
                </td>
                <td v-if="isBankColumnVisible('remark')"><textarea v-model="record.remark" rows="2" @change="saveRecord(record)" /></td>
                <td class="row-actions">
                  <button class="secondary-button mini" type="button" @click="manualMatch(record)">{{ t.action.manualMatch }}</button>
                  <button class="ghost-button mini" type="button" @click="unmatch(record)">{{ t.action.unmatch }}</button>
                </td>
              </tr>
              <tr v-if="!paginatedRecords.length">
                <td :colspan="visibleBankColumns.length + 1" class="empty-state">{{ t.common.noData }}</td>
              </tr>
            </tbody>
          </table>
        </DualScrollTable>
        <DataPagination
          v-model:page="recordPage"
          v-model:page-size="recordPageSize"
          :total="filteredRecords.length"
          :labels="t.pagination"
        />
      </section>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import DataPagination from "../components/DataPagination.vue";
import DualScrollTable from "../components/DualScrollTable.vue";
import { locale, messages } from "../i18n";
import { api } from "../services/api";
import { exportTableXls, parseTableFile } from "../utils/tableFiles";

const t = computed(() => messages[locale.value].bankReconciliation);
const selectedFiles = ref([]);
const batches = ref([]);
const records = ref([]);
const rooms = ref([]);
const contractsByRecord = ref({});
const activeBatchId = ref("");
const activeTab = ref("ALL");
const searchQuery = ref("");
const recordPage = ref(1);
const recordPageSize = ref(20);
const errorMessage = ref("");
const loading = ref(false);
const showColumnPanel = ref(false);
const bankColumns = ref([
  { key: "source", visible: true },
  { key: "date", visible: true },
  { key: "summary", visible: true },
  { key: "amount", visible: true },
  { key: "room", visible: true },
  { key: "contract", visible: true },
  { key: "status", visible: true },
  { key: "remark", visible: true },
]);
const matchingRules = ref(["normalizedBankSummary", "depositAmount"]);
const roomColumnLabel = computed(() => t.value.table.room);
const contractColumnLabel = computed(() => t.value.table.contract);
const contractPartyLabel = computed(() => t.value.matching.contractParty);
const contractorLabel = computed(() => t.value.matching.contractor);
const payerLabel = computed(() => t.value.matching.payer);
const visibleBankColumns = computed(() => bankColumns.value.filter((column) => column.visible));
const isBankColumnVisible = (key) => bankColumns.value.find((column) => column.key === key)?.visible;
const bankColumnLabel = (key) => ({ source: t.value.table.source, date: t.value.table.date, summary: t.value.table.summary, amount: t.value.table.amount, room: roomColumnLabel.value, contract: contractColumnLabel.value, status: t.value.table.status, remark: t.value.table.remark })[key] || key;
const resetBankColumns = () => bankColumns.value.forEach((column) => { column.visible = true; });
const compactJoin = (values, separator = " / ") => values.filter((value) => value !== null && value !== undefined && value !== "").join(separator);
const sourcePosition = (record) => compactJoin([record.sourcePage, record.sourceRow]);
const roomOptionLabel = (room) => compactJoin([room.property?.name || room.propertyName, room.roomNumber]);
const contractOptionLabel = (contract) => compactJoin([
  contract.contractNo || contract.id,
  contract.contractorName ? `${contractorLabel.value}: ${contract.contractorName}` : "",
  contract.payerName ? `${payerLabel.value}: ${contract.payerName}` : "",
]);

const ruleOptions = computed(() => [
  { key: "normalizedBankSummary", label: t.value.matching.summary },
  { key: "depositAmount", label: t.value.matching.amount },
  { key: "transactionDate", label: t.value.matching.date },
  { key: "paymentMonth", label: t.value.matching.month },
  { key: "propertyId", label: t.value.matching.property },
  { key: "roomId", label: t.value.matching.room },
  { key: "contractParty", label: contractPartyLabel.value },
]);

const tabs = computed(() => [
  { key: "ALL", label: t.value.status.ALL },
  { key: "AUTO_MATCHED", label: t.value.status.AUTO_MATCHED },
  { key: "MANUAL_REVIEW", label: t.value.status.MANUAL_REVIEW },
  { key: "UNMATCHED", label: t.value.status.UNMATCHED },
  { key: "SUBMITTED", label: t.value.status.SUBMITTED },
]);

const activeBatch = computed(() => batches.value.find((batch) => batch.id === activeBatchId.value));
const stats = computed(() => [
  { key: "total", label: t.value.status.total, value: activeBatch.value?.totalRecords || 0 },
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
const paginatedRecords = computed(() => {
  const start = (recordPage.value - 1) * recordPageSize.value;
  return filteredRecords.value.slice(start, start + recordPageSize.value);
});

watch([searchQuery, activeTab, activeBatchId], () => {
  recordPage.value = 1;
});
watch(() => filteredRecords.value.length, (total) => {
  recordPage.value = Math.min(recordPage.value, Math.max(1, Math.ceil(total / recordPageSize.value)));
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

const deleteBatch = async (batchId) => {
  if (!batchId || !window.confirm(t.value.history.deleteConfirm)) return;
  loading.value = true;
  try {
    await api.deleteReconciliationBatch(batchId);
    if (activeBatchId.value === batchId) {
      activeBatchId.value = "";
      records.value = [];
    }
    await loadBatches();
  } finally {
    loading.value = false;
  }
};

const exportFinalResult = async () => {
  const rows = await api.exportReconciliationExcel(activeBatchId.value);
  exportTableXls(`bank-reconciliation-${activeBatch.value?.batchNo || activeBatchId.value}.xls`, [
    { key: "propertyName", label: t.value.table.property || "Property Name" },
    { key: "roomNumber", label: t.value.matching.room },
    { key: "contractId", label: t.value.matching.contract },
    { key: "contractorName", label: contractorLabel.value },
    { key: "payerName", label: payerLabel.value },
    { key: "originalBankSummary", label: t.value.table.summary },
    { key: "depositAmount", label: t.value.table.amount },
    { key: "paymentMonth", label: t.value.matching.month },
    { key: "transactionDate", label: t.value.table.date },
    { key: "matchStatus", label: t.value.table.status },
    { key: "matchMode", label: "Match Method" },
    { key: "bankTransactionId", label: "Bank Transaction ID" },
    { key: "targetRecordId", label: "Linked Database Record ID" },
    { key: "feeType", label: "Fee Type" },
    { key: "remark", label: t.value.table.remark },
  ], rows);
};

const exportUnmatchedJson = async () => {
  const rows = await api.exportReconciliationUnmatchedJson(activeBatchId.value);
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `bank-reconciliation-unmatched-${activeBatch.value?.batchNo || activeBatchId.value}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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

.records-table-tools {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: min(100%, 420px);
}

.records-table-tools .search-input {
  min-width: 220px;
}

.records-table-tools .column-panel-container {
  flex: 0 0 auto;
}

.table-wrapper td > small {
  display: block;
  margin-top: 4px;
  color: var(--muted);
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
.file-list {
  flex-wrap: wrap;
}

.toolbar {
  align-items: flex-start;
}

.workflow-actions,
.toolbar-exports {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.toolbar-exports {
  margin-left: auto;
}

.step-button {
  min-width: 86px;
  justify-content: center;
}

.step-arrow {
  color: var(--primary);
  font-size: 22px;
  font-weight: 900;
  line-height: 1;
}

.file-button {
  position: relative;
  display: inline-flex;
  min-height: 36px;
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

.file-list {
  display: flex;
  gap: 12px;
  margin-top: 14px;
}

.rule-panel {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px 16px;
  align-items: center;
  margin-top: 16px;
}

.rule-panel > strong {
  white-space: nowrap;
}

.rule-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  gap: 10px;
  min-width: 0;
}

.rule-option {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid #d8e1ea;
  border-radius: 8px;
  background: #f8fafc;
  color: #475569;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease, color 0.18s ease;
}

.rule-option:hover {
  border-color: color-mix(in srgb, var(--primary) 45%, #d8e1ea);
  background: #f2fbf9;
}

.rule-option.checked {
  border-color: var(--primary);
  background: #eefaf8;
  color: #0f766e;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary) 22%, transparent);
}

.rule-option input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.rule-check {
  position: relative;
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
  border: 1.5px solid #b8c5d4;
  border-radius: 5px;
  background: #fff;
  transition: border-color 0.18s ease, background 0.18s ease;
}

.rule-option.checked .rule-check {
  border-color: var(--primary);
  background: var(--primary);
}

.rule-option.checked .rule-check::after {
  content: "";
  position: absolute;
  left: 5px;
  top: 2px;
  width: 5px;
  height: 9px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.rule-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: stretch;
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

.batch-select {
  display: grid;
  gap: 5px;
  min-width: 0;
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}

.batch-delete {
  align-self: center;
  white-space: nowrap;
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
  min-width: 1240px;
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

  .toolbar,
  .toolbar-exports {
    align-items: stretch;
    width: 100%;
  }

  .toolbar-exports {
    margin-left: 0;
  }

  .records-table-tools {
    width: 100%;
    min-width: 0;
  }
}
</style>
