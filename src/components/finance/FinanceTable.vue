<template>
  <div class="table-card">
    <div class="table-head">
      <strong>财务流水</strong>
      <span>{{ items.length }} 条记录</span>
    </div>
    <div class="table-list">
      <div v-for="item in items" :key="item.id" class="table-row">
        <div>
          <strong>{{ item.description }}</strong>
          <p>{{ item.occurredAt }}</p>
        </div>
        <div>
          <span class="status-pill" :class="item.kind">{{ item.kind === 'income' ? '收入' : '支出' }}</span>
          <p>¥{{ Number(item.amount || 0).toLocaleString() }}</p>
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
