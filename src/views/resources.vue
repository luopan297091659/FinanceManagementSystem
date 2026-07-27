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
            <button class="secondary-button" type="button" @click="triggerImport">{{ common.import }}</button>
            <button class="secondary-button" type="button" @click="exportResources">{{ common.export }}</button>
            <button class="danger-button" type="button" :disabled="!selectedIds.length" @click="batchDelete">{{ common.batchDelete }}</button>
            <input ref="fileInput" class="hidden-file-input" type="file" accept=".xls,.csv,.tsv,.html,.txt" @change="importResources" />
          </div>
          <div class="column-panel-container">
            <button class="secondary-button" type="button" @click="showColumnPanel = !showColumnPanel">{{ common.showColumns }} ▾</button>
            <div v-if="showColumnPanel" class="column-panel">
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
          :items="filteredResources"
          :columns="resourceColumns"
          :labels="labels"
          :common="common"
          @edit="editResource"
          @delete="deleteResource"
        />
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
import { computed, onMounted, ref } from "vue";
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
const resources = ref([]);
const selectedIds = ref([]);
const fileInput = ref(null);
const loading = ref(false);
const errorMessage = ref("");
const searchQuery = ref("");
const showResourceModal = ref(false);
const resourceModalTitle = ref("");
const resourceColumns = ref([
  { key: "project", labelKey: "projectBuilding", visible: true },
  { key: "house", labelKey: "houseRoom", visible: true },
  { key: "area", labelKey: "areaFloor", visible: true },
  { key: "location", labelKey: "location", visible: true },
  { key: "status", labelKey: "status", visible: true },
  { key: "note", labelKey: "note", visible: true },
]);

const showColumnPanel = ref(false);
const visibleResourceColumns = computed(() => resourceColumns.value.filter((column) => column.visible));
const exportResourceColumns = computed(() => visibleResourceColumns.value.map((column) => ({ ...column, label: labels.value[column.labelKey] })));
const filteredResources = computed(() => resources.value.filter(matchesSearch));

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
    project: `${item.projectName || ""} / ${item.buildingName || ""}`,
    house: `${item.houseNumber || ""} / ${item.roomNumber || ""}`,
    area: `${item.area || ""} / ${item.floor || ""}`,
    location: `${item.buildingLatitude || ""}, ${item.buildingLongitude || ""}; ${item.roomLatitude || ""}, ${item.roomLongitude || ""}`,
    status: item.status || "",
    note: item.note || "",
  })[key] || "";

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
  try {
    const rows = await parseTableFile(file);
    const header = rows[0] || [];
    const dataRows = rows.slice(1);
    const labelIndex = (label) => header.findIndex((item) => item === label);
    await Promise.all(
      dataRows.map((row) => {
        const projectParts = String(row[labelIndex(labels.value.projectBuilding)] || "").split("/");
        const houseParts = String(row[labelIndex(labels.value.houseRoom)] || "").split("/");
        const areaParts = String(row[labelIndex(labels.value.areaFloor)] || "").split("/");
        return api.createRoom({
          projectName: projectParts[0]?.trim() || "",
          buildingName: projectParts[1]?.trim() || "",
          houseNumber: houseParts[0]?.trim() || "",
          roomNumber: houseParts[1]?.trim() || "",
          area: areaParts[0]?.trim() || "",
          floor: areaParts[1]?.trim() || "",
          status: row[labelIndex(labels.value.status)] || "VACANT",
          note: row[labelIndex(labels.value.note)] || "",
        });
      }),
    );
    await loadResources();
  } catch (error) {
    errorMessage.value = error.message || labels.value.importFailed;
  } finally {
    event.target.value = "";
  }
};

onMounted(() => {
  loadResources();
});
</script>
