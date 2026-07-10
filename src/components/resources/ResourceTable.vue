<template>
  <div class="table-card">
    <div class="table-head">
      <strong>房源清单</strong>
      <span>{{ items.length }} 条记录</span>
    </div>
    <div class="table-list">
      <div class="table-row resource-row header">
        <div>项目 / 建筑</div>
        <div>房屋</div>
        <div>面积 / 楼层</div>
        <div>状态</div>
        <div>操作</div>
      </div>
      <div v-for="item in items" :key="item.id" class="table-row resource-row">
        <div>
          <strong>{{ item.projectName || '未指定项目' }} / {{ item.buildingName || '未指定楼栋' }}</strong>
          <p>{{ item.note || '暂无备注' }}</p>
        </div>
        <div>
          <p>{{ item.houseNumber || '—' }} - {{ item.roomNumber || '—' }}</p>
          <p>楼栋经纬：{{ item.buildingLatitude || '—' }}, {{ item.buildingLongitude || '—' }}</p>
        </div>
        <div>
          <p>{{ item.area || '—' }}㎡</p>
          <p>{{ item.floor || '—' }}层</p>
        </div>
        <div>
          <span class="status-pill" :class="(item.status || 'vacant').toLowerCase()">{{ statusLabel(item.status) }}</span>
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
  OVERDUE: "逾期",
  INACTIVE: "停用",
})[status] || status;
</script>

<style scoped>
.resource-row {
  grid-template-columns: 1.3fr 0.9fr auto;
  align-items: start;
}
</style>
