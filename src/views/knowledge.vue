<template>
  <section class="page-shell">
    <div class="page-title-row">
      <div></div>
      <button class="primary-button" type="button">{{ labels.add }}</button>
    </div>

    <div class="content-grid">
      <div class="panel-card">
        <div class="placeholder-card">
          <p class="eyebrow">{{ labels.workspace }}</p>
          <h3>{{ labels.comingSoon }}</h3>
          <p>{{ labels.description }}</p>
          <div class="stat-grid">
            <div class="stat-box">
              <strong>{{ knowledgeItems.length }}</strong>
              <span>{{ labels.entries }}</span>
            </div>
            <div class="stat-box">
              <strong>{{ knowledgeItems.filter((item) => item.content).length }}</strong>
              <span>{{ labels.withContent }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="panel-card">
        <div class="table-head">
          <strong>{{ labels.entries }}</strong>
          <span>{{ knowledgeItems.length }} {{ labels.itemUnit }}</span>
        </div>
        <div v-if="knowledgeItems.length" class="table-list">
          <div v-for="item in knowledgeItems" :key="item.id" class="table-row compact-row">
            <div>
              <strong>{{ item.title }}</strong>
              <p>{{ item.sourceType || 'knowledge' }}</p>
            </div>
            <div>
              <p>{{ item.content || labels.noSummary }}</p>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">{{ labels.empty }}</div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from '../i18n';
import { api } from '../services/api';

const knowledgeItems = ref([]);
const loading = ref(false);
const errorMessage = ref('');
const { dictionary } = useI18n();
const labels = computed(() => dictionary.value.knowledgeLabels);

const loadData = async () => {
  loading.value = true;
  errorMessage.value = '';
  try {
    const payload = await api.bootstrap('knowledge');
    knowledgeItems.value = payload.knowledgeDocuments || [];
  } catch (error) {
    errorMessage.value = error.message || labels.value.loadFailed;
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadData();
});
</script>

<style scoped>
.placeholder-card {
  display: grid;
  gap: 12px;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.stat-box {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px;
  background: #f7f5ff;
}

.stat-box strong {
  display: block;
  margin-bottom: 4px;
  font-size: 24px;
  color: var(--primary);
}

.compact-row {
  grid-template-columns: 1fr 1.2fr;
}

.empty-state {
  border: 1px dashed var(--line);
  border-radius: 12px;
  padding: 16px;
  color: var(--muted);
  text-align: center;
}
</style>
