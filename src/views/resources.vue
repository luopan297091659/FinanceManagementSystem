<template>
  <section class="page-shell data-page">
    <div class="page-title-row">
      <div>
        <p class="eyebrow">房源管理</p>
        <h2>房源结构与状态维护</h2>
      </div>
    </div>

    <div class="content-grid data-content-grid">
      <div class="panel-card full-panel">
        <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>
        <p v-if="loading" class="form-hint">正在同步后端数据...</p>
        <div class="table-controls data-toolbar">
          <div class="toolbar-actions">
            <input v-model="searchQuery" class="search-input" type="text" placeholder="搜索房源、楼栋、房号、状态..." />
            <button class="primary-button" type="button" @click="openResourceModal">新增房源</button>
            <button class="secondary-button" type="button" @click="triggerImport">导入</button>
            <button class="secondary-button" type="button" @click="exportResources">导出</button>
            <button class="danger-button" type="button" :disabled="!selectedIds.length" @click="batchDelete">批量删除</button>
            <input ref="fileInput" class="hidden-file-input" type="file" accept=".xls,.csv,.tsv,.html,.txt" @change="importResources" />
          </div>
          <div class="column-panel-container">
            <button class="secondary-button" type="button" @click="showColumnPanel = !showColumnPanel">显示字段 ▾</button>
            <div v-if="showColumnPanel" class="column-panel">
              <div class="panel-body">
                <label v-for="column in resourceColumns" :key="column.key" class="panel-item">
                  <input type="checkbox" v-model="column.visible" />
                  {{ column.label }}
                </label>
              </div>
            </div>
          </div>
        </div>
        <ResourceTable
          v-model:selected-ids="selectedIds"
          :items="filteredResources"
          :columns="resourceColumns"
          @edit="editResource"
          @delete="deleteResource"
        />
      </div>
    </div>
    <div v-if="showResourceModal" class="modal-overlay" @click.self="closeResourceModal">
      <div class="modal-card">
        <div class="modal-header">
          <h3>{{ resourceModalTitle }}</h3>
          <button class="modal-close-button" type="button" @click="closeResourceModal">×</button>
        </div>
        <ResourceForm v-model="form" @submit="saveResource" @cancel="closeResourceModal" />
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import ResourceForm from "../components/resources/ResourceForm.vue";
import ResourceTable from "../components/resources/ResourceTable.vue";
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
const resources = ref([]);
const selectedIds = ref([]);
const fileInput = ref(null);
const loading = ref(false);
const errorMessage = ref("");
const searchQuery = ref("");
const showResourceModal = ref(false);
const resourceModalTitle = ref("新增房源");
const resourceColumns = ref([
  { key: "project", label: "项目 / 楼栋", visible: true },
  { key: "house", label: "房屋编号 / 房号", visible: true },
  { key: "area", label: "面积 / 楼层", visible: true },
  { key: "location", label: "经纬度", visible: true },
  { key: "status", label: "状态", visible: true },
  { key: "note", label: "备注", visible: true },
]);

const showColumnPanel = ref(false);
const visibleResourceColumns = computed(() => resourceColumns.value.filter((column) => column.visible));
const filteredResources = computed(() => resources.value.filter(matchesSearch));

const resetForm = () => {
  form.value = blankForm();
};

const openResourceModal = () => {
  resetForm();
  resourceModalTitle.value = "新增房源";
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
    errorMessage.value = error.message || "加载房源失败";
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
    errorMessage.value = error.message || "保存房源失败";
  }
};

const editResource = (item) => {
  form.value = { ...item };
  resourceModalTitle.value = "编辑房源";
  showResourceModal.value = true;
};

const deleteResource = async (id) => {
  try {
    await api.deleteRoom(id);
    await loadResources();
  } catch (error) {
    errorMessage.value = error.message || "删除房源失败";
  }
};

const batchDelete = async () => {
  if (!selectedIds.value.length) return;
  try {
    await Promise.all(selectedIds.value.map((id) => api.deleteRoom(id)));
    selectedIds.value = [];
    await loadResources();
  } catch (error) {
    errorMessage.value = error.message || "批量删除房源失败";
  }
};

const exportResources = () => {
  exportTableXls(
    "房源管理.xls",
    visibleResourceColumns.value,
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
        const projectParts = String(row[labelIndex("项目 / 楼栋")] || "").split("/");
        const houseParts = String(row[labelIndex("房屋编号 / 房号")] || "").split("/");
        const areaParts = String(row[labelIndex("面积 / 楼层")] || "").split("/");
        return api.createRoom({
          projectName: projectParts[0]?.trim() || "",
          buildingName: projectParts[1]?.trim() || "",
          houseNumber: houseParts[0]?.trim() || "",
          roomNumber: houseParts[1]?.trim() || "",
          area: areaParts[0]?.trim() || "",
          floor: areaParts[1]?.trim() || "",
          status: row[labelIndex("状态")] || "VACANT",
          note: row[labelIndex("备注")] || "",
        });
      }),
    );
    await loadResources();
  } catch (error) {
    errorMessage.value = error.message || "导入房源失败";
  } finally {
    event.target.value = "";
  }
};

onMounted(() => {
  loadResources();
});
</script>
