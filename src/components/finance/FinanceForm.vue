<template>
  <form class="panel-form" @submit.prevent="emit('submit')">
    <div class="field-grid">
      <label>
        {{ labels.type }}
        <select v-model="form.kind">
          <option value="income">{{ labels.income }}</option>
          <option value="expense">{{ labels.expense }}</option>
        </select>
      </label>

      <label>
        {{ labels.feeItem }}
        <select v-model="form.feeItemId" required>
          <option value="">{{ labels.selectFeeItem }}</option>
          <option v-for="item in filteredFeeItems" :key="item.id" :value="item.id">
            {{ item.name }}
          </option>
        </select>
      </label>

      <label>
        {{ labels.amount }}
        <input v-model.number="form.amount" type="number" min="0" step="1" required />
      </label>

      <label>
        {{ labels.date }}
        <input v-model="form.occurredAt" type="date" required />
      </label>

      <label>
        {{ labels.room }}
        <select v-model="form.roomId">
          <option value="">{{ labels.noRoom }}</option>
          <option v-for="room in rooms" :key="room.id" :value="room.id">
            {{ room.houseNumber || room.number }} / {{ room.number }}
          </option>
        </select>
      </label>

      <label>
        {{ labels.counterparty }}
        <input v-model="form.customerName" :placeholder="labels.counterpartyPlaceholder" />
      </label>

      <label>
        {{ labels.processingStatus }}
        <select v-model="form.processingStatus">
          <option value="INCLUDED">{{ labels.included }}</option>
          <option value="DETAIL_ONLY">{{ labels.detailOnly }}</option>
          <option value="DUPLICATE_EXCLUDED">{{ labels.duplicateExcluded }}</option>
        </select>
      </label>

      <label>
        {{ labels.confirmationStatus }}
        <select v-model="form.confirmationStatus">
          <option value="PENDING">{{ labels.pending }}</option>
          <option value="CONFIRMED">{{ labels.confirmed }}</option>
          <option value="REJECTED">{{ labels.rejected }}</option>
        </select>
      </label>

      <label class="wide-field">
        {{ labels.note }}
        <input v-model="form.description" :placeholder="labels.notePlaceholder" />
      </label>
    </div>

    <div class="form-actions">
      <button class="primary-button" type="submit">{{ editing ? labels.update : labels.create }}</button>
      <button v-if="editing" class="ghost-button" type="button" @click="emit('cancel')">{{ labels.cancel }}</button>
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
  rooms: {
    type: Array,
    default: () => [],
  },
  feeItems: {
    type: Array,
    default: () => [],
  },
  labels: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(["update:modelValue", "submit", "cancel"]);

const form = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});

const editing = computed(() => Boolean(props.modelValue.id));
const filteredFeeItems = computed(() =>
  props.feeItems.filter((item) => item.enabled && (item.category === props.modelValue.kind || item.category === "both")),
);
</script>
