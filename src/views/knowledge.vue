<template>
  <section class="page-shell">
    <div class="page-title-row">
      <div>
        <p class="eyebrow">AI 知识库</p>
        <h2>房源、租约与业务知识检索入口</h2>
      </div>
      <button class="primary-button" type="button">新增知识条目</button>
    </div>

    <div class="content-grid">
      <div class="panel-card">
        <div class="placeholder-card">
          <p class="eyebrow">占位工作台</p>
          <h3>知识问答与文档检索模块即将开放</h3>
          <p>当前已把后端 knowledgeDocuments 数据接入前端，后续可继续扩展向量检索、问答和关联推荐。</p>
          <div class="stat-grid">
            <div class="stat-box">
              <strong>{{ knowledgeItems.length }}</strong>
              <span>知识条目</span>
            </div>
            <div class="stat-box">
              <strong>{{ knowledgeItems.filter((item) => item.content).length }}</strong>
              <span>已写入内容</span>
            </div>
          </div>
        </div>
      </div>

      <div class="panel-card">
        <div class="table-head">
          <strong>知识条目</strong>
          <span>{{ knowledgeItems.length }} 条</span>
        </div>
        <div v-if="knowledgeItems.length" class="table-list">
          <div v-for="item in knowledgeItems" :key="item.id" class="table-row compact-row">
            <div>
              <strong>{{ item.title }}</strong>
              <p>{{ item.sourceType || 'knowledge' }}</p>
            </div>
            <div>
              <p>{{ item.content || '暂无摘要' }}</p>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">当前暂无知识库记录。</div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../services/api';

const knowledgeItems = ref([]);
const loading = ref(false);
const errorMessage = ref('');

const loadData = async () => {
  loading.value = true;
  errorMessage.value = '';
  try {
    const payload = await api.bootstrap();
    knowledgeItems.value = payload.knowledgeDocuments || [];
  } catch (error) {
    errorMessage.value = error.message || '加载知识库失败';
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
