<template>
  <div class="table-card data-table-card">
    <div class="table-head">
      <strong>{{ labels.customerList }}</strong>
      <span>{{ total ?? items.length }} {{ common.records }}</span>
    </div>
    <div class="data-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th class="select-cell">
              <input type="checkbox" :checked="allSelected" @change="toggleAll" />
            </th>
            <th class="index-cell">{{ common.index }}</th>
            <th v-for="column in visibleColumns" :key="column.key">{{ labels[column.labelKey] }}</th>
            <th class="actions-cell">{{ common.actions }}</th>
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
                <strong v-if="item.name">{{ item.name }}</strong>
                <p v-if="item.customerCode">{{ item.customerCode }}</p>
              </template>
              <template v-else-if="column.key === 'contact'">
                <p v-if="item.phone">{{ item.phone }}</p>
                <p v-if="item.email">{{ item.email }}</p>
              </template>
              <template v-else-if="column.key === 'address'">
                <p v-if="item.address">{{ item.address }}</p>
              </template>
              <template v-else-if="column.key === 'type'">
                <p>{{ item.kind === "owner" ? labels.owner : labels.tenant }}</p>
                <p>{{ item.ownerType === "COMPANY" ? labels.company : labels.person }}</p>
              </template>
              <template v-else-if="column.key === 'dates'">
                <p v-if="item.birthDate">{{ item.birthDate }}</p>
                <p v-if="item.annualIncome">{{ item.annualIncome }}</p>
              </template>
              <template v-else-if="column.key === 'extra'">
                <p v-if="item.kana">{{ item.kana }}</p>
                <p v-if="item.nationality">{{ item.nationality }}</p>
              </template>
              <template v-else-if="column.key === 'occupation'">
                {{ item.occupation || "" }}
              </template>
              <template v-else-if="column.key === 'attachments'">
                {{ item.attachments || item.note || "" }}
              </template>
            </td>
            <td class="actions-cell">
              <div class="row-actions">
                <button class="ghost-button mini" type="button" @click="emit('bind', item)">{{ labels.bind }}</button>
                <button class="ghost-button mini" type="button" @click="emit('edit', item)">{{ common.edit }}</button>
                <button class="danger-button mini" type="button" @click="emit('delete', item.id)">{{ common.delete }}</button>
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
  labels: {
    type: Object,
    required: true,
  },
  common: {
    type: Object,
    required: true,
  },
  total: {
    type: Number,
    default: null,
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
