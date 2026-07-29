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
      <label class="span-2">{{ labels.propertyRemark }}<textarea v-model="form.propertyRemark" rows="2"></textarea></label>

      <h4 class="form-section-title">{{ labels.roomInformation }}</h4>
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
import { computed } from "vue";

const props = defineProps({
  modelValue: { type: Object, required: true },
  labels: { type: Object, required: true },
  common: { type: Object, required: true },
});

const emit = defineEmits(["submit", "cancel"]);
const form = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});
const editing = computed(() => Boolean(props.modelValue.id));
const unitTypes = ["ROOM", "HOUSE", "SHOP", "OFFICE", "PARKING", "SIGNBOARD", "BASE_STATION", "VENDING", "MINPAKU", "OTHER"];
</script>
