<template>
  <nav v-if="total > 0" class="data-pagination" :aria-label="labels.pagination || 'Pagination'">
    <div class="pagination-summary">
      {{ labels.total || "Total" }} <strong>{{ total }}</strong>
    </div>
    <div class="pagination-controls">
      <label class="page-size-control">
        <span>{{ labels.pageSize || "Rows" }}</span>
        <select :value="pageSize" @change="changePageSize">
          <option v-for="option in pageSizeOptions" :key="option" :value="option">{{ option }}</option>
        </select>
      </label>
      <button class="secondary-button mini" type="button" :disabled="page <= 1" @click="goTo(page - 1)">{{ labels.previous || "Previous" }}</button>
      <span class="pagination-page">{{ labels.page || "Page" }} <strong>{{ page }}</strong> / {{ totalPages }}</span>
      <button class="secondary-button mini" type="button" :disabled="page >= totalPages" @click="goTo(page + 1)">{{ labels.next || "Next" }}</button>
    </div>
  </nav>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  page: { type: Number, default: 1 },
  pageSize: { type: Number, default: 20 },
  total: { type: Number, default: 0 },
  pageSizeOptions: { type: Array, default: () => [10, 20, 50, 100] },
  labels: { type: Object, default: () => ({}) },
});

const emit = defineEmits(["update:page", "update:pageSize"]);
const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));

const goTo = (page) => emit("update:page", Math.min(Math.max(1, page), totalPages.value));
const changePageSize = (event) => {
  emit("update:pageSize", Number(event.target.value));
  emit("update:page", 1);
};
</script>
