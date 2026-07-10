<template>
  <section class="page-shell">
    <div class="page-title-row">
      <div>
        <p class="eyebrow">房源管理</p>
        <h2>房源结构与状态维护</h2>
      </div>
      <button class="primary-button" type="button" @click="resetForm">新增房源</button>
    </div>

    <div class="content-grid">
      <div class="panel-card">
        <ResourceForm v-model="form" @submit="saveResource" @cancel="resetForm" />
      </div>
      <div class="panel-card">
        <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>
        <p v-if="loading" class="form-hint">正在同步后端数据…</p>
        <ResourceTable :items="resources" @edit="editResource" @delete="deleteResource" />
      </div>
    </div>
  </section>
</template>

<script setup>
import { onMounted, ref } from "vue";
import ResourceForm from "../components/resources/ResourceForm.vue";
import ResourceTable from "../components/resources/ResourceTable.vue";
import { api } from "../services/api";

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
const loading = ref(false);
const errorMessage = ref("");

const resetForm = () => {
  form.value = blankForm();
};

const loadResources = async () => {
  loading.value = true;
  errorMessage.value = "";
  try {
    const payload = await api.bootstrap();
    resources.value = (payload.rooms || []).map((room) => ({
      id: room.id,
      projectName: payload.projects.find((project) => project.id === room.projectId)?.name || "",
      buildingName: payload.buildings.find((building) => building.id === room.buildingId)?.name || "",
      buildingLatitude: payload.buildings.find((building) => building.id === room.buildingId)?.latitude || "",
      buildingLongitude: payload.buildings.find((building) => building.id === room.buildingId)?.longitude || "",
      houseNumber: room.houseNumber,
      roomNumber: room.number,
      area: room.area,
      floor: room.floor,
      roomLatitude: room.latitude || "",
      roomLongitude: room.longitude || "",
      status: room.status,
      note: room.note,
    }));
  } catch (error) {
    errorMessage.value = error.message || "加载房源失败";
  } finally {
    loading.value = false;
  }
};

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

    if (form.value.id) {
      await api.updateRoom(form.value.id, payload);
    } else {
      await api.createRoom(payload);
    }
    await loadResources();
    resetForm();
  } catch (error) {
    errorMessage.value = error.message || "保存房源失败";
  }
};

const editResource = (item) => {
  form.value = { ...item };
};

const deleteResource = async (id) => {
  try {
    await api.deleteRoom(id);
    await loadResources();
  } catch (error) {
    errorMessage.value = error.message || "删除房源失败";
  }
};

onMounted(() => {
  loadResources();
});
</script>
