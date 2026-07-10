<template>
  <div class="table-card">
    <div class="table-head">
      <strong>客户清单</strong>
      <span>{{ items.length }} 条记录</span>
    </div>
    <div class="table-list">
      <div class="table-row customer-row header">
        <div>客户</div>
        <div>联系方式</div>
        <div>地址 / 备注</div>
        <div>客户类型</div>
        <div>操作</div>
      </div>
      <div v-for="item in items" :key="item.id" class="table-row customer-row">
        <div>
          <strong>{{ item.name }}</strong>
          <p>{{ item.customerCode || '—' }}</p>
          <p>{{ item.birthDate ? `出生：${item.birthDate}` : '' }} {{ item.annualIncome ? ` · 年收入：${item.annualIncome}` : '' }}</p>
        </div>
        <div>
          <p>{{ item.phone || '—' }}</p>
          <p>{{ item.email || '—' }}</p>
        </div>
        <div>
          <p>{{ item.address || '—' }}</p>
          <p>{{ item.note || '暂无备注' }}</p>
        </div>
        <div>
          <p>{{ item.kind === 'owner' ? '业主' : '租客' }}</p>
          <p>{{ item.ownerType === 'COMPANY' ? '法人/企业' : '个人' }}</p>
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

<style scoped>
.customer-row {
  grid-template-columns: 1.2fr 1fr auto;
  align-items: start;
}
</style>
