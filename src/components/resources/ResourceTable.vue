<template>
  <div class="table-card data-table-card">
    <div class="table-head">
      <strong>{{ labels.resourceList }}</strong>
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
              <template v-if="column.key === 'project'">
                <strong v-if="hasValue(item.projectName)">{{ item.projectName }}</strong>
                <p v-if="hasValue(item.buildingName)">{{ item.buildingName }}</p>
              </template>
              <template v-else-if="column.key === 'house'">
                <strong v-if="hasValue(item.houseNumber)">{{ item.houseNumber }}</strong>
                <p v-if="hasValue(item.roomNumber)">{{ item.roomNumber }}</p>
              </template>
              <template v-else-if="column.key === 'area'">
                <span v-if="hasValue(item.area)">{{ item.area }} m²</span>
              </template>
              <template v-else-if="column.key === 'floor'">
                <span v-if="hasValue(item.floor)">{{ item.floor }}</span>
              </template>
              <template v-else-if="column.key === 'buildingLocation'">
                {{ coordinate(item.buildingLatitude, item.buildingLongitude) }}
              </template>
              <template v-else-if="column.key === 'roomLocation'">
                {{ coordinate(item.roomLatitude, item.roomLongitude) }}
              </template>
              <template v-else-if="column.key === 'address'">
                {{ item.address || "" }}
              </template>
              <template v-else-if="column.key === 'status'">
                <span class="status-pill" :class="(item.status || 'vacant').toLowerCase()">{{ statusLabel(item.status) }}</span>
              </template>
              <template v-else-if="column.key === 'contractPresence'">
                <span class="status-chip" :class="item.contractPresence ? 'contract-status-active' : 'contract-status-uncontracted'">{{ item.contractPresence ? labels.hasContract : labels.noContract }}</span>
              </template>
              <template v-else-if="column.key === 'currentContract'">
                <button v-if="item.currentContractId" class="table-link-button" type="button" @click="openContract(item.currentContractId)">{{ item.currentContract }}</button>
              </template>
              <template v-else-if="column.key === 'note'">
                {{ item.note || "" }}
              </template>
            </td>
            <td class="actions-cell">
              <div class="row-actions">
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

const statusLabel = (status) =>
  ({
    VACANT: props.labels.vacant,
    OCCUPIED: props.labels.occupied,
    MAINTENANCE: props.labels.maintenance,
    OVERDUE: props.labels.overdue,
    INACTIVE: props.labels.inactive,
  })[status] || status || "";

const hasValue = (value) => value !== null && value !== undefined && value !== "";
const coordinate = (latitude, longitude) => [latitude, longitude].filter(hasValue).join(", ");
const openContract = (contractId) => {
  window.open(`/contracts?contractId=${encodeURIComponent(contractId)}`, "_blank", "noopener,noreferrer");
};
</script>
