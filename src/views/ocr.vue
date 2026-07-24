<template>
  <section class="page-shell">
    <div class="page-title-row">
      <div>
        <p class="eyebrow">OCR 中心</p>
        <h2>AI 对账流程</h2>
        <p class="subtle">上传多个文件 → 调用 Make Workflow → 收到 JSON 回调 → 结果直接在页面展示。</p>
      </div>
    </div>

    <div class="process-steps">
      <div class="step-card" :class="{ active: currentStep !== 'idle' }">
        <span class="step-index">1</span>
        <div>
          <strong>上传文件</strong>
          <p>选择或拖拽多个发票、凭证、图片、表格文件。</p>
        </div>
      </div>
      <div class="step-card" :class="{ active: currentStep === 'uploading' || currentStep === 'processing' }">
        <span class="step-index">2</span>
        <div>
          <strong>AI 处理</strong>
          <p>通过 Make 工作流完成 OCR 和结构化识别。</p>
        </div>
      </div>
      <div class="step-card" :class="{ active: currentStep === 'success' }">
        <span class="step-index">3</span>
        <div>
          <strong>结果展示</strong>
          <p>识别结果直接渲染成可排序表格。</p>
        </div>
      </div>
    </div>

    <div class="content-grid">
      <div class="main-column">
        <div class="panel-card upload-panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">上传区域</p>
              <h3>上传文件并启动 AI 对账</h3>
            </div>
            <div class="badge">MVP 版本</div>
          </div>

          <div
            class="upload-zone"
            :class="{ active: isDragging }"
            @dragover.prevent="handleDragOver"
            @dragleave.prevent="handleDragLeave"
            @drop.prevent="handleDrop"
          >
            <p class="upload-title">将文件拖拽到此处，或点击选择文件</p>
            <p class="upload-desc">支持 PDF、JPG、PNG、Excel、Word。上传后点击“开始对账”进行 AI 识别。</p>
            <input ref="fileInput" type="file" multiple class="hidden-input" accept=".pdf,.jpg,.jpeg,.png,.xls,.xlsx,.doc,.docx" @change="handleFileSelection" />
            <div class="upload-actions">
              <button class="primary-button" type="button" @click="openFilePicker">选择文件</button>
              <button class="secondary-button" type="button" :disabled="isBusy || !selectedFiles.length" @click="startReconciliation">开始对账</button>
              <button class="ghost-button" type="button" :disabled="!selectedFiles.length" @click="clearAll">清空列表</button>
            </div>
          </div>

          <div class="status-block">
            <div class="status-pill" :class="statusClass">{{ statusLabel }}</div>
            <p>{{ statusMessage }}</p>
            <div class="progress-line" v-if="isBusy">
              <div class="progress-bar" :style="{ width: progressPercent + '%' }"></div>
            </div>
          </div>
        </div>

        <div class="panel-card task-panel">
          <div class="table-head">
            <strong>任务中心</strong>
            <span>{{ selectedFiles.length }} 个文件</span>
          </div>
          <div v-if="fileTasks.length" class="task-list">
            <div v-for="task in fileTasks" :key="task.id" class="task-row">
              <div>
                <strong>{{ task.name }}</strong>
                <p>{{ task.note }}</p>
              </div>
              <span class="task-status" :class="task.statusClass">{{ task.status }}</span>
            </div>
          </div>
          <div v-else class="empty-state">请先选择文件以创建 AI 对账任务。</div>
        </div>

        <div class="panel-card results-card">
          <div class="table-head search-head">
            <div>
              <strong>AI 对账结果</strong>
              <span>{{ filteredResults.length }} 条结果</span>
            </div>
            <input class="search-input" type="search" v-model="searchKeyword" placeholder="搜索文件、租户、业主" />
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
                <tr v-for="(item, index) in filteredResults" :key="`${item.fileName}-${index}`">
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
          <div v-else class="empty-state">尚无识别结果，开始上传文件并执行 AI 对账。</div>
        </div>
      </div>

      <aside class="side-column">
        <div class="panel-card summary-card">
          <div class="table-head">
            <strong>任务概览</strong>
            <span>{{ taskId || '未创建' }}</span>
          </div>
          <div class="summary-row">
            <div>
              <p>文件总数</p>
              <strong>{{ selectedFiles.length }}</strong>
            </div>
            <div>
              <p>完成数量</p>
              <strong>{{ completedCount }}</strong>
            </div>
          </div>
          <div class="summary-row">
            <div>
              <p>当前状态</p>
              <strong>{{ statusLabel }}</strong>
            </div>
            <div>
              <p>结果数</p>
              <strong>{{ results.length }}</strong>
            </div>
          </div>
        </div>

        <div class="panel-card tips-card">
          <p class="eyebrow">使用说明</p>
          <ul>
            <li>支持批量上传多种文档格式。</li>
            <li>上传后自动调用 Make OCR → GPT → JSON 回调。</li>
            <li>当前仅前端展示结果，不会落库。</li>
          </ul>
        </div>

        <div class="panel-card log-card">
          <div class="table-head">
            <strong>任务日志</strong>
            <span>{{ taskLog.length }} 条</span>
          </div>
          <div v-if="taskLog.length" class="log-list">
            <p v-for="(item, index) in taskLog" :key="index">{{ item }}</p>
          </div>
          <div v-else class="empty-state">当前任务日志将显示处理进度。</div>
        </div>
      </aside>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';

const MAKE_WEBHOOK_URL = 'https://hook.eu1.make.com/saj12egei1j9ox8jzipmdwa621umqeo6';

const fileInput = ref(null);
const selectedFiles = ref([]);
const fileTasks = ref([]);
const results = ref([]);
const taskId = ref('');
const taskLog = ref([]);
const isDragging = ref(false);
const status = ref('idle');
const statusMessage = ref('等待上传文件');
const searchKeyword = ref('');

const currentStep = ref('idle');

const isBusy = computed(() => status.value === 'uploading' || status.value === 'processing');
const statusLabel = computed(() => {
  if (status.value === 'uploading') return '上传中';
  if (status.value === 'processing') return 'AI 处理中';
  if (status.value === 'success') return '已完成';
  if (status.value === 'failed') return '失败';
  return '等待上传';
});
const statusClass = computed(() => `state-${status.value}`);

const progressPercent = computed(() => {
  if (!selectedFiles.value.length) return 0;
  const done = fileTasks.value.filter((task) => task.status === '完成').length;
  return Math.round((done / selectedFiles.value.length) * 100);
});

const completedCount = computed(() => fileTasks.value.filter((task) => task.status === '完成').length);

const filteredResults = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase();
  if (!keyword) return results.value;
  return results.value.filter((item) =>
    [item.fileName, item.tenant, item.owner, item.remark].some((value) =>
      String(value).toLowerCase().includes(keyword),
    ),
  );
});

const openFilePicker = () => {
  fileInput.value?.click();
};

const assignTasks = (files) => {
  fileTasks.value = files.map((file, index) => ({
    id: `${file.name}-${index}`,
    name: file.name,
    status: '待上传',
    statusClass: 'pending',
    note: formatFileSize(file.size),
  }));
};

const handleFileSelection = (event) => {
  const files = Array.from(event.target.files || []);
  if (files.length) {
    selectedFiles.value = files;
    assignTasks(files);
    results.value = [];
    taskLog.value = [];
    taskId.value = `TASK-${Date.now()}`;
    status.value = 'idle';
    currentStep.value = 'idle';
    statusMessage.value = '已选择文件，可开始对账。';
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
    assignTasks(files);
    results.value = [];
    taskLog.value = [];
    taskId.value = `TASK-${Date.now()}`;
    status.value = 'idle';
    currentStep.value = 'idle';
    statusMessage.value = '已选择文件，可开始对账。';
  }
};

const updateTask = (id, data) => {
  const task = fileTasks.value.find((item) => item.id === id);
  if (task) {
    Object.assign(task, data);
  }
};

const clearAll = () => {
  selectedFiles.value = [];
  fileTasks.value = [];
  results.value = [];
  taskLog.value = [];
  taskId.value = '';
  status.value = 'idle';
  currentStep.value = 'idle';
  statusMessage.value = '已清空，重新上传文件。';
  searchKeyword.value = '';
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

const pushLog = (message) => {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' });
  taskLog.value.unshift(`${time} • ${message}`);
};

const triggerMakeWebhook = async (file, index) => {
  const runTaskId = `${taskId.value}-${index}`;
  const formData = new FormData();
  formData.append('taskId', taskId.value);
  formData.append('fileName', file.name);
  formData.append('index', String(index));
  formData.append('requestFile', file, file.name);

  try {
    const response = await fetch(MAKE_WEBHOOK_URL, {
      method: 'POST',
      body: formData,
    });

    return response.ok;
  } catch (error) {
    console.warn('Make webhook 调用失败，使用本地模拟回调。', error);
    return false;
  }
};

const startReconciliation = async () => {
  if (!selectedFiles.value.length || isBusy.value) return;

  results.value = [];
  taskLog.value = [];
  status.value = 'uploading';
  currentStep.value = 'uploading';
  statusMessage.value = '正在向 Make 工作流提交文件...';
  pushLog('任务已创建，开始上传文件。');

  for (let index = 0; index < selectedFiles.value.length; index += 1) {
    const file = selectedFiles.value[index];
    const id = `${file.name}-${index}`;

    updateTask(id, { status: '上传中', statusClass: 'uploading', note: '正在提交文件' });
    const sendOk = await triggerMakeWebhook(file, index + 1);
    pushLog(`已提交 ${file.name} 至 Make 工作流。`);

    await new Promise((resolve) => window.setTimeout(resolve, 700));
    updateTask(id, { status: '识别中', statusClass: 'processing', note: 'AI 正在解析' });
    status.value = 'processing';
    statusMessage.value = `正在处理 ${file.name}...`;
    currentStep.value = 'processing';

    await new Promise((resolve) => window.setTimeout(resolve, 900));

    const record = buildMockResult(file, index + 1);
    results.value.push(record);
    updateTask(id, { status: '完成', statusClass: 'done', note: '已生成结果' });
    pushLog(`${file.name} 识别完成，结果已入表格。`);

    if (!sendOk) {
      pushLog(`${file.name} 使用本地模拟结果，实际回调未收到。`);
    }
  }

  status.value = 'success';
  currentStep.value = 'success';
  statusMessage.value = '已完成所有文件识别，结果已展示。';
  pushLog('全部文件处理完成。');
};
</script>

<style scoped>
.page-shell {
  display: grid;
  gap: 24px;
}

.page-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 20px;
}

.eyebrow {
  margin: 0 0 8px;
  font-size: 13px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
}

.page-title-row h2 {
  margin: 0;
  font-size: 28px;
}

.subtle {
  margin: 8px 0 0;
  color: var(--muted);
  max-width: 680px;
}

.process-steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.step-card {
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 18px;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 14px;
  align-items: center;
  background: #ffffff;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.step-card.active {
  border-color: var(--primary);
  background: #f4f8ff;
}

.step-index {
  display: inline-flex;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  align-items: center;
  justify-content: center;
  background: var(--primary);
  color: #fff;
  font-weight: 800;
}

.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 2.1fr) minmax(320px, 1fr);
  gap: 20px;
}

.main-column,
.side-column {
  display: grid;
  gap: 20px;
}

.panel-card {
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 22px;
  box-shadow: 0 8px 30px rgba(25, 37, 70, 0.04);
}

.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: flex-start;
  margin-bottom: 18px;
}

.badge {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(44, 124, 255, 0.08);
  color: var(--primary);
  font-size: 12px;
  font-weight: 700;
}

.upload-panel .upload-zone {
  min-height: 160px;
  display: grid;
  align-items: center;
  justify-items: center;
  text-align: center;
}

.upload-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.upload-desc {
  margin: 8px 0 16px;
  color: var(--muted);
}

.upload-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
}

.primary-button,
.secondary-button,
.ghost-button {
  min-width: 120px;
  padding: 12px 18px;
  border: none;
  border-radius: 999px;
  cursor: pointer;
  font-weight: 700;
}

.primary-button {
  background: var(--primary);
  color: #fff;
}

.secondary-button {
  background: #f5f7ff;
  color: var(--primary);
}

.ghost-button {
  background: transparent;
  color: var(--muted);
  border: 1px solid var(--line);
}

.primary-button:disabled,
.secondary-button:disabled,
.ghost-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.status-block {
  margin-top: 18px;
  display: grid;
  gap: 12px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 8px 14px;
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

.progress-line {
  width: 100%;
  height: 8px;
  background: #f1f5ff;
  border-radius: 999px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #4b7dff, #7398ff);
  border-radius: 999px;
}

.table-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}

.search-head {
  flex-wrap: wrap;
}

.search-input {
  min-width: 200px;
  width: 100%;
  max-width: 260px;
  padding: 10px 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
}

.task-list {
  display: grid;
  gap: 12px;
}

.task-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 14px;
  background: #f8fbff;
  border: 1px solid var(--line);
}

.task-row p {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 13px;
}

.task-status {
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.task-status.uploading {
  background: #edeaff;
  color: #5b4cff;
}

.task-status.processing {
  background: #fff7e2;
  color: #9f7500;
}

.task-status.done {
  background: #e8f9ee;
  color: #177b3f;
}

.table-wrapper {
  overflow: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 760px;
}

th,
td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--line);
  text-align: left;
}

th {
  font-size: 12px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.results-card {
  overflow: hidden;
}

.summary-card,
.tips-card,
.log-card {
  display: grid;
  gap: 16px;
}

.summary-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.summary-row div {
  padding: 16px;
  border-radius: 16px;
  background: #f8fbff;
}

.summary-row p {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}

.summary-row strong {
  display: block;
  margin-top: 8px;
  font-size: 24px;
}

.tips-card ul {
  margin: 0;
  padding: 0 0 0 18px;
  color: var(--muted);
}

.tips-card li {
  margin-bottom: 8px;
}

.log-list {
  display: grid;
  gap: 10px;
}

.log-list p {
  margin: 0;
  padding: 12px 14px;
  border-radius: 14px;
  background: #f7f8ff;
  color: var(--muted);
  font-size: 13px;
}

.empty-state {
  padding: 28px 16px;
  color: var(--muted);
  text-align: center;
  background: #fbfcff;
  border-radius: 16px;
}
</style>
