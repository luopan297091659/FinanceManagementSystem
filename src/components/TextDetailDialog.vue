<template>
  <button
    v-if="hasText"
    class="text-preview-button"
    type="button"
    :title="common.viewFullText"
    @click="open = true"
  >
    {{ text }}
  </button>
  <span v-else>-</span>

  <Teleport to="body">
    <div v-if="open" class="modal-overlay text-detail-overlay" @click.self="open = false">
      <div class="modal-card text-detail-modal" role="dialog" aria-modal="true" :aria-label="title">
        <div class="modal-header">
          <h3>{{ title }}</h3>
          <button class="modal-close-button" type="button" :title="common.close" @click="open = false">×</button>
        </div>
        <div class="text-detail-content">{{ text }}</div>
        <div class="text-detail-actions">
          <button class="secondary-button" type="button" @click="open = false">{{ common.close }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref } from "vue";

const props = defineProps({
  text: { type: [String, Number], default: "" },
  title: { type: String, required: true },
  common: { type: Object, required: true },
});

const open = ref(false);
const hasText = computed(() => props.text !== null && props.text !== undefined && String(props.text).trim() !== "");
</script>

<style scoped>
.text-preview-button {
  display: block;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  padding: 0;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.text-preview-button:hover,
.text-preview-button:focus-visible {
  color: var(--primary);
  text-decoration: underline;
}

.text-detail-overlay { z-index: 1100; }
.text-detail-modal { width: min(640px, 92vw); }
.text-detail-content {
  max-height: min(60vh, 520px);
  overflow: auto;
  color: var(--text);
  line-height: 1.7;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.text-detail-actions { display: flex; justify-content: flex-end; margin-top: 20px; }
</style>
