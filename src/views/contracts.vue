<template>
  <section class="page-shell data-page">
    <div class="panel-card full-panel">
      <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>
      <p v-if="loading" class="form-hint">{{ common.loading }}</p>
      <div class="table-controls data-toolbar">
        <div class="toolbar-actions">
          <input v-model="searchQuery" class="search-input" type="search" :placeholder="labels.searchPlaceholder" />
          <button class="primary-button" type="button" @click="openCreate">{{ labels.newContract }}</button>
          <button class="primary-button" type="button" @click="fileInput?.click()">{{ labels.integratedImport }}</button>
          <button class="secondary-button" type="button" @click="openImportHistory">{{ labels.importHistory }}</button>
          <button class="secondary-button" type="button" @click="exportContracts">{{ common.export }}</button>
          <button class="danger-button" type="button" :disabled="!selectedIds.length" @click="batchDeleteContracts">{{ common.batchDelete }}</button>
          <button class="secondary-button" type="button" @click="loadContracts">{{ labels.refresh }}</button>
          <input ref="fileInput" class="hidden-file-input" type="file" accept=".xls,.xlsx,.xlsm,.csv,.tsv" @change="uploadIntegrated" />
        </div>
        <div class="column-panel-container">
          <button class="secondary-button" type="button" @click="showColumnPanel = !showColumnPanel">{{ common.showColumns }} ▾</button>
          <div v-if="showColumnPanel" class="column-panel" role="dialog" :aria-label="common.showColumns">
            <div class="column-panel-header"><strong>{{ common.showColumns }}</strong><button class="column-reset-button" type="button" @click="resetContractColumns">{{ common.resetColumns }}</button></div>
            <div class="panel-body"><label v-for="column in contractColumns" :key="column.key" class="panel-item"><input v-model="column.visible" type="checkbox" />{{ labels[column.labelKey] }}</label></div>
          </div>
        </div>
      </div>
      <div class="table-card data-table-card">
        <div class="table-head"><strong>{{ labels.list }}</strong><span>{{ contractTotal }} {{ common.records }}</span></div>
        <DualScrollTable>
          <table class="data-table contract-table">
            <thead><tr><th class="select-cell"><input type="checkbox" :checked="allPageSelected" @change="togglePageSelection" /></th><th>{{ common.index }}</th><th v-for="column in visibleContractColumns" :key="column.key">
                <button v-if="sortableContractKeys.has(column.key)" type="button" class="table-sort-button" @click="toggleSort(column.key)">
                  {{ labels[column.labelKey] }} <span class="sort-icon">{{ sortIcon(column.key) }}</span>
                </button>
                <span v-else>{{ labels[column.labelKey] }}</span>
              </th><th>{{ common.actions }}</th></tr></thead>
            <tbody>
              <tr v-for="(contract, index) in paginatedContracts" :key="contract.id">
                <td class="select-cell"><input type="checkbox" :checked="selectedIds.includes(contract.id)" @change="toggleContractSelection(contract.id)" /></td>
                <td>{{ (page - 1) * pageSize + index + 1 }}</td>
                <td v-for="column in visibleContractColumns" :key="column.key"><span v-if="column.key === 'status'" class="status-chip" :class="`contract-status-${String(contract.status).toLowerCase()}`">{{ statusLabel(contract.status) }}</span><template v-else>{{ getContractColumnValue(contract, column.key) }}</template></td>
                <td><div class="row-actions"><button class="ghost-button mini" type="button" @click="openDetail(contract.id)">{{ labels.details }}</button><button class="ghost-button mini" type="button" @click="openEdit(contract)">{{ common.edit }}</button><button class="danger-button mini" type="button" @click="deleteContract(contract.id)">{{ common.delete }}</button></div></td>
              </tr>
            </tbody>
          </table>
        </DualScrollTable>
      </div>
      <DataPagination v-model:page="page" v-model:page-size="pageSize" :total="contractTotal" :labels="common" />
    </div>

    <div v-if="detail" class="modal-overlay" @click.self="detail = null">
      <div class="modal-card contract-detail-modal">
        <div class="modal-header"><h3>{{ labels.details }}</h3><button class="modal-close-button" type="button" @click="detail = null">×</button></div>
        <div class="contract-detail-grid">
          <div><span>{{ labels.contractNo }}</span><strong>{{ detail.contractNumber || "" }}</strong></div>
          <div><span>{{ labels.propertyRoom }}</span><button class="table-link-button" type="button" @click="openRoom(detail.roomId)">{{ compact(detail.propertyName, detail.roomNumber) }}</button></div>
          <div><span>{{ labels.contractor }}</span><strong>{{ detail.contractorName || "" }}</strong></div>
          <div><span>{{ labels.contractorType }}</span><strong>{{ detail.contractorType || "" }}</strong></div>
          <div><span>{{ labels.payerKana }}</span><strong>{{ detail.payerNameKana || "" }}</strong></div>
          <div><span>{{ labels.bankSummary }}</span><strong>{{ detail.bankSummaryName || "" }}</strong></div>
          <div><span>{{ labels.bankStatementSummary }}</span><strong>{{ detail.bankStatementSummary || "" }}</strong></div>
          <div><span>{{ labels.period }}</span><strong>{{ compact(detail.startDate, detail.endDate, " ～ ") }}</strong></div>
          <div><span>{{ labels.status }}</span><strong>{{ statusLabel(detail.status) }}</strong></div>
          <div><span>{{ labels.paymentMethod }}</span><strong>{{ compact(detail.paymentMethod, detail.paymentMonthType) }}</strong></div>
          <div><span>{{ labels.rent }}</span><strong>{{ money(detail.monthlyRent) }}</strong></div>
          <div><span>{{ labels.managementFee }}</span><strong>{{ money(detail.managementFee) }}</strong></div>
          <div><span>{{ labels.depositKeyMoney }}</span><strong>{{ compact(money(detail.deposit), money(detail.keyMoney)) }}</strong></div>
          <div><span>{{ labels.guaranteeCompany }}</span><strong>{{ detail.guaranteeCompanyName || "" }}</strong></div>
          <div><span>{{ labels.guaranteeFee }}</span><strong>{{ money(detail.guaranteeFee) }}</strong></div>
          <div><span>{{ labels.insurance }}</span><strong>{{ compact(detail.insuranceName, money(detail.insuranceFee)) }}</strong></div>
          <div><span>{{ labels.collectionAccount }}</span><strong>{{ detail.collectionAccount || "" }}</strong></div>
          <div class="span-2"><span>{{ labels.managementContractType }}</span><strong>{{ detail.managementContractType || "" }}</strong></div>
          <div class="span-2"><span>{{ labels.remark }}</span><strong>{{ detail.remark || "" }}</strong></div>
        </div>
        <h4 class="form-section-title">{{ labels.charges }}</h4>
        <div v-if="detail.charges?.length" class="contract-charge-list">
          <div v-for="charge in detail.charges" :key="charge.id"><span>{{ charge.itemName }}</span><strong>{{ money(charge.amount) }}</strong><small v-if="charge.monthCount">{{ charge.monthCount }} {{ labels.months }}</small></div>
        </div>
        <p v-else class="form-hint">{{ labels.noCharges }}</p>
      </div>
    </div>

    <div v-if="editForm" class="modal-overlay" @click.self="closeEdit">
      <div class="modal-card contract-edit-modal">
        <div class="modal-header"><h3>{{ isCreating ? labels.newContract : labels.editTitle }}</h3><button class="modal-close-button" type="button" @click="closeEdit">×</button></div>
        <div class="contract-edit-grid">
          <label v-if="isCreating" class="span-2"><span>{{ labels.propertyRoomSearch }}</span><input v-model="roomSearch" type="search" :placeholder="labels.propertyRoomSearchPlaceholder" /></label>
          <label v-if="isCreating" class="span-2"><span>{{ labels.propertyRoom }}</span><select v-model="editForm.roomId" required><option value="">{{ labels.selectPropertyRoom }}</option><option v-for="option in filteredRoomOptions" :key="option.id" :value="option.id">{{ option.label }}</option></select></label>
          <label><span>{{ labels.contractNo }}</span><input v-model="editForm.contractNumber" :disabled="!isCreating" :placeholder="labels.autoContractNo" /></label>
          <label><span>{{ labels.contractorKana }}</span><input v-model="editForm.contractorNameKana" /></label>
          <label><span>{{ labels.contractor }}</span><input v-model="editForm.contractorName" /></label>
          <label><span>{{ labels.contractorType }}</span><input v-model="editForm.contractorType" /></label>
          <label><span>{{ labels.payerName }}</span><input v-model="editForm.payerName" /></label>
          <label><span>{{ labels.payerKana }}</span><input v-model="editForm.payerNameKana" /></label>
          <label><span>{{ labels.bankSummary }}</span><input v-model="editForm.bankSummaryName" /></label>
          <label><span>{{ labels.bankStatementSummary }}</span><input v-model="editForm.bankStatementSummary" /></label>
          <label><span>{{ labels.status }}</span><select v-model="editForm.status"><option v-for="status in statusOptions" :key="status" :value="status">{{ statusLabel(status) }}</option></select></label>
          <label><span>{{ labels.startDate }}</span><input v-model="editForm.startDate" type="date" /></label>
          <label><span>{{ labels.endDate }}</span><input v-model="editForm.endDate" type="date" /></label>
          <label><span>{{ labels.rent }}</span><input v-model="editForm.monthlyRent" type="number" min="0" step="0.01" /></label>
          <label><span>{{ labels.managementFee }}</span><input v-model="editForm.managementFee" type="number" min="0" step="0.01" /></label>
          <label><span>{{ labels.deposit }}</span><input v-model="editForm.deposit" type="number" min="0" step="0.01" /></label>
          <label><span>{{ labels.keyMoney }}</span><input v-model="editForm.keyMoney" type="number" min="0" step="0.01" /></label>
          <label><span>{{ labels.paymentMethod }}</span><input v-model="editForm.paymentMethod" /></label>
          <label><span>{{ labels.paymentMonthType }}</span><input v-model="editForm.paymentMonthType" /></label>
          <label><span>{{ labels.guaranteeCompany }}</span><input v-model="editForm.guaranteeCompanyName" /></label>
          <label><span>{{ labels.guaranteeCompanyKana }}</span><input v-model="editForm.guaranteeCompanyNameKana" /></label>
          <label><span>{{ labels.guaranteeDeposit }}</span><input v-model="editForm.guaranteeDeposit" type="number" min="0" step="0.01" /></label>
          <label><span>{{ labels.guaranteeFee }}</span><input v-model="editForm.guaranteeFee" type="number" min="0" step="0.01" /></label>
          <label><span>{{ labels.keyReplacementFee }}</span><input v-model="editForm.keyReplacementFee" type="number" min="0" step="0.01" /></label>
          <label><span>{{ labels.renewalAdministrativeFee }}</span><input v-model="editForm.renewalAdministrativeFee" type="number" min="0" step="0.01" /></label>
          <label><span>{{ labels.insuranceName }}</span><input v-model="editForm.insuranceName" /></label>
          <label><span>{{ labels.insuranceFee }}</span><input v-model="editForm.insuranceFee" type="number" min="0" step="0.01" /></label>
          <label><span>{{ labels.insurancePeriod }}</span><input v-model="editForm.insurancePeriod" /></label>
          <label><span>{{ labels.insuranceStartDate }}</span><input v-model="editForm.insuranceStartDate" type="date" /></label>
          <label><span>{{ labels.insuranceEndDate }}</span><input v-model="editForm.insuranceEndDate" type="date" /></label>
          <label><span>{{ labels.collectionAccount }}</span><input v-model="editForm.collectionAccount" /></label>
          <label><span>{{ labels.managementContractType }}</span><input v-model="editForm.managementContractType" /></label>
          <label class="span-2"><span>{{ labels.remark }}</span><textarea v-model="editForm.remark" rows="3"></textarea></label>
        </div>
        <div class="form-actions"><button class="secondary-button" type="button" @click="closeEdit">{{ common.cancel }}</button><button class="primary-button" type="button" :disabled="editBusy || (isCreating && !editForm.roomId)" @click="saveContract">{{ common.save }}</button></div>
      </div>
    </div>

    <div v-if="showImportModal" class="modal-overlay" @click.self="closeImport">
      <div class="modal-card property-import-modal">
        <div class="modal-header"><div><h3>{{ importView === "history" ? labels.importHistory : labels.previewTitle }}</h3><p v-if="importView === 'preview'" class="form-hint">{{ importResult.batch.batchNo }} · {{ importResult.batch.originalName }}</p></div><button class="modal-close-button" type="button" @click="closeImport">×</button></div>
        <div v-if="importView === 'history'" class="import-history-list">
          <button v-for="batch in importBatches" :key="batch.id" class="history-row" type="button" @click="openImportBatch(batch.id)"><span>{{ batch.batchNo }}</span><span>{{ batch.originalName }}</span><span>{{ batch.status }}</span><span>{{ batch.successRows }}/{{ batch.totalRows }}</span></button>
          <p v-if="!importBatches.length" class="form-hint">{{ labels.noImportHistory }}</p>
        </div>
        <div v-if="importView === 'preview'" class="import-summary"><span>{{ labels.total }}: {{ importResult.batch.totalRows }}</span><span>{{ labels.ready }}: {{ readyCount }}</span><span>{{ labels.conflict }}: {{ importResult.batch.conflictRows }}</span><span>{{ labels.error }}: {{ importResult.batch.failedRows }}</span><span>{{ labels.committed }}: {{ importResult.batch.successRows }}</span></div>
        <div v-if="importView === 'preview'" class="table-controls import-controls"><button class="primary-button" type="button" :disabled="!readyCount || importBusy" @click="commitImport">{{ labels.commit }}</button></div>
        <div v-if="importView === 'preview'" class="import-table-wrap">
          <table class="import-table"><thead><tr><th>{{ labels.sourceRow }}</th><th>{{ labels.propertyRoom }}</th><th>{{ labels.contractor }}</th><th>{{ labels.period }}</th><th>{{ labels.rentFees }}</th><th>{{ labels.propertyAction }}</th><th>{{ labels.contractAction }}</th><th>{{ labels.status }}</th><th>{{ labels.reason }}</th></tr></thead>
            <tbody><tr v-for="row in importResult.rows" :key="row.id" :class="`import-status-${row.status.toLowerCase()}`">
              <td>{{ row.sourceRow }}</td><td>{{ compact(row.propertyName, row.roomNumber) }}</td><td>{{ row.contractDataJson?.contractorName || "" }}</td><td>{{ compact(row.contractDataJson?.startDate, row.contractDataJson?.endDate, " ～ ") }}</td><td>{{ money(row.contractDataJson?.monthlyRent) }}</td><td>{{ actionLabel(row.action) }}</td>
              <td><select v-model="row.contractAction" :disabled="row.status === 'COMMITTED'" @change="updateImportRow(row)"><option value="CREATE_CONTRACT">{{ labels.createContract }}</option><option value="UPDATE_CONTRACT">{{ labels.updateContract }}</option><option value="NO_CONTRACT">{{ labels.noContract }}</option><option value="SKIP">{{ labels.skip }}</option></select></td>
              <td>{{ statusLabel(row.contractStatus) }}</td><td>{{ reasonLabel(row.contractConflictReason || row.errorMessage) }}</td>
            </tr></tbody>
          </table>
        </div>
        <div v-if="importView === 'preview' && importResult.pagination" class="import-pagination"><button class="secondary-button" type="button" :disabled="importResult.pagination.page <= 1" @click="loadImportPage(importResult.pagination.page - 1)">{{ common.previous }}</button><span>{{ importResult.pagination.page }} / {{ importResult.pagination.totalPages }}</span><button class="secondary-button" type="button" :disabled="importResult.pagination.page >= importResult.pagination.totalPages" @click="loadImportPage(importResult.pagination.page + 1)">{{ common.next }}</button></div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import DataPagination from "../components/DataPagination.vue";
import DualScrollTable from "../components/DualScrollTable.vue";
import { useI18n } from "../i18n";
import { api } from "../services/api";
import { requestConfirm } from "../services/confirm";
import { appPath } from "../utils/appPath";
import { exportTableXls, parseTableFile } from "../utils/tableFiles";

const { dictionary } = useI18n();
const labels = computed(() => dictionary.value.contractsLabels);
const common = computed(() => dictionary.value.common);
const contracts = ref([]);
const contractTotal = ref(0);
const loading = ref(false);
const errorMessage = ref("");
const searchQuery = ref("");
const page = ref(1);
const pageSize = ref(20);
const sortBy = ref("startDate");
const sortDir = ref("desc");
const fileInput = ref(null);
const detail = ref(null);
const editForm = ref(null);
const editBusy = ref(false);
const selectedIds = ref([]);
const importResult = ref(null);
const importBusy = ref(false);
const showImportModal = ref(false);
const importView = ref("preview");
const importBatches = ref([]);
const statusOptions = ["DRAFT", "ACTIVE", "FUTURE", "CANCELLATION_SETTLEMENT", "EXPIRED", "TERMINATED"];
const showColumnPanel = ref(false);
const roomOptions = ref([]);
const roomSearch = ref("");
const contractColumns = ref([
  { key: "propertyRoom", labelKey: "propertyRoom", visible: true },
  { key: "contractNumber", labelKey: "contractNo", visible: true },
  { key: "externalContractId", labelKey: "externalContractId", visible: false },
  { key: "contractorName", labelKey: "contractor", visible: true },
  { key: "contractorNameKana", labelKey: "contractorKana", visible: false },
  { key: "contractorType", labelKey: "contractorType", visible: false },
  { key: "payerName", labelKey: "payerName", visible: false },
  { key: "payerNameKana", labelKey: "payerKana", visible: false },
  { key: "bankSummaryName", labelKey: "bankSummary", visible: true },
  { key: "bankStatementSummary", labelKey: "bankStatementSummary", visible: true },
  { key: "startDate", labelKey: "startDate", visible: true },
  { key: "endDate", labelKey: "endDate", visible: true },
  { key: "paymentMethod", labelKey: "paymentMethod", visible: false },
  { key: "paymentMonthType", labelKey: "paymentMonthType", visible: false },
  { key: "monthlyRent", labelKey: "rent", visible: true },
  { key: "managementFee", labelKey: "managementFee", visible: true },
  { key: "deposit", labelKey: "deposit", visible: false },
  { key: "keyMoney", labelKey: "keyMoney", visible: false },
  { key: "guaranteeDeposit", labelKey: "guaranteeDeposit", visible: false },
  { key: "guaranteeFee", labelKey: "guaranteeFee", visible: false },
  { key: "guaranteeCompanyName", labelKey: "guaranteeCompany", visible: false },
  { key: "guaranteeCompanyNameKana", labelKey: "guaranteeCompanyKana", visible: false },
  { key: "keyReplacementFee", labelKey: "keyReplacementFee", visible: false },
  { key: "renewalAdministrativeFee", labelKey: "renewalAdministrativeFee", visible: false },
  { key: "insuranceName", labelKey: "insuranceName", visible: false },
  { key: "insuranceFee", labelKey: "insuranceFee", visible: false },
  { key: "insurancePeriod", labelKey: "insurancePeriod", visible: false },
  { key: "insuranceStartDate", labelKey: "insuranceStartDate", visible: false },
  { key: "insuranceEndDate", labelKey: "insuranceEndDate", visible: false },
  { key: "collectionAccount", labelKey: "collectionAccount", visible: false },
  { key: "managementContractType", labelKey: "managementContractType", visible: false },
  { key: "status", labelKey: "status", visible: true },
  { key: "remark", labelKey: "remark", visible: false },
]);
const visibleContractColumns = computed(() => contractColumns.value.filter((column) => column.visible));
const isCreating = computed(() => Boolean(editForm.value && !editForm.value.id));
const filteredRoomOptions = computed(() => {
  const query = roomSearch.value.trim().toLowerCase();
  const options = (query ? roomOptions.value.filter((option) => option.searchText.includes(query)) : roomOptions.value).slice(0, 100);
  const current = roomOptions.value.find((option) => option.id === editForm.value?.roomId);
  return current && !options.some((option) => option.id === current.id) ? [current, ...options] : options;
});
const paginatedContracts = computed(() => contracts.value);
const pageContractIds = computed(() => paginatedContracts.value.map((contract) => contract.id));
const allPageSelected = computed(() => pageContractIds.value.length > 0 && pageContractIds.value.every((id) => selectedIds.value.includes(id)));
const sortableContractKeys = new Set(["startDate", "endDate", "monthlyRent", "managementFee", "deposit", "keyMoney", "guaranteeDeposit", "guaranteeFee", "keyReplacementFee", "renewalAdministrativeFee", "insuranceFee"]);
const sortIcon = (key) => sortBy.value === key ? (sortDir.value === 'asc' ? '▲' : '▼') : '';
const readyCount = computed(() => Math.max(0, (importResult.value?.batch?.totalRows || 0) - (importResult.value?.batch?.successRows || 0) - (importResult.value?.batch?.skippedRows || 0) - (importResult.value?.batch?.failedRows || 0) - (importResult.value?.batch?.conflictRows || 0)));
let contractSearchTimer;
let roomSearchTimer;
let contractRequestId = 0;
watch(searchQuery, () => {
  page.value = 1;
  clearTimeout(contractSearchTimer);
  contractSearchTimer = setTimeout(loadContracts, 300);
});
watch([page, pageSize], ([nextPage, nextPageSize], [previousPage, previousPageSize]) => {
  if (nextPage !== previousPage || nextPageSize !== previousPageSize) loadContracts();
});
watch(roomSearch, () => {
  if (!isCreating.value) return;
  clearTimeout(roomSearchTimer);
  roomSearchTimer = setTimeout(loadRoomOptions, 250);
});

const editableContractFields = ["id", "roomId", "contractNumber", "contractorName", "contractorNameKana", "contractorType", "payerName", "payerNameKana", "bankSummaryName", "bankStatementSummary", "status", "startDate", "endDate", "monthlyRent", "managementFee", "deposit", "keyMoney", "paymentMethod", "paymentMonthType", "guaranteeDeposit", "guaranteeCompanyName", "guaranteeCompanyNameKana", "guaranteeFee", "keyReplacementFee", "renewalAdministrativeFee", "insuranceName", "insuranceFee", "insurancePeriod", "insuranceStartDate", "insuranceEndDate", "collectionAccount", "managementContractType", "remark"];
const blankContractForm = () => Object.fromEntries(editableContractFields.map((key) => [key, key === "status" ? "DRAFT" : ""]));
const moneyColumnKeys = new Set(["monthlyRent", "managementFee", "deposit", "keyMoney", "guaranteeDeposit", "guaranteeFee", "keyReplacementFee", "renewalAdministrativeFee", "insuranceFee"]);

function getContractColumnValue(contract, key) {
  if (key === "propertyRoom") return compact(contract.propertyName, contract.roomNumber);
  if (key === "status") return statusLabel(contract.status);
  if (moneyColumnKeys.has(key)) return money(contract[key]);
  return contract[key] ?? "";
}

function resetContractColumns() {
  const defaults = new Set(["propertyRoom", "contractNumber", "contractorName", "bankSummaryName", "bankStatementSummary", "startDate", "endDate", "monthlyRent", "managementFee", "status"]);
  contractColumns.value.forEach((column) => { column.visible = defaults.has(column.key); });
}

async function loadRoomOptions() {
  const rows = await api.searchRoomOptions(roomSearch.value.trim());
  roomOptions.value = rows.map((room) => ({ ...room, searchText: room.label.toLowerCase() }));
}

async function loadContracts() { const requestId = ++contractRequestId; loading.value = true; errorMessage.value = ""; try { const result = await api.listContracts({ search: searchQuery.value.trim(), page: page.value, pageSize: pageSize.value, sortBy: sortBy.value, sortDir: sortDir.value }); if (requestId !== contractRequestId) return; const totalPages = result.pagination?.totalPages || 1; if (page.value > totalPages) { page.value = totalPages; return; } contracts.value = result.items || []; contractTotal.value = result.pagination?.total || 0; const existing = new Set(contracts.value.map((contract) => contract.id)); selectedIds.value = selectedIds.value.filter((id) => existing.has(id)); } catch (error) { if (requestId === contractRequestId) errorMessage.value = error.message || labels.value.loadFailed; } finally { if (requestId === contractRequestId) loading.value = false; } }
function toggleSort(key) { if (sortBy.value === key) { sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'; } else { sortBy.value = key; sortDir.value = 'asc'; } page.value = 1; loadContracts(); }
async function openDetail(id) { try { detail.value = await api.getContract(id); } catch (error) { errorMessage.value = error.message || labels.value.loadFailed; } }
async function openCreate() {
  try {
    roomSearch.value = "";
    await loadRoomOptions();
    editForm.value = blankContractForm();
  } catch (error) {
    errorMessage.value = error.message || labels.value.loadFailed;
  }
}
async function openEdit(contract) {
  try {
    const value = await api.getContract(contract.id);
    editForm.value = Object.fromEntries(editableContractFields.map((key) => [key, value[key] ?? ""]));
  } catch (error) {
    errorMessage.value = error.message || labels.value.loadFailed;
  }
}
function closeEdit() { editForm.value = null; }
async function saveContract() {
  if (!editForm.value || (!editForm.value.id && !editForm.value.roomId)) return;
  editBusy.value = true;
  try {
    const { id, ...payload } = editForm.value;
    if (id) await api.updateContract(id, payload);
    else await api.createContract(payload);
    closeEdit();
    detail.value = null;
    await loadContracts();
  } catch (error) {
    errorMessage.value = error.message || labels.value.saveFailed;
  } finally {
    editBusy.value = false;
  }
}
async function deleteContract(id) {
  if (!await requestConfirm(labels.value.deleteConfirm)) return;
  try {
    await api.deleteContract(id);
    selectedIds.value = selectedIds.value.filter((selectedId) => selectedId !== id);
    if (detail.value?.id === id) detail.value = null;
    await loadContracts();
  } catch (error) {
    errorMessage.value = error.message || labels.value.deleteFailed;
  }
}
async function batchDeleteContracts() {
  if (!selectedIds.value.length) return;
  if (!await requestConfirm(labels.value.batchDeleteConfirm.replace("{count}", selectedIds.value.length))) return;
  try {
    await api.batchDeleteContracts(selectedIds.value);
    selectedIds.value = [];
    await loadContracts();
  } catch (error) {
    errorMessage.value = error.message || labels.value.batchDeleteFailed;
  }
}
function toggleContractSelection(id) {
  selectedIds.value = selectedIds.value.includes(id) ? selectedIds.value.filter((item) => item !== id) : [...selectedIds.value, id];
}
function togglePageSelection() {
  const selected = new Set(selectedIds.value);
  if (allPageSelected.value) pageContractIds.value.forEach((id) => selected.delete(id));
  else pageContractIds.value.forEach((id) => selected.add(id));
  selectedIds.value = [...selected];
}
async function exportContracts() {
  try {
    const rows = await api.exportContracts(searchQuery.value.trim());
    const columns = visibleContractColumns.value.map((column) => ({ key: column.key, label: labels.value[column.labelKey] }));
    exportTableXls(labels.value.exportFileName, columns, rows.map((row) => Object.fromEntries(columns.map((column) => [column.key, getContractColumnValue(row, column.key)]))));
  } catch (error) {
    errorMessage.value = error.message || labels.value.exportFailed;
  }
}
async function uploadIntegrated(event) {
  const [file] = event.target.files || []; if (!file) return; importBusy.value = true;
  try {
    const rows = await parseTableFile(file); const headers = rows[0] || []; const dataRows = rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
    let fileHash; if (globalThis.crypto?.subtle) { const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer()); fileHash = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join(""); }
    importResult.value = await api.uploadIntegratedImport({ originalName: file.name, ...(fileHash ? { fileHash } : {}), rows: dataRows }); importView.value = "preview"; showImportModal.value = true;
  } catch (error) { errorMessage.value = labels.value.reasons?.[error.message] || error.message || labels.value.importFailed; } finally { importBusy.value = false; event.target.value = ""; }
}
async function loadImportPage(nextPage) { if (!importResult.value?.batch?.id) return; importResult.value = await api.getIntegratedImport(importResult.value.batch.id, { page: nextPage, pageSize: 50 }); }
async function openImportHistory() {
  importBusy.value = true;
  try {
    importBatches.value = await api.listIntegratedImportBatches();
    importResult.value = { batch: { batchNo: "", originalName: "" }, rows: [], pagination: null };
    importView.value = "history";
    showImportModal.value = true;
  } catch (error) {
    errorMessage.value = error.message || labels.value.importFailed;
  } finally {
    importBusy.value = false;
  }
}
async function openImportBatch(batchId) {
  importResult.value = { batch: { id: batchId }, rows: [], pagination: null };
  importView.value = "preview";
  await loadImportPage(1);
}
async function updateImportRow(row) { try { await api.updateIntegratedImportRow(importResult.value.batch.id, row.id, { contractAction: row.contractAction }); await loadImportPage(importResult.value.pagination?.page || 1); } catch (error) { errorMessage.value = error.message || labels.value.importFailed; } }
async function commitImport() { importBusy.value = true; try { importResult.value = await api.commitIntegratedImport(importResult.value.batch.id); await loadContracts(); } catch (error) { errorMessage.value = error.message || labels.value.importFailed; } finally { importBusy.value = false; } }
function closeImport() { showImportModal.value = false; importResult.value = null; }
function openRoom(roomId) { window.history.pushState({}, "", `${appPath("/resources")}?roomId=${encodeURIComponent(roomId)}`); window.dispatchEvent(new PopStateEvent("popstate")); }
const money = (value) => value === null || value === undefined || value === "" ? "" : `¥${Number(value).toLocaleString()}`;
const compact = (first, second, separator = " / ") => [first, second].filter((value) => value !== null && value !== undefined && value !== "").join(separator);
const statusLabel = (status) => labels.value.statuses?.[status] || status || "";
const actionLabel = (action) => labels.value.actions?.[action] || action || "";
const reasonLabel = (reason) => labels.value.reasons?.[reason] || reason || "";
onMounted(async () => {
  await loadContracts();
  const contractId = new URLSearchParams(window.location.search).get("contractId");
  if (contractId) await openDetail(contractId);
});
</script>

<style scoped>
.contract-edit-modal { width: min(94vw, 920px); max-height: 92vh; overflow: auto; }
.contract-edit-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 18px; }
.contract-edit-grid label { display: grid; gap: 6px; }
.contract-edit-grid label > span { color: #526579; font-size: 12px; font-weight: 700; }
.contract-edit-grid input, .contract-edit-grid select, .contract-edit-grid textarea { width: 100%; box-sizing: border-box; }
.contract-edit-grid .span-2 { grid-column: 1 / -1; }
.form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
.import-history-list { display: grid; gap: 8px; }
.history-row { display: grid; grid-template-columns: 1.2fr 2fr 1fr .8fr; gap: 12px; align-items: center; width: 100%; padding: 11px 12px; border: 1px solid #dbe3ea; border-radius: 8px; background: #fff; color: inherit; text-align: left; cursor: pointer; }
.history-row:hover { background: #f4faf9; border-color: #9bc8c2; }
.table-sort-button {
  border: none;
  background: transparent;
  padding: 0;
  margin: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.table-sort-button:focus {
  outline: none;
}
.sort-icon {
  font-size: 0.8em;
  opacity: 0.6;
}
.property-import-modal { width: min(96vw, 1500px); max-height: 92vh; overflow: auto; }
.import-summary { display: flex; flex-wrap: wrap; gap: 10px 24px; margin-bottom: 14px; }
.import-controls { display: flex; justify-content: flex-end; margin-bottom: 10px; }
.import-table-wrap { overflow: auto; max-height: 58vh; border: 1px solid #dbe3ea; border-radius: 8px; }
.import-table { width: max-content; min-width: 100%; border-collapse: collapse; font-size: 12px; }
.import-table th, .import-table td { padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top; }
.import-table th { position: sticky; top: 0; z-index: 1; background: #edf5f4; }
.import-status-conflict, .import-status-error, .import-status-failed { background: #fff4f2; }
.import-status-committed { background: #f1faf5; }
.import-pagination { display: flex; justify-content: center; align-items: center; gap: 12px; margin-top: 14px; }
@media (max-width: 720px) {
  .contract-edit-grid { grid-template-columns: 1fr; }
  .contract-edit-grid .span-2 { grid-column: auto; }
  .history-row { grid-template-columns: 1fr; }
}
</style>
