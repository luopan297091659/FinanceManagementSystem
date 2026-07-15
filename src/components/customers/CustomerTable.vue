<template>
  <div class="table-card data-table-card">
    <div class="table-head">
      <strong>客户清单</strong>
      <span>{{ items.length }} 条记录</span>
    </div>
    <div class="data-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th class="select-cell">
              <input type="checkbox" :checked="allSelected" @change="toggleAll" />
            </th>
            <th class="index-cell">序号</th>
            <th v-for="column in visibleColumns" :key="column.key">{{ column.label }}</th>
            <th class="actions-cell">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, index) in items" :key="item.id">
            <td class="select-cell">
              <input type="checkbox" :checked="selectedIds.includes(item.id)" @change="toggleOne(item.id)" />
            </td>
            <td class="index-cell">{{ index + 1 }}</td>
            <td v-for="column in visibleColumns" :key="column.key">
              <template v-if="column.key === 'name'">
                <strong>{{ item.name || "-" }}</strong>
                <p>{{ item.customerCode || "-" }}</p>
              </template>
              <template v-else-if="column.key === 'contact'">
                <p>{{ item.phone || "-" }}</p>
                <p>{{ item.email || "-" }}</p>
              </template>
              <template v-else-if="column.key === 'address'">
                <p>{{ item.address || "-" }}</p>
                <p>{{ item.note || "-" }}</p>
              </template>
              <template v-else-if="column.key === 'type'">
                <p>{{ item.kind === "owner" ? "业主" : "租客" }}</p>
                <p>{{ item.ownerType === "COMPANY" ? "法人/企业" : "个人" }}</p>
              </template>
              <template v-else-if="column.key === 'dates'">
                <p>{{ item.birthDate || "-" }}</p>
                <p>{{ item.annualIncome || "-" }}</p>
              </template>
              <template v-else-if="column.key === 'extra'">
                <p>{{ item.kana || "-" }}</p>
                <p>{{ item.nationality || "-" }}</p>
              </template>
            </td>
            <td class="actions-cell">
              <div class="row-actions">
                <button class="ghost-button mini" type="button" @click="emit('bind', item)">绑定</button>
                <button class="ghost-button mini" type="button" @click="emit('edit', item)">编辑</button>
                <button class="danger-button mini" type="button" @click="emit('delete', item.id)">删除</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  items: {
    type: Array,
    default: () => [],
  },
  columns: {
    type: Array,
    default: () => [],
  },
  selectedIds: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["edit", "delete", "bind", "update:selectedIds"]);

const visibleColumns = computed(() => props.columns.filter((column) => column.visible));
const pageIds = computed(() => props.items.map((item) => item.id));
const allSelected = computed(() => pageIds.value.length > 0 && pageIds.value.every((id) => props.selectedIds.includes(id)));

const toggleAll = () => {
  const selected = new Set(props.selectedIds);
  if (allSelected.value) {
    pageIds.value.forEach((id) => selected.delete(id));
  } else {
    pageIds.value.forEach((id) => selected.add(id));
  }
  emit("update:selectedIds", [...selected]);
};

const toggleOne = (id) => {
  const selected = new Set(props.selectedIds);
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  emit("update:selectedIds", [...selected]);
};
</script>
