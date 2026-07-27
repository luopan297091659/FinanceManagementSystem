<template>
  <form class="panel-form" @submit.prevent="emit('submit')">
    <div class="field-grid">
      <label>
        {{ labels.project }}
        <input v-model="form.projectName" required placeholder="住之江区西住之江" />
      </label>
      <label>
        {{ labels.building }}
        <input v-model="form.buildingName" required placeholder="T1" />
      </label>
      <label>
        {{ labels.houseNumber }}
        <input v-model="form.houseNumber" required placeholder="H0001" />
      </label>
      <label>
        {{ labels.roomNumber }}
        <input v-model="form.roomNumber" required placeholder="101" />
      </label>
      <label>
        {{ labels.buildingLatitude }}
        <input v-model="form.buildingLatitude" type="text" placeholder="34.6937378" />
      </label>
      <label>
        {{ labels.buildingLongitude }}
        <input v-model="form.buildingLongitude" type="text" placeholder="135.5021651" />
      </label>
      <label>
        {{ labels.area }}
        <input v-model.number="form.area" type="number" min="0" step="0.01" />
      </label>
      <label>
        {{ labels.floor }}
        <input v-model.number="form.floor" type="number" />
      </label>
      <label>
        {{ labels.roomLatitude }}
        <input v-model="form.roomLatitude" type="text" :placeholder="labels.defaultBuilding" />
      </label>
      <label>
        {{ labels.roomLongitude }}
        <input v-model="form.roomLongitude" type="text" :placeholder="labels.defaultBuilding" />
      </label>
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
      <label class="span-2">
        {{ labels.note }}
        <textarea v-model="form.note" rows="3" :placeholder="labels.notePlaceholder"></textarea>
      </label>
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
  modelValue: {
    type: Object,
    required: true,
  },
  labels: {
    type: Object,
    required: true,
  },
  common: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(["submit", "cancel"]);

const form = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});

const editing = computed(() => Boolean(props.modelValue.id));
</script>
