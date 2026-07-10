<template>
  <div class="table-card">
    <div class="table-head">
      <strong>房源清单</strong>
      <span>{{ items.length }} 条记录</span>
    </div>
    <div class="table-list">
      <div v-for="item in items" :key="item.id" class="table-row">
        <div>
          <strong>{{ item.projectName }} / {{ item.buildingName }}</strong>
          <p>{{ item.houseNumber }}-{{ item.roomNumber }}</p>
        </div>
        <div>
          <span class="status-pill" :class="item.status.toLowerCase()">{{ statusLabel(item.status) }}</span>
        </div>
        <div class="row-actions">
          <button class="ghost-button mini" type="button" @click="emit('edit', item)">编辑</button>
          <button class="danger-button mini" type="button" @click="emit('delete', item.id)">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  items: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["edit", "delete"]);

const statusLabel = (status) => ({
  VACANT: "空室",
  OCCUPIED: "入居中",
  MAINTENANCE: "维修中",
})[status] || status;
</script>
