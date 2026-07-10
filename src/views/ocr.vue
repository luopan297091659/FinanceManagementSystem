<template>
  <section class="page-shell">
    <div class="page-title-row">
      <div>
        <p class="eyebrow">OCR 中心</p>
        <h2>合同、房源凭证与文档识别</h2>
      </div>
      <button class="primary-button" type="button">上传文档</button>
    </div>

    <div class="content-grid">
      <div class="panel-card">
        <div class="placeholder-card">
          <p class="eyebrow">占位工作台</p>
          <h3>OCR 识别流程即将接入</h3>
          <p>当前已接入后端文档数据源，后续可继续扩展上传、识别、抽取文本与归档流程。</p>
          <div class="stat-grid">
            <div class="stat-box">
              <strong>{{ documents.length }}</strong>
              <span>已同步文档</span>
            </div>
            <div class="stat-box">
              <strong>{{ documents.filter((item) => item.extractedText).length }}</strong>
              <span>已提取内容</span>
            </div>
          </div>
        </div>
      </div>

      <div class="panel-card">
        <div class="table-head">
          <strong>最近文档</strong>
          <span>{{ documents.length }} 条</span>
        </div>
        <div v-if="documents.length" class="table-list">
          <div v-for="item in documents" :key="item.id" class="table-row compact-row">
            <div>
              <strong>{{ item.fileName }}</strong>
              <p>{{ item.documentType || 'document' }}</p>
            </div>
            <div>
              <p>{{ item.extractedText || '等待 OCR 识别' }}</p>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">当前暂无文档记录。</div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../services/api';

const documents = ref([]);
const loading = ref(false);
const errorMessage = ref('');

const loadData = async () => {
  loading.value = true;
  errorMessage.value = '';
  try {
    const payload = await api.bootstrap();
    documents.value = payload.documents || [];
  } catch (error) {
    errorMessage.value = error.message || '加载 OCR 数据失败';
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
  background: #f8fbff;
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
