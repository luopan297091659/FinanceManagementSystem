<template>
  <div class="table-card">
    <div class="table-head">
      <strong>{{ labels.title }}</strong>
      <span>{{ items.length }} {{ labels.records }}</span>
    </div>
    <div class="table-list">
      <div v-for="item in items" :key="item.id" class="table-row finance-row">
        <div>
          <strong>{{ item.description || labels.noDescription }}</strong>
          <p>{{ item.occurredAt }} · {{ item.roomLabel || labels.noRoom }}</p>
        </div>
        <div>
          <span class="status-pill" :class="item.kind">{{ item.kind === "income" ? labels.income : labels.expense }}</span>
          <p>¥{{ Number(item.amount || 0).toLocaleString() }}</p>
        </div>
        <div>
          <span class="status-pill neutral">{{ processingLabel(item.processingStatus) }}</span>
          <p>{{ confirmationLabel(item.confirmationStatus) }}</p>
        </div>
        <div class="row-actions">
          <button class="ghost-button mini" type="button" @click="emit('edit', item)">{{ labels.edit }}</button>
          <button class="danger-button mini" type="button" @click="emit('delete', item.id)">{{ labels.delete }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  items: {
    type: Array,
    default: () => [],
  },
  labels: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(["edit", "delete"]);

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
