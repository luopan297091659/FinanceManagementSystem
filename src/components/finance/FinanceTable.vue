<template>
  <div class="table-card data-table-card">
    <div class="table-head">
      <strong>{{ labels.title }}</strong>
      <span>{{ items.length }} {{ labels.records }}</span>
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
              <template v-if="column.key === 'description'">
                <strong>{{ item.description || labels.noDescription }}</strong>
                <p>{{ item.occurredAt || "-" }}</p>
              </template>
              <template v-else-if="column.key === 'amount'">
                <span class="status-pill" :class="item.kind">{{ item.kind === "income" ? labels.income : labels.expense }}</span>
                <p>{{ Number(item.amount || 0).toLocaleString() }}</p>
              </template>
              <template v-else-if="column.key === 'room'">
                <p>{{ item.roomLabel || "-" }}</p>
              </template>
              <template v-else-if="column.key === 'status'">
                <span class="status-pill neutral">{{ processingLabel(item.processingStatus) }}</span>
                <p>{{ confirmationLabel(item.confirmationStatus) }}</p>
              </template>
              <template v-else-if="column.key === 'customer'">
                <p>{{ item.customerName || "-" }}</p>
              </template>
            </td>
            <td class="actions-cell">
              <div class="row-actions">
                <button class="ghost-button mini" type="button" @click="emit('edit', item)">{{ labels.edit }}</button>
                <button class="danger-button mini" type="button" @click="emit('delete', item.id)">{{ labels.delete }}</button>
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
  labels: {
    type: Object,
    required: true,
  },
  selectedIds: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["edit", "delete", "update:selectedIds"]);

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

const processingLabel = (status) =>
  ({
    INCLUDED: props.labels.included,
    DETAIL_ONLY: props.labels.detailOnly,
    DUPLICATE_EXCLUDED: props.labels.duplicateExcluded,
  })[status] || status;

const confirmationLabel = (status) =>
  ({
    PENDING: props.labels.pending,
    CONFIRMED: props.labels.confirmed,
    REJECTED: props.labels.rejected,
  })[status] || status;
</script>
