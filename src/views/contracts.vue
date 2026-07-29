<template>
  <section class="page-shell data-page">
    <div class="page-title-row">
      <div><p class="eyebrow">{{ labels.eyebrow }}</p><h2>{{ labels.heading }}</h2></div>
    </div>
    <div class="panel-card full-panel">
      <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>
      <p v-if="loading" class="form-hint">{{ common.loading }}</p>
      <div class="table-controls data-toolbar">
        <div class="toolbar-actions">
          <input v-model="searchQuery" class="search-input" type="search" :placeholder="labels.searchPlaceholder" />
          <button class="primary-button" type="button" @click="fileInput?.click()">{{ labels.integratedImport }}</button>
          <button class="secondary-button" type="button" @click="loadContracts">{{ labels.refresh }}</button>
          <input ref="fileInput" class="hidden-file-input" type="file" accept=".xls,.xlsx,.xlsm,.csv,.tsv" @change="uploadIntegrated" />
        </div>
      </div>
      <div class="table-card data-table-card">
        <div class="table-head"><strong>{{ labels.list }}</strong><span>{{ filteredContracts.length }} {{ common.records }}</span></div>
        <div class="data-table-wrap">
          <table class="data-table contract-table">
            <thead><tr><th>{{ common.index }}</th><th>{{ labels.propertyRoom }}</th><th>{{ labels.contractNo }}</th><th>{{ labels.contractor }}</th><th>{{ labels.period }}</th><th>{{ labels.rentFees }}</th><th>{{ labels.bankSummary }}</th><th>{{ labels.status }}</th><th>{{ common.actions }}</th></tr></thead>
            <tbody>
              <tr v-for="(contract, index) in paginatedContracts" :key="contract.id">
                <td>{{ (page - 1) * pageSize + index + 1 }}</td>
                <td><strong>{{ contract.propertyName }}</strong><p>{{ contract.roomNumber }}</p></td>
                <td>{{ contract.contractNumber || "" }}</td>
                <td><strong>{{ contract.contractorName || "" }}</strong><p>{{ contract.payerNameKana || "" }}</p></td>
                <td><p>{{ contract.startDate || "" }}</p><p>{{ contract.endDate || "" }}</p></td>
                <td><p>{{ labels.rent }} {{ money(contract.monthlyRent) }}</p><p>{{ labels.managementFee }} {{ money(contract.managementFee) }}</p></td>
                <td>{{ contract.bankSummaryName || "" }}</td>
                <td><span class="status-chip" :class="`contract-status-${String(contract.status).toLowerCase()}`">{{ statusLabel(contract.status) }}</span></td>
                <td><button class="ghost-button mini" type="button" @click="openDetail(contract.id)">{{ labels.details }}</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <DataPagination v-model:page="page" v-model:page-size="pageSize" :total="filteredContracts.length" :labels="common" />
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

    <div v-if="importResult" class="modal-overlay" @click.self="closeImport">
      <div class="modal-card property-import-modal">
        <div class="modal-header"><div><h3>{{ labels.previewTitle }}</h3><p class="form-hint">{{ importResult.batch.batchNo }} · {{ importResult.batch.originalName }}</p></div><button class="modal-close-button" type="button" @click="closeImport">×</button></div>
        <div class="import-summary"><span>{{ labels.total }}: {{ importResult.batch.totalRows }}</span><span>{{ labels.ready }}: {{ readyCount }}</span><span>{{ labels.conflict }}: {{ importResult.batch.conflictRows }}</span><span>{{ labels.error }}: {{ importResult.batch.failedRows }}</span><span>{{ labels.committed }}: {{ importResult.batch.successRows }}</span></div>
        <div class="table-controls import-controls"><button class="primary-button" type="button" :disabled="!readyCount || importBusy" @click="commitImport">{{ labels.commit }}</button></div>
        <div class="import-table-wrap">
          <table class="import-table"><thead><tr><th>{{ labels.sourceRow }}</th><th>{{ labels.propertyRoom }}</th><th>{{ labels.contractor }}</th><th>{{ labels.period }}</th><th>{{ labels.rentFees }}</th><th>{{ labels.propertyAction }}</th><th>{{ labels.contractAction }}</th><th>{{ labels.status }}</th><th>{{ labels.reason }}</th></tr></thead>
            <tbody><tr v-for="row in importResult.rows" :key="row.id" :class="`import-status-${row.status.toLowerCase()}`">
              <td>{{ row.sourceRow }}</td><td>{{ compact(row.propertyName, row.roomNumber) }}</td><td>{{ row.contractDataJson?.contractorName || "" }}</td><td>{{ compact(row.contractDataJson?.startDate, row.contractDataJson?.endDate, " ～ ") }}</td><td>{{ money(row.contractDataJson?.monthlyRent) }}</td><td>{{ actionLabel(row.action) }}</td>
              <td><select v-model="row.contractAction" :disabled="row.status === 'COMMITTED'" @change="updateImportRow(row)"><option value="CREATE_CONTRACT">{{ labels.createContract }}</option><option value="UPDATE_CONTRACT">{{ labels.updateContract }}</option><option value="NO_CONTRACT">{{ labels.noContract }}</option><option value="SKIP">{{ labels.skip }}</option></select></td>
              <td>{{ statusLabel(row.contractStatus) }}</td><td>{{ reasonLabel(row.contractConflictReason || row.errorMessage) }}</td>
            </tr></tbody>
          </table>
        </div>
        <div v-if="importResult.pagination" class="import-pagination"><button class="secondary-button" type="button" :disabled="importResult.pagination.page <= 1" @click="loadImportPage(importResult.pagination.page - 1)">{{ common.previous }}</button><span>{{ importResult.pagination.page }} / {{ importResult.pagination.totalPages }}</span><button class="secondary-button" type="button" :disabled="importResult.pagination.page >= importResult.pagination.totalPages" @click="loadImportPage(importResult.pagination.page + 1)">{{ common.next }}</button></div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import DataPagination from "../components/DataPagination.vue";
import { useI18n } from "../i18n";
import { api } from "../services/api";
import { parseTableFile } from "../utils/tableFiles";

const { dictionary } = useI18n();
const labels = computed(() => dictionary.value.contractsLabels);
const common = computed(() => dictionary.value.common);
const contracts = ref([]);
const loading = ref(false);
const errorMessage = ref("");
const searchQuery = ref("");
const page = ref(1);
const pageSize = ref(20);
const fileInput = ref(null);
const detail = ref(null);
const importResult = ref(null);
const importBusy = ref(false);
const filteredContracts = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return contracts.value;
  return contracts.value.filter((item) => [item.propertyName, item.roomNumber, item.contractNumber, item.contractorName, item.payerNameKana, item.bankSummaryName, item.status].some((value) => String(value || "").toLowerCase().includes(query)));
});
const paginatedContracts = computed(() => filteredContracts.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value));
const readyCount = computed(() => Math.max(0, (importResult.value?.batch?.totalRows || 0) - (importResult.value?.batch?.successRows || 0) - (importResult.value?.batch?.skippedRows || 0) - (importResult.value?.batch?.failedRows || 0) - (importResult.value?.batch?.conflictRows || 0)));
watch(searchQuery, () => { page.value = 1; });

async function loadContracts() { loading.value = true; errorMessage.value = ""; try { contracts.value = await api.listContracts(); } catch (error) { errorMessage.value = error.message || labels.value.loadFailed; } finally { loading.value = false; } }
async function openDetail(id) { try { detail.value = await api.getContract(id); } catch (error) { errorMessage.value = error.message || labels.value.loadFailed; } }
async function uploadIntegrated(event) {
  const [file] = event.target.files || []; if (!file) return; importBusy.value = true;
  try {
    const rows = await parseTableFile(file); const headers = rows[0] || []; const dataRows = rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
    let fileHash; if (globalThis.crypto?.subtle) { const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer()); fileHash = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join(""); }
    importResult.value = await api.uploadIntegratedImport({ originalName: file.name, ...(fileHash ? { fileHash } : {}), rows: dataRows });
  } catch (error) { errorMessage.value = error.message || labels.value.importFailed; } finally { importBusy.value = false; event.target.value = ""; }
}
async function loadImportPage(nextPage) { if (!importResult.value?.batch?.id) return; importResult.value = await api.getIntegratedImport(importResult.value.batch.id, { page: nextPage, pageSize: 50 }); }
async function updateImportRow(row) { try { await api.updateIntegratedImportRow(importResult.value.batch.id, row.id, { contractAction: row.contractAction }); await loadImportPage(importResult.value.pagination?.page || 1); } catch (error) { errorMessage.value = error.message || labels.value.importFailed; } }
async function commitImport() { importBusy.value = true; try { importResult.value = await api.commitIntegratedImport(importResult.value.batch.id); await loadContracts(); } catch (error) { errorMessage.value = error.message || labels.value.importFailed; } finally { importBusy.value = false; } }
function closeImport() { importResult.value = null; }
function openRoom(roomId) { window.history.pushState({}, "", `/resources?roomId=${encodeURIComponent(roomId)}`); window.dispatchEvent(new PopStateEvent("popstate")); }
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
</style>
