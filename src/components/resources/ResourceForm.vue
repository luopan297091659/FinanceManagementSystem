<template>
  <form class="panel-form" @submit.prevent="emit('submit')">
    <div class="field-grid">
      <h4 class="form-section-title">{{ labels.buildingInformation }}</h4>
      <label>{{ labels.building }}<input v-model="form.buildingName" required /></label>
      <label>{{ labels.propertyCode }}<input v-model="form.propertyCode" /></label>
      <label>{{ labels.postalCode }}<input v-model="form.postalCode" /></label>
      <label>{{ labels.address }}<input v-model="form.address" /></label>
      <label>{{ labels.prefecture }}<input v-model="form.prefecture" /></label>
      <label>{{ labels.city }}<input v-model="form.city" /></label>
      <label>{{ labels.ward }}<input v-model="form.ward" /></label>
      <label>{{ labels.addressLine1 }}<input v-model="form.addressLine1" /></label>
      <label class="span-2">{{ labels.addressLine2 }}<input v-model="form.addressLine2" /></label>
      <label>{{ labels.buildingType }}<input v-model="form.buildingType" /></label>
      <label>{{ labels.propertyUsageType }}<input v-model="form.propertyUsageType" /></label>
      <label>
        {{ labels.managementStatus }}
        <select v-model="form.managementStatus">
          <option value="ACTIVE">{{ labels.active }}</option>
          <option value="INACTIVE">{{ labels.inactive }}</option>
        </select>
      </label>
      <div v-if="editing" class="owner-info-field span-2">
        <span>{{ labels.ownerName }}</span>
        <div class="owner-links">
          <a v-for="owner in form.owners || []" :key="owner.id" :href="ownerHref(owner.id)" target="_blank" rel="noopener noreferrer">{{ owner.name }}</a>
          <span v-if="!form.owners?.length" class="owner-empty">{{ labels.noOwner }}</span>
        </div>
      </div>
      <label class="span-2">{{ labels.propertyRemark }}<textarea v-model="form.propertyRemark" rows="2"></textarea></label>

      <h4 class="form-section-title">{{ labels.roomInformation }}</h4>
      <template v-if="editing">
        <label class="span-2">{{ labels.currentContractSearch }}<input v-model="contractSearch" type="search" :placeholder="labels.currentContractSearchPlaceholder" /></label>
        <label class="span-2">{{ labels.currentContract }}<select v-model="form.currentContractId" :disabled="!contractOptions.length"><option value="" disabled>{{ labels.selectCurrentContract }}</option><option v-for="option in filteredContractOptions" :key="option.id" :value="option.id">{{ option.label }}</option></select></label>
      </template>
      <label>{{ labels.roomCode }}<input v-model="form.roomCode" /></label>
      <label>{{ labels.houseNumber }}<input v-model="form.houseNumber" /></label>
      <label>{{ labels.roomNumber }}<input v-model="form.roomNumber" /></label>
      <label>{{ labels.displayName }}<input v-model="form.displayName" /></label>
      <label>
        {{ labels.unitType }}
        <select v-model="form.unitType">
          <option v-for="type in unitTypes" :key="type" :value="type">{{ labels.unitTypes?.[type] || type }}</option>
        </select>
      </label>
      <label>{{ labels.roomUsageType }}<input v-model="form.roomUsageType" /></label>
      <label>{{ labels.floorLabel }}<input v-model="form.floorLabel" /></label>
      <label>
        {{ labels.status }}
        <select v-model="form.status">
          <option value="VACANT">{{ labels.vacant }}</option>
          <option value="OCCUPIED">{{ labels.occupied }}</option>
          <option value="MAINTENANCE">{{ labels.maintenance }}</option>
          <option value="OVERDUE">{{ labels.overdue }}</option>
          <option value="INACTIVE">{{ labels.inactive }}</option>
        </select>
      </label>
      <label class="span-2">{{ labels.note }}<textarea v-model="form.note" rows="3" :placeholder="labels.notePlaceholder"></textarea></label>
      <label class="span-2">{{ labels.roomRemark }}<textarea v-model="form.roomRemark" rows="2"></textarea></label>
    </div>

    <div class="form-actions">
      <button class="primary-button" type="submit">{{ editing ? common.update : labels.newResource }}</button>
      <button v-if="editing" class="ghost-button" type="button" @click="emit('cancel')">{{ common.cancel }}</button>
    </div>
  </form>
</template>

<script setup>
import { computed, ref } from "vue";
import { appPath } from "../../utils/appPath";

const props = defineProps({
  modelValue: { type: Object, required: true },
  labels: { type: Object, required: true },
  common: { type: Object, required: true },
  contractOptions: { type: Array, default: () => [] },
});

const emit = defineEmits(["submit", "cancel"]);
const form = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});
const editing = computed(() => Boolean(props.modelValue.id));
const contractSearch = ref("");
const filteredContractOptions = computed(() => {
  const query = contractSearch.value.trim().toLowerCase();
  const options = query ? props.contractOptions.filter((option) => option.searchText.includes(query)) : props.contractOptions;
  const current = props.contractOptions.find((option) => option.id === props.modelValue.currentContractId);
  return current && !options.some((option) => option.id === current.id) ? [current, ...options] : options;
});
const unitTypes = ["ROOM", "HOUSE", "SHOP", "OFFICE", "PARKING", "SIGNBOARD", "BASE_STATION", "VENDING", "MINPAKU", "OTHER"];
const ownerHref = (ownerId) => `${appPath("/owners")}?ownerId=${encodeURIComponent(ownerId)}`;
</script>

<style scoped>
.owner-info-field { display: grid; gap: 6px; color: var(--muted); font-size: 13px; }
.owner-links { min-height: 40px; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 9px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-2); }
.owner-links a { color: var(--primary); font-weight: 800; text-decoration: underline; text-underline-offset: 2px; }
.owner-links a + a::before { content: "/"; margin-right: 8px; color: var(--muted); text-decoration: none; }
.owner-empty { color: var(--muted); }
</style>
