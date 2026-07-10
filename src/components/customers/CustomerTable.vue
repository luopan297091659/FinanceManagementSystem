<template>
  <div class="table-card">
    <div class="table-head">
      <strong>客户清单</strong>
      <span>{{ items.length }} 条记录</span>
    </div>
    <div class="table-list">
      <div v-for="item in items" :key="item.id" class="table-row">
        <div>
          <strong>{{ item.name }}</strong>
          <p>{{ item.customerCode }} · {{ item.kind === 'owner' ? '业主' : '租客' }}</p>
        </div>
        <div>
          <p>{{ item.phone || '—' }}</p>
          <p>{{ item.email || '—' }}</p>
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
</script>
