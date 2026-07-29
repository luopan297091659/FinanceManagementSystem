<template>
  <section class="page-shell data-page">
    <div class="page-title-row">
      <div>
        <p class="eyebrow">{{ labels.eyebrow }}</p>
        <h2>{{ labels.heading }}</h2>
      </div>
    </div>

    <div class="content-grid data-content-grid">
      <div class="panel-card full-panel">
        <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>
        <p v-if="loading" class="form-hint">{{ common.loading }}</p>
        <div class="table-controls data-toolbar">
          <div class="toolbar-actions">
            <input v-model="searchQuery" class="search-input" type="text" :placeholder="labels.searchPlaceholder" />
            <button class="primary-button" type="button" @click="openResourceModal">{{ labels.newResource }}</button>
            <button class="secondary-button" type="button" @click="triggerImport">{{ importLabels.importData }}</button>
            <button class="secondary-button" type="button" @click="openImportHistory">{{ importLabels.history }}</button>
            <button class="secondary-button" type="button" @click="exportResources">{{ common.export }}</button>
            <button class="danger-button" type="button" :disabled="!selectedIds.length" @click="batchDelete">{{ common.batchDelete }}</button>
            <input ref="fileInput" class="hidden-file-input" type="file" accept=".xlsx,.xls,.xlsm,.csv,.tsv" @change="importResources" />
          </div>
          <div class="column-panel-container">
            <button class="secondary-button" type="button" @click="showColumnPanel = !showColumnPanel">{{ common.showColumns }} ▾</button>
            <div v-if="showColumnPanel" class="column-panel" role="dialog" :aria-label="common.showColumns">
              <div class="column-panel-header">
                <strong>{{ common.showColumns }}</strong>
                <button class="column-reset-button" type="button" @click="resetResourceColumns">{{ common.resetColumns }}</button>
              </div>
              <div class="panel-body">
                <label v-for="column in resourceColumns" :key="column.key" class="panel-item">
                  <input type="checkbox" v-model="column.visible" />
                  {{ labels[column.labelKey] }}
                </label>
              </div>
            </div>
          </div>
        </div>
        <ResourceTable
          v-model:selected-ids="selectedIds"
          :items="paginatedResources"
          :total="filteredResources.length"
          :columns="resourceColumns"
          :labels="labels"
          :common="common"
          @edit="editResource"
          @delete="deleteResource"
        />
        <DataPagination
          v-model:page="resourcePage"
          v-model:page-size="resourcePageSize"
          :total="filteredResources.length"
          :labels="common"
        />
      </div>
    </div>
    <div v-if="showImportModal" class="modal-overlay" @click.self="closeImportModal">
      <div class="modal-card property-import-modal">
        <div class="modal-header">
          <div>
            <h3>{{ importView === 'history' ? importLabels.history : importLabels.title }}</h3>
            <p v-if="importBatch" class="form-hint">{{ importBatch.batchNo }} · {{ importBatch.originalName }}</p>
          </div>
          <button class="modal-close-button" type="button" @click="closeImportModal" :title="common.close">×</button>
        </div>

        <div v-if="importView === 'history'" class="import-history-list">
          <button v-for="batch in importBatches" :key="batch.id" class="history-row" type="button" @click="openImportBatch(batch.id)">
            <span>{{ batch.batchNo }}</span><span>{{ batch.originalName }}</span><span>{{ batch.status }}</span><span>{{ batch.successRows }}/{{ batch.totalRows }}</span>
          </button>
          <p v-if="!importBatches.length" class="form-hint">{{ importLabels.noHistory }}</p>
        </div>

        <template v-else>
          <div v-if="importBatch" class="import-summary">
            <span>{{ importLabels.total }}: {{ importBatch.totalRows }}</span>
            <span>{{ importLabels.ready }}: {{ importReadyRows }}</span>
            <span>{{ importLabels.conflicts }}: {{ importBatch.conflictRows }}</span>
            <span>{{ importLabels.errors }}: {{ importBatch.failedRows }}</span>
            <span>{{ importLabels.committed }}: {{ importBatch.successRows }}</span>
          </div>
          <div class="table-controls import-controls">
            <input v-model="importSearch" class="search-input" type="search" :placeholder="importLabels.search" @keyup.enter="loadImportPage(1)" />
            <select v-model="importStatus" @change="loadImportPage(1)">
              <option value="">{{ importLabels.allStatuses }}</option>
              <option v-for="status in importStatuses" :key="status" :value="status">{{ importLabels.statuses[status] || status }}</option>
            </select>
            <button class="secondary-button" type="button" @click="loadImportPage(1)">{{ importLabels.filter }}</button>
            <button class="secondary-button" type="button" :disabled="!importBatch" @click="exportImportErrors">{{ importLabels.exportErrors }}</button>
            <button class="primary-button" type="button" :disabled="!canCommitImport || importBusy" @click="commitImport">{{ importLabels.commit }}</button>
          </div>
          <p v-if="importBusy" class="form-hint">{{ common.loading }}</p>
          <div class="import-table-wrap">
            <table class="import-table">
              <thead><tr>
                <th>{{ importLabels.sourceRow }}</th><th>{{ importLabels.propertyName }}</th><th>{{ importLabels.roomNumber }}</th>
                <th>{{ importLabels.postalCode }}</th><th>{{ importLabels.address }}</th><th>{{ importLabels.unitType }}</th>
                <th>{{ importLabels.match }}</th><th>{{ importLabels.action }}</th><th>{{ importLabels.reason }}</th><th>{{ importLabels.remark }}</th>
              </tr></thead>
              <tbody>
                <tr v-for="row in importRows" :key="row.id" :class="`import-status-${row.status.toLowerCase()}`">
                  <td>{{ row.sourceRow }}</td>
                  <td><input v-model="row.propertyName" @change="saveImportRow(row, { propertyName: row.propertyName })" /></td>
                  <td><input v-model="row.roomNumber" @change="saveImportRow(row, { roomNumber: row.roomNumber })" /></td>
                  <td><input v-model="row.postalCode" @change="saveImportRow(row, { postalCode: row.postalCode })" /></td>
                  <td><input v-model="row.address" class="wide-input" @change="saveImportRow(row, { address: row.address })" /></td>
                  <td><select v-model="row.detectedUnitType" @change="saveImportRow(row, { detectedUnitType: row.detectedUnitType })"><option v-for="type in unitTypes" :key="type" :value="type">{{ importLabels.unitTypes[type] || type }}</option></select></td>
                  <td>{{ joinValues(row.property?.name, row.room?.roomNumber) }}</td>
                  <td><select v-model="row.action" @change="saveImportRow(row, { action: row.action })"><option v-for="action in importActions" :key="action" :value="action">{{ importLabels.actions[action] || action }}</option></select></td>
                  <td>{{ importLabels.reasons[row.conflictReason || row.errorMessage] || row.conflictReason || row.errorMessage || "" }}</td>
                  <td><input v-model="row.remark" @change="saveImportRow(row, { remark: row.remark })" /></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="importPagination" class="import-pagination">
            <button class="secondary-button" type="button" :disabled="importPagination.page <= 1" @click="loadImportPage(importPagination.page - 1)">{{ importLabels.previous }}</button>
            <span>{{ importPagination.page }} / {{ importPagination.totalPages }}</span>
            <button class="secondary-button" type="button" :disabled="importPagination.page >= importPagination.totalPages" @click="loadImportPage(importPagination.page + 1)">{{ importLabels.next }}</button>
          </div>
        </template>
      </div>
    </div>
    <div v-if="showResourceModal" class="modal-overlay" @click.self="closeResourceModal">
      <div class="modal-card">
        <div class="modal-header">
          <h3>{{ resourceModalTitle }}</h3>
          <button class="modal-close-button" type="button" @click="closeResourceModal" :title="common.close">×</button>
        </div>
        <ResourceForm v-model="form" :labels="labels" :common="common" @submit="saveResource" @cancel="closeResourceModal" />
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import DataPagination from "../components/DataPagination.vue";
import ResourceForm from "../components/resources/ResourceForm.vue";
import ResourceTable from "../components/resources/ResourceTable.vue";
import { useI18n } from "../i18n";
import { api } from "../services/api";
import { exportTableXls, parseTableFile } from "../utils/tableFiles";

const blankForm = () => ({
  id: "",
  projectName: "",
  buildingName: "",
  buildingLatitude: "",
  buildingLongitude: "",
  houseNumber: "",
  roomNumber: "",
  area: "",
  floor: "",
  roomLatitude: "",
  roomLongitude: "",
  status: "VACANT",
  note: "",
});

const form = ref(blankForm());
const { dictionary } = useI18n();
const labels = computed(() => dictionary.value.resourcesLabels);
const common = computed(() => dictionary.value.common);
const importLabels = computed(() => dictionary.value.propertyImport);
const resources = ref([]);
const selectedIds = ref([]);
const fileInput = ref(null);
const loading = ref(false);
const errorMessage = ref("");
const searchQuery = ref("");
const resourcePage = ref(1);
const resourcePageSize = ref(20);
const showResourceModal = ref(false);
const showImportModal = ref(false);
const importView = ref("preview");
const importBatch = ref(null);
const importRows = ref([]);
const importPagination = ref(null);
const importBatches = ref([]);
const importSearch = ref("");
const importStatus = ref("");
const importBusy = ref(false);
const resourceModalTitle = ref("");
const resourceColumns = ref([
  { key: "project", labelKey: "projectBuilding", visible: true },
  { key: "house", labelKey: "houseRoom", visible: true },
  { key: "status", labelKey: "status", visible: true },
  { key: "address", labelKey: "address", visible: true },
  { key: "area", labelKey: "area", visible: false },
  { key: "floor", labelKey: "floor", visible: false },
  { key: "buildingLocation", labelKey: "buildingCoordinates", visible: false },
  { key: "roomLocation", labelKey: "roomCoordinates", visible: false },
  { key: "note", labelKey: "note", visible: false },
]);

const showColumnPanel = ref(false);
const visibleResourceColumns = computed(() => resourceColumns.value.filter((column) => column.visible));
const exportResourceColumns = computed(() => visibleResourceColumns.value.map((column) => ({ ...column, label: labels.value[column.labelKey] })));
const filteredResources = computed(() => resources.value.filter(matchesSearch));
const paginatedResources = computed(() => {
  const start = (resourcePage.value - 1) * resourcePageSize.value;
  return filteredResources.value.slice(start, start + resourcePageSize.value);
});
const unitTypes = ["ROOM", "HOUSE", "SHOP", "OFFICE", "PARKING", "SIGNBOARD", "BASE_STATION", "VENDING", "MINPAKU", "OTHER"];
const importActions = ["CREATE_PROPERTY_AND_ROOM", "CREATE_ROOM", "UPDATE_PROPERTY", "UPDATE_ROOM", "SKIP", "CONFLICT", "ERROR"];
const importStatuses = ["READY", "CONFLICT", "ERROR", "SKIPPED", "COMMITTED", "FAILED"];
const importReadyRows = computed(() => {
  if (!importBatch.value) return 0;
  const resolved = (importBatch.value.successRows || 0) + (importBatch.value.skippedRows || 0) + (importBatch.value.failedRows || 0) + (importBatch.value.conflictRows || 0);
  return Math.max(0, importBatch.value.totalRows - resolved);
});
const canCommitImport = computed(() => {
  if (!importBatch.value) return false;
  return importBatch.value.status !== "COMPLETED" && importReadyRows.value > 0;
});

const resetForm = () => {
  form.value = blankForm();
};

const openResourceModal = () => {
  resetForm();
  resourceModalTitle.value = labels.value.newResource;
  showResourceModal.value = true;
};

const closeResourceModal = () => {
  showResourceModal.value = false;
  resetForm();
};

const loadResources = async () => {
  loading.value = true;
  errorMessage.value = "";
  try {
    const payload = await api.bootstrap();
    resources.value = (payload.rooms || []).map((room) => {
      const project = payload.projects.find((item) => item.id === room.projectId);
      const building = payload.buildings.find((item) => item.id === room.buildingId);
      return {
        id: room.id,
        projectName: project?.name || "",
        buildingName: building?.name || "",
        address: building?.address || project?.address || "",
        buildingLatitude: building?.latitude || "",
        buildingLongitude: building?.longitude || "",
        houseNumber: room.houseNumber,
        roomNumber: room.number,
        area: room.area,
        floor: room.floor,
        roomLatitude: room.latitude || "",
        roomLongitude: room.longitude || "",
        status: room.status,
        note: room.note,
      };
    });
    selectedIds.value = selectedIds.value.filter((id) => resources.value.some((item) => item.id === id));
  } catch (error) {
    errorMessage.value = error.message || labels.value.loadFailed;
  } finally {
    loading.value = false;
  }
};

function matchesSearch(item) {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return true;
  return visibleResourceColumns.value.some((column) => String(getExportValue(item, column.key)).toLowerCase().includes(query));
}

const getExportValue = (item, key) =>
  ({
    project: joinValues(item.projectName, item.buildingName),
    house: joinValues(item.houseNumber, item.roomNumber),
    address: item.address || "",
    area: item.area || "",
    floor: item.floor ?? "",
    buildingLocation: joinValues(item.buildingLatitude, item.buildingLongitude, ", "),
    roomLocation: joinValues(item.roomLatitude, item.roomLongitude, ", "),
    status: item.status || "",
    note: item.note || "",
  })[key] || "";

const joinValues = (first, second, separator = " / ") => [first, second].filter((value) => value !== null && value !== undefined && value !== "").join(separator);

const resetResourceColumns = () => {
  const defaults = new Set(["project", "house", "status", "address"]);
  resourceColumns.value.forEach((column) => {
    column.visible = defaults.has(column.key);
  });
};

watch(searchQuery, () => {
  resourcePage.value = 1;
});
watch(() => resourceColumns.value.map((column) => `${column.key}:${column.visible}`).join("|"), () => {
  resourcePage.value = 1;
});
watch(() => filteredResources.value.length, (total) => {
  resourcePage.value = Math.min(resourcePage.value, Math.max(1, Math.ceil(total / resourcePageSize.value)));
});

const saveResource = async () => {
  if (!form.value.projectName || !form.value.buildingName || !form.value.houseNumber) return;

  try {
    const payload = {
      projectName: form.value.projectName,
      buildingName: form.value.buildingName,
      houseNumber: form.value.houseNumber,
      roomNumber: form.value.roomNumber,
      area: form.value.area,
      floor: form.value.floor,
      status: form.value.status,
      note: form.value.note,
    };

    if (form.value.id) await api.updateRoom(form.value.id, payload);
    else await api.createRoom(payload);
    await loadResources();
    closeResourceModal();
  } catch (error) {
    errorMessage.value = error.message || labels.value.saveFailed;
  }
};

const editResource = (item) => {
  form.value = { ...item };
  resourceModalTitle.value = labels.value.editResource;
  showResourceModal.value = true;
};

const deleteResource = async (id) => {
  try {
    await api.deleteRoom(id);
    await loadResources();
  } catch (error) {
    errorMessage.value = error.message || labels.value.deleteFailed;
  }
};

const batchDelete = async () => {
  if (!selectedIds.value.length) return;
  try {
    await Promise.all(selectedIds.value.map((id) => api.deleteRoom(id)));
    selectedIds.value = [];
    await loadResources();
  } catch (error) {
    errorMessage.value = error.message || labels.value.batchDeleteFailed;
  }
};

const exportResources = () => {
  exportTableXls(
    labels.value.exportFileName,
    exportResourceColumns.value,
    filteredResources.value.map((item) =>
      Object.fromEntries(visibleResourceColumns.value.map((column) => [column.key, getExportValue(item, column.key)])),
    ),
  );
};

const triggerImport = () => {
  fileInput.value?.click();
};

const importResources = async (event) => {
  const [file] = event.target.files || [];
  if (!file) return;
  importBusy.value = true;
  try {
    const rows = await parseTableFile(file);
    const header = rows[0] || [];
    const dataRows = rows.slice(1).map((row) => Object.fromEntries(header.map((name, index) => [name, row[index] ?? ""])));
    let fileHash;
    if (globalThis.crypto?.subtle) {
      const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      fileHash = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
    }
    const result = await api.uploadPropertyImport({
      originalName: file.name,
      ...(fileHash ? { fileHash } : {}),
      rows: dataRows,
    });
    applyImportResult(result);
    importView.value = "preview";
    showImportModal.value = true;
  } catch (error) {
    errorMessage.value = error.message || labels.value.importFailed;
  } finally {
    importBusy.value = false;
    event.target.value = "";
  }
};

const applyImportResult = (result) => {
  importBatch.value = result.batch;
  importRows.value = result.rows || [];
  importPagination.value = result.pagination || null;
};

const closeImportModal = () => {
  showImportModal.value = false;
};

const openImportHistory = async () => {
  importBusy.value = true;
  try {
    importBatches.value = await api.listPropertyImportBatches();
    importView.value = "history";
    showImportModal.value = true;
  } catch (error) {
    errorMessage.value = error.message || labels.value.importFailed;
  } finally {
    importBusy.value = false;
  }
};

const openImportBatch = async (batchId) => {
  importBatch.value = { id: batchId };
  importView.value = "preview";
  await loadImportPage(1);
};

const loadImportPage = async (page = 1) => {
  if (!importBatch.value?.id) return;
  importBusy.value = true;
  try {
    applyImportResult(await api.getPropertyImportBatch(importBatch.value.id, { page, pageSize: 50, search: importSearch.value, status: importStatus.value }));
  } catch (error) {
    errorMessage.value = error.message || labels.value.importFailed;
  } finally {
    importBusy.value = false;
  }
};

const saveImportRow = async (row, changes) => {
  try {
    const updated = await api.updatePropertyImportRow(importBatch.value.id, row.id, changes);
    Object.assign(row, updated);
  } catch (error) {
    errorMessage.value = error.message || labels.value.importFailed;
  }
};

const commitImport = async () => {
  if (!importBatch.value?.id) return;
  importBusy.value = true;
  try {
    applyImportResult(await api.commitPropertyImport(importBatch.value.id));
    await loadResources();
  } catch (error) {
    errorMessage.value = error.message || labels.value.importFailed;
  } finally {
    importBusy.value = false;
  }
};

const exportImportErrors = async () => {
  if (!importBatch.value?.id) return;
  try {
    const rows = await api.getPropertyImportErrors(importBatch.value.id);
    const columns = [
      { key: "sourceRow", label: importLabels.value.sourceRow }, { key: "propertyName", label: importLabels.value.propertyName },
      { key: "roomNumber", label: importLabels.value.roomNumber }, { key: "postalCode", label: importLabels.value.postalCode },
      { key: "address", label: importLabels.value.address }, { key: "action", label: importLabels.value.action },
      { key: "reason", label: importLabels.value.reason }, { key: "remark", label: importLabels.value.remark },
    ];
    exportTableXls(importLabels.value.errorFileName, columns, rows.map((row) => ({ ...row, reason: row.conflictReason || row.errorMessage || "" })));
  } catch (error) {
    errorMessage.value = error.message || labels.value.importFailed;
  }
};

onMounted(() => {
  loadResources();
});
</script>

<style scoped>
.property-import-modal { width: min(96vw, 1500px); max-height: 92vh; overflow: auto; }
.import-summary { display: flex; flex-wrap: wrap; gap: 10px 24px; margin: 0 0 14px; }
.import-controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.import-table-wrap { overflow: auto; max-height: 58vh; border: 1px solid var(--border-color, #dbe3ea); border-radius: 10px; }
.import-table { border-collapse: collapse; width: max-content; min-width: 100%; font-size: 12px; }
.import-table th, .import-table td { padding: 7px; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top; }
.import-table th { position: sticky; top: 0; z-index: 1; background: #edf5f4; }
.import-table input, .import-table select { min-width: 110px; max-width: 180px; }
.import-table .wide-input { min-width: 280px; }
.import-status-conflict, .import-status-error, .import-status-failed { background: #fff4f2; }
.import-status-committed { background: #f1faf5; }
.import-pagination { display: flex; justify-content: center; align-items: center; gap: 12px; margin-top: 14px; }
.import-history-list { display: grid; gap: 8px; }
.history-row { display: grid; grid-template-columns: 1.2fr 2fr 1fr .7fr; gap: 12px; width: 100%; padding: 12px; border: 1px solid #dbe3ea; border-radius: 8px; background: #fff; text-align: left; }
</style>
