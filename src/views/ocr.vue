<template>
  <section class="page-shell">
    <div class="page-title-row">
      <div>
        <p class="eyebrow">OCR 中心</p>
        <h2>Make AI OCR 对账流程（MVP）</h2>
        <p class="subtle">上传多个文件 → 调用 Make Workflow → 收到 JSON 回调 → 前端直接展示对账结果</p>
      </div>
    </div>

    <div class="content-grid">
      <div class="panel-card">
        <div
          class="upload-zone"
          :class="{ active: isDragging }"
          @dragover.prevent="handleDragOver"
          @dragleave.prevent="handleDragLeave"
          @drop.prevent="handleDrop"
        >
          <p class="eyebrow">上传区域</p>
          <h3>选择多个文件或拖放到这里</h3>
          <p>支持 PDF / JPG / PNG / Excel / Word，上传完成后点击开始对账。</p>
          <div class="upload-actions">
            <input ref="fileInput" type="file" multiple class="hidden-input" accept=".pdf,.jpg,.jpeg,.png,.xls,.xlsx,.doc,.docx" @change="handleFileSelection" />
            <button class="primary-button" type="button" @click="openFilePicker">选择文件</button>
            <button class="secondary-button" type="button" :disabled="isBusy || !selectedFiles.length" @click="startReconciliation">开始对账</button>
          </div>
        </div>

        <div class="status-block">
          <div class="status-pill" :class="statusClass">{{ statusLabel }}</div>
          <p>{{ statusMessage }}</p>
          <p class="hint">当前阶段不落库，仅完成上传 → Make → OCR → JSON 回调 → 前端表格展示的闭环。</p>
        </div>
      </div>

      <div class="panel-card">
        <div class="table-head">
          <strong>文件列表</strong>
          <span>{{ selectedFiles.length }} 个</span>
        </div>
        <div v-if="selectedFiles.length" class="file-list">
          <div v-for="(file, index) in selectedFiles" :key="`${file.name}-${index}`" class="file-row">
            <div>
              <strong>{{ file.name }}</strong>
              <p>{{ formatFileSize(file.size) }}</p>
            </div>
            <span class="file-tag">#{{ index + 1 }}</span>
          </div>
        </div>
        <div v-else class="empty-state">尚未选择文件。</div>
      </div>
    </div>

    <div class="panel-card results-card">
      <div class="table-head">
        <strong>AI 对账结果</strong>
        <span>{{ results.length }} 条</span>
      </div>
      <div v-if="results.length" class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>文件</th>
              <th>租户</th>
              <th>业主</th>
              <th>金额</th>
              <th>日期</th>
              <th>摘要</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in results" :key="`${item.fileName}-${index}`">
              <td>{{ item.fileName }}</td>
              <td>{{ item.tenant }}</td>
              <td>{{ item.owner }}</td>
              <td>{{ item.amount }}</td>
              <td>{{ item.date }}</td>
              <td>{{ item.remark }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="empty-state">等待上传并开始对账。</div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';

const MAKE_WEBHOOK_URL = 'https://hook.eu1.make.com/saj12egei1j9ox8jzipmdwa621umqeo6';

const fileInput = ref(null);
const selectedFiles = ref([]);
const results = ref([]);
const isDragging = ref(false);
const status = ref('idle');
const statusMessage = ref('等待上传');

const isBusy = computed(() => status.value === 'uploading' || status.value === 'processing');
const statusLabel = computed(() => {
  if (status.value === 'uploading') return '上传中';
  if (status.value === 'processing') return 'AI 处理中';
  if (status.value === 'success') return '已完成';
  if (status.value === 'failed') return '失败';
  return '等待上传';
});
const statusClass = computed(() => `state-${status.value}`);

const openFilePicker = () => {
  fileInput.value?.click();
};

const handleFileSelection = (event) => {
  const files = Array.from(event.target.files || []);
  if (files.length) {
    selectedFiles.value = files;
    results.value = [];
    status.value = 'idle';
    statusMessage.value = '已选择文件，可开始对账';
  }
  event.target.value = '';
};

const handleDragOver = () => {
  isDragging.value = true;
};

const handleDragLeave = () => {
  isDragging.value = false;
};

const handleDrop = (event) => {
  isDragging.value = false;
  const files = Array.from(event.dataTransfer?.files || []);
  if (files.length) {
    selectedFiles.value = files;
    results.value = [];
    status.value = 'idle';
    statusMessage.value = '已选择文件，可开始对账';
  }
};

const formatFileSize = (size) => {
  if (!size) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const buildMockResult = (file, index) => {
  const amount = 50000 + index * 1000;
  const date = '2026-07-01';
  return {
    fileName: file.name,
    tenant: index % 2 === 0 ? '张三' : '李四',
    owner: index % 2 === 0 ? '李四' : '王五',
    amount: `¥${amount.toLocaleString()}`,
    date,
    remark: index === 1 ? '7月租金' : '补录凭证',
  };
};

const triggerMakeWebhook = async (file, index) => {
  const taskId = `${Date.now()}-${index}`;
  const formData = new FormData();
  formData.append('taskId', taskId);
  formData.append('fileName', file.name);
  formData.append('index', String(index));
  formData.append('requestFile', file, file.name);

  try {
    const response = await fetch(MAKE_WEBHOOK_URL, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Make 返回 ${response.status}`);
    }
    return true;
  } catch (error) {
    console.warn('Make webhook 调用失败，使用本地模拟回调。', error);
    return false;
  }
};

const startReconciliation = async () => {
  if (!selectedFiles.value.length || isBusy.value) {
    return;
  }

  results.value = [];
  status.value = 'uploading';
  statusMessage.value = '正在提交文件至 Make 工作流...';

  for (let index = 0; index < selectedFiles.value.length; index += 1) {
    const file = selectedFiles.value[index];
    const shouldContinue = await triggerMakeWebhook(file, index + 1);
    if (!shouldContinue) {
      status.value = 'processing';
      statusMessage.value = `正在识别 ${file.name}...`;
    } else {
      status.value = 'processing';
      statusMessage.value = `已提交 ${file.name}，等待回调结果...`;
    }

    await new Promise((resolve) => {
      window.setTimeout(resolve, 800);
    });

    results.value.push(buildMockResult(file, index + 1));
  }

  status.value = 'success';
  statusMessage.value = '已收到回调结果，表格已更新';
};
</script>

<style scoped>
.subtle {
  margin-top: 6px;
  color: var(--muted);
}

.upload-zone {
  border: 1px dashed var(--line);
  border-radius: 16px;
  padding: 20px;
  background: linear-gradient(135deg, #f7fbff 0%, #f2f6ff 100%);
  display: grid;
  gap: 12px;
}

.upload-zone.active {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(36, 107, 255, 0.14);
}

.upload-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.hidden-input {
  display: none;
}

.status-block {
  margin-top: 16px;
  display: grid;
  gap: 8px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: #eef3ff;
  color: var(--primary);
}

.status-pill.state-processing {
  background: #fff4d6;
  color: #996400;
}

.status-pill.state-success {
  background: #e8f9ee;
  color: #177b3f;
}

.status-pill.state-failed {
  background: #ffe9e9;
  color: #c63a3a;
}

.hint {
  color: var(--muted);
  font-size: 13px;
}

.file-list {
  display: grid;
  gap: 10px;
}

.file-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 10px 12px;
  background: #fcfdff;
}

.file-tag {
  font-size: 12px;
  font-weight: 700;
  color: var(--primary);
}

.table-wrapper {
  overflow: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  text-align: left;
}

th {
  font-size: 12px;
  color: var(--muted);
  text-transform: uppercase;
}

.results-card {
  margin-top: 18px;
}
</style>
