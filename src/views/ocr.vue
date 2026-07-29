<template>
  <section class="page-shell">
    <div class="page-title-row">
      <div>
        <h2>{{ labels.title }}</h2>
        <p class="subtle">{{ labels.subtitle }}</p>
      </div>
    </div>

    <div class="content-grid">
      <div class="main-column">
        <div class="panel-card upload-panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">{{ labels.uploadEyebrow }}</p>
              <h3>{{ labels.uploadHeading }}</h3>
            </div>
            <div class="badge">MVP</div>
          </div>

          <div class="config-grid">
            <div class="config-field">
              <label>{{ labels.webhookUrl }}</label>
              <input type="url" v-model="makeWebhookUrl" placeholder="https://hook.eu1.make.com/..." />
            </div>
            <div class="config-field">
              <label>{{ labels.callbackUrl }}</label>
              <input
                type="url"
                v-model="callbackUrl"
                placeholder="https://your-server.com/api/v1/ocr/callback"
              />
            </div>
            <div class="config-field">
              <label>{{ labels.taskName }}</label>
              <input type="text" v-model="taskName" :placeholder="labels.taskNamePlaceholder" />
            </div>
          </div>

          <div
            class="upload-zone"
            :class="{ active: isDragging }"
            @dragover.prevent="handleDragOver"
            @dragleave.prevent="handleDragLeave"
            @drop.prevent="handleDrop"
          >
            <div>
              <p class="upload-title">{{ labels.dropTitle }}</p>
              <p class="upload-desc">{{ labels.dropHelp }}</p>
            </div>
            <input
              ref="fileInput"
              type="file"
              multiple
              class="hidden-input"
              accept=".pdf,.jpg,.jpeg,.png,.xls,.xlsx,.doc,.docx"
              @change="handleFileSelection"
            />
            <!-- 待上传文件列表 -->
            <div v-if="selectedFiles.length" class="files-list">
              <div class="files-header">
                <strong>{{ selectedFiles.length }} {{ labels.filesPending }}</strong>
                <span class="file-size">{{ totalFileSize }}</span>
              </div>
              <div class="file-item-container">
                <div v-for="(file, index) in selectedFiles" :key="index" class="file-item">
                  <div class="file-info">
                    <svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                      <polyline points="13 2 13 9 20 9"></polyline>
                    </svg>
                    <div class="file-text">
                      <p class="file-name">{{ file.name }}</p>
                      <p class="file-meta">{{ formatFileSize(file.size) }}</p>
                    </div>
                  </div>
                  <button
                    class="remove-btn"
                    type="button"
                    :title="labels.removeFile"
                    @click="removeFile(index)"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
            <div class="upload-actions">
              <div class="upload-actions-primary">
                <button class="primary-button" type="button" @click="openFilePicker">{{ selectedFiles.length ? labels.addFiles : labels.chooseFiles }}</button>
                <button
                  class="primary-button"
                  type="button"
                  :disabled="isBusy || !selectedFiles.length || !makeWebhookUrl || !callbackUrl"
                  @click="uploadFiles"
                >
                  {{ labels.uploadFiles }}
                </button>
              </div>
              <button
                class="secondary-button"
                type="button"
                :disabled="isBusy || !uploadedFileCount || !makeWebhookUrl || !callbackUrl"
                @click="startReconciliation"
              >
                {{ labels.start }}
              </button>
              <button class="ghost-button" type="button" :disabled="!selectedFiles.length && !uploadedFileCount" @click="clearAll">{{ labels.clear }}</button>
            </div>

            <!-- 已上传文件列表 -->
            <div v-if="uploadedFiles.length" class="files-list">
              <div class="files-header">
                <strong>{{ uploadedFiles.length }} {{ labels.filesUploaded }}</strong>
              </div>
              <div class="file-item-container">
                <div v-for="(file, index) in uploadedFiles" :key="`uploaded-${index}`" class="file-item">
                  <div class="file-info">
                    <svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                      <polyline points="13 2 13 9 20 9"></polyline>
                    </svg>
                    <div class="file-text">
                      <p class="file-name">{{ file.name }}</p>
                      <p class="file-meta">{{ formatFileSize(file.size) }}</p>
                    </div>
                  </div>
                  <span class="file-badge">{{ labels.uploaded }}</span>
                </div>
              </div>
            </div>
            <div class="status-pill" :class="statusClass">{{ statusLabel }}</div>
            <p>{{ statusMessage }}</p>
            <div class="progress-line">
              <div class="progress-bar" :style="{ width: progressPercent + '%' }"></div>
            </div>
          </div>
        </div>

        <div class="panel-card task-panel">
          <div class="table-head">
            <strong>{{ labels.taskCenter }}</strong>
            <span>{{ tasks.length }} {{ labels.itemUnit }}</span>
          </div>
          <div v-if="tasks.length" class="task-list">
            <div
              v-for="task in tasks"
              :key="task.id"
              class="task-row"
              :class="{ active: activeTaskId === task.id }"
            >
              <div>
                <strong>{{ task.taskName }}</strong>
                <p>{{ labels.fileCount }}：{{ task.fileCount }} • {{ labels.status }}：{{ task.status }}</p>
                <p>{{ labels.callback }}：{{ task.callbackUrl }}</p>
              </div>
              <div class="task-actions">
                <button class="secondary-button" type="button" @click="showResult(task.id)">{{ labels.viewResult }}</button>
                <button class="ghost-button" type="button" @click="openManualReview(task.id)">{{ labels.manualReview }}</button>
              </div>
            </div>
          </div>
          <div v-else class="empty-state">{{ labels.noTasks }}</div>
        </div>

        <div class="panel-card results-card" id="results-card">
          <div class="table-head search-head">
            <div>
              <strong>{{ labels.results }}</strong>
              <span>{{ filteredResults.length }} {{ labels.resultUnit }}</span>
            </div>
            <input
              class="search-input"
              type="search"
              v-model="searchKeyword"
              :placeholder="labels.searchPlaceholder"
            />
          </div>

          <DualScrollTable v-if="results.length" wrapper-class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>{{ labels.file }}</th>
                  <th>{{ labels.tenant }}</th>
                  <th>{{ labels.owner }}</th>
                  <th>{{ labels.amount }}</th>
                  <th>{{ labels.date }}</th>
                  <th>{{ labels.remark }}</th>
                  <th>{{ labels.reviewStatus }}</th>
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
                  <td>{{ item.reviewStatus || labels.pendingConfirmation }}</td>
                </tr>
              </tbody>
            </table>
          </DualScrollTable>
          <div v-else class="empty-state">{{ labels.noResults }}</div>

          <div v-if="activeTask && manualReviewMode" class="manual-review">
            <div class="table-head">
              <strong>{{ labels.manualReview }}</strong>
              <button class="ghost-button" type="button" @click="completeReview">{{ labels.completeReview }}</button>
            </div>
            <p>{{ labels.currentTask }}：{{ activeTask.taskName }}</p>
            <textarea v-model="reviewComment" :placeholder="labels.reviewPlaceholder"></textarea>
          </div>
        </div>
      </div>

      <aside class="side-column">
        <div class="panel-card summary-card">
          <div class="table-head">
            <strong>{{ labels.taskOverview }}</strong>
            <span>{{ activeTask?.taskName || labels.noTask }}</span>
          </div>
          <div class="summary-row">
            <div>
              <p>{{ labels.fileCount }}</p>
              <strong>{{ activeTask?.fileCount || 0 }}</strong>
            </div>
            <div>
              <p>{{ labels.resultCount }}</p>
              <strong>{{ results.length }}</strong>
            </div>
          </div>
          <div class="summary-row">
            <div>
              <p>{{ labels.taskStatus }}</p>
              <strong>{{ activeTask?.status || statusLabel }}</strong>
            </div>
            <div>
              <p>{{ labels.reviewStatus }}</p>
              <strong>{{ activeTask?.reviewStatus || labels.pendingReview }}</strong>
            </div>
          </div>
        </div>

        <div class="panel-card tips-card">
          <p class="eyebrow">{{ labels.tips }}</p>
          <ul>
            <li>{{ labels.tipWebhook }}</li>
            <li>{{ labels.tipOcr }}</li>
            <li>{{ labels.tipReview }}</li>
          </ul>
        </div>

        <div class="panel-card log-card">
          <div class="table-head">
            <strong>{{ labels.taskLog }}</strong>
            <span>{{ taskLog.length }} {{ labels.itemUnit }}</span>
          </div>
          <div v-if="taskLog.length" class="log-list">
            <p v-for="(item, index) in taskLog" :key="index">{{ item }}</p>
          </div>
          <div v-else class="empty-state">{{ labels.noLogs }}</div>
        </div>
      </aside>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';
import DualScrollTable from '../components/DualScrollTable.vue';
import { useI18n } from '../i18n';

const { dictionary } = useI18n();
const labels = computed(() => dictionary.value.ocrLabels);
const copy = (key, variables = {}) => Object.entries(variables).reduce(
  (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
  labels.value[key] || key,
);

const DEFAULT_WEBHOOK_URL = 'https://hook.eu1.make.com/saj12egei1j9ox8jzipmdwa621umqeo6';

const fileInput = ref(null);
const selectedFiles = ref([]);
const uploadedFiles = ref([]);
const tasks = ref([]);
const results = ref([]);
const taskLog = ref([]);
const activeTaskId = ref('');
const isDragging = ref(false);
const status = ref('idle');
const statusMessage = ref(labels.value.waitingFiles);
const searchKeyword = ref('');
const makeWebhookUrl = ref(localStorage.getItem('makeWebhookUrl') || DEFAULT_WEBHOOK_URL);
const callbackUrl = ref(localStorage.getItem('ocrCallbackUrl') || '');
const taskName = ref(labels.value.defaultTaskName);
const manualReviewMode = ref(false);
const reviewComment = ref('');
const currentStep = ref('idle');
const fileUploadProgress = ref(0);
const processingProgress = ref(0);
const uploadedFileCount = ref(0);

const isBusy = computed(() => status.value === 'uploading' || status.value === 'processing');
const statusLabel = computed(() => {
  if (status.value === 'uploading') return labels.value.uploading;
  if (status.value === 'uploaded') return labels.value.uploaded;
  if (status.value === 'processing') return labels.value.processing;
  if (status.value === 'success') return labels.value.completed;
  if (status.value === 'failed') return labels.value.failed;
  return labels.value.waitingUpload;
});
const statusClass = computed(() => `state-${status.value}`);

const totalFileSize = computed(() => {
  const bytes = selectedFiles.value.reduce((sum, file) => sum + (file.size || 0), 0);
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
});

const progressPercent = computed(() => {
  if (status.value === 'idle') return 0;
  if (status.value === 'uploading') return Math.min(50, Math.max(10, fileUploadProgress.value));
  if (status.value === 'processing') return 50 + Math.min(50, Math.max(10, processingProgress.value));
  return 100;
});

const filteredResults = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase();
  if (!keyword) return results.value;
  return results.value.filter((item) =>
    [item.fileName, item.tenant, item.owner, item.remark, item.reviewStatus]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword)),
  );
});

const backendTask = ref(null);
const activeTask = computed(() => tasks.value.find((task) => task.id === activeTaskId.value) || tasks.value[0] || null);

const openFilePicker = () => {
  fileInput.value?.click();
};

const uploadFiles = async () => {
  if (selectedFiles.value.length && !isBusy.value && makeWebhookUrl.value && callbackUrl.value) {
    status.value = 'uploading';
    currentStep.value = 'uploading';
    statusMessage.value = labels.value.uploadingServer;
    fileUploadProgress.value = 10;

    saveSettings();

    const formData = new FormData();
    formData.append('taskName', taskName.value || `${labels.value.defaultTaskName} ${new Date().toLocaleString()}`);
    formData.append('webhookUrl', makeWebhookUrl.value);
    formData.append('callbackUrl', callbackUrl.value);
    selectedFiles.value.forEach((file) => {
      formData.append('files', file, file.name);
    });

    try {
      const response = await fetch('/api/v1/ocr/tasks/upload', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        throw new Error(copy('uploadHttpError', { status: response.status }));
      }

      // 将选中的文件移到已上传列表
      uploadedFiles.value.push(...selectedFiles.value);
      uploadedFileCount.value += selectedFiles.value.length;
      selectedFiles.value = [];
      fileUploadProgress.value = 100;
      status.value = 'idle';
      statusMessage.value = labels.value.uploadedContinue;
      pushLog(labels.value.uploadSuccessLog);
    } catch (error) {
      status.value = 'failed';
      statusMessage.value = labels.value.uploadFailedRetry;
      pushLog(copy('uploadErrorLog', { error: error.message }));
    }
  }
};

const removeFile = (index) => {
  selectedFiles.value.splice(index, 1);
};

const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const resetTaskState = () => {
  tasks.value = [];
  results.value = [];
  taskLog.value = [];
  activeTaskId.value = '';
  backendTask.value = null;
  manualReviewMode.value = false;
  reviewComment.value = '';
  fileUploadProgress.value = 0;
  processingProgress.value = 0;
};

const resetUploadState = () => {
  selectedFiles.value = [];
  uploadedFiles.value = [];
  uploadedFileCount.value = 0;
  status.value = 'idle';
  statusMessage.value = labels.value.waitingFiles;
  if (fileInput.value) {
    fileInput.value.value = '';
  }
};

const uploadSelectedFiles = async (files) => {
  resetTaskState();

  if (!makeWebhookUrl.value || !callbackUrl.value) {
    status.value = 'failed';
    statusMessage.value = labels.value.requireUrls;
    return;
  }

  // 收集所有已上传和待上传的文件用于开始对账
  const allFiles = [...uploadedFiles.value, ...files];

  status.value = 'uploading';
  currentStep.value = 'uploading';
  statusMessage.value = labels.value.submittingMake;
  fileUploadProgress.value = 10;

  saveSettings();

  const formData = new FormData();
  formData.append('taskName', taskName.value || `${labels.value.defaultTaskName} ${new Date().toLocaleString()}`);
  formData.append('webhookUrl', makeWebhookUrl.value);
  formData.append('callbackUrl', callbackUrl.value);
  allFiles.forEach((file) => {
    formData.append('files', file, file.name);
  });

  try {
    const response = await fetch('/api/v1/ocr/tasks/upload', {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      throw new Error(copy('uploadHttpError', { status: response.status }));
    }

    const task = await response.json();
    backendTask.value = task;
    const taskSummary = createTaskSummary(task);
    taskSummary.fileCount = allFiles.length;
    tasks.value = [taskSummary];
    activeTaskId.value = taskSummary.id;
    status.value = 'uploaded';
    statusMessage.value = labels.value.submittedProcessing;
    fileUploadProgress.value = 100;
    pushLog(copy('submittedFilesLog', { count: allFiles.length }));
  } catch (error) {
    status.value = 'failed';
    statusMessage.value = labels.value.submitFailedRetry;
    pushLog(copy('submitErrorLog', { error: error.message }));
  }
};

const handleFileSelection = (event) => {
  const files = Array.from(event.target.files || []);
  if (files.length) {
    selectedFiles.value.push(...files);
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
    selectedFiles.value.push(...files);
  }
};

const clearAll = () => {
  resetUploadState();
  backendTask.value = null;
  resetTaskState();
};

const pushLog = (message) => {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' });
  taskLog.value.unshift(`${time} · ${message}`);
};

const saveSettings = () => {
  localStorage.setItem('makeWebhookUrl', makeWebhookUrl.value);
  localStorage.setItem('ocrCallbackUrl', callbackUrl.value);
};

const createBackendTask = async () => {
  saveSettings();
  const body = {
    taskName: taskName.value || `${labels.value.defaultTaskName} ${new Date().toLocaleString()}`,
    webhookUrl: makeWebhookUrl.value,
    callbackUrl: callbackUrl.value,
    fileNames: selectedFiles.value.map((file) => file.name),
  };
  const response = await fetch('/api/v1/ocr/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(copy('createTaskError', { status: response.status }));
  }
  return response.json();
};

const triggerMakeWorkflow = async (task) => {
  const allFiles = [...uploadedFiles.value, ...selectedFiles.value];
  const formData = new FormData();
  formData.append('taskId', task.taskId);
  formData.append('callbackUrl', task.callbackUrl);
  formData.append('taskName', task.taskName);
  allFiles.forEach((file, index) => {
    formData.append('fileName', file.name);
    formData.append('index', String(index + 1));
    formData.append('requestFile', file, file.name);
  });

  try {
    const response = await fetch(task.webhookUrl, {
      method: 'POST',
      body: formData,
    });
    return response.ok;
  } catch (error) {
    console.warn('Make webhook 调用失败：', error);
    return false;
  }
};

const createTaskSummary = (taskData) => ({
  id: taskData.id,
  taskId: taskData.taskId,
  taskName: taskData.taskName,
  webhookUrl: taskData.webhookUrl,
  callbackUrl: taskData.callbackUrl,
  status: status.value === 'uploaded' ? labels.value.uploaded : labels.value.processing,
  reviewStatus: labels.value.pendingReview,
  fileCount: uploadedFileCount.value,
  createdAt: new Date().toISOString(),
});

const updateTaskStatus = (taskIdValue, statusValue, reviewStatusValue) => {
  const task = tasks.value.find((item) => item.taskId === taskIdValue);
  if (task) {
    task.status = statusValue;
    if (reviewStatusValue) {
      task.reviewStatus = reviewStatusValue;
    }
  }
};

const pollTask = async (taskIdValue) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    processingProgress.value = Math.min(50, (attempt + 1) * 2.5);
    const response = await fetch(`/api/v1/ocr/tasks/${taskIdValue}`);
    if (!response.ok) continue;
    const payload = await response.json();
    if (payload.state === 'COMPLETED' || payload.state === 'FAILED') {
      updateTaskStatus(taskIdValue, payload.state === 'COMPLETED' ? labels.value.completed : labels.value.failed, payload.reviewStatus || labels.value.pendingReview);
      status.value = payload.state === 'COMPLETED' ? 'success' : 'failed';
      statusMessage.value = payload.state === 'COMPLETED' ? labels.value.callbackSuccess : labels.value.callbackFailed;
      processingProgress.value = 50;
      if (payload.resultJson?.records?.length) {
        results.value = payload.resultJson.records.map((record) => ({
          fileName: record.original_file_name || record.fileName || selectedFiles.value[0]?.name || labels.value.unknownFile,
          tenant: record.tenant_name || record.inflow_party || '—',
          owner: record.outflow_party || record.owner || '—',
          amount: record.net_amount ? `¥${record.net_amount.toLocaleString()}` : record.document_amount ? `¥${record.document_amount.toLocaleString()}` : '—',
          date: record.date || record.target_month || '—',
          remark: record.summary || record.notes || '—',
          reviewStatus: record.review_status || record.reviewStatus || labels.value.pendingConfirmation,
        }));
      }
      return;
    }
  }
  if (status.value === 'processing') {
    status.value = 'failed';
    statusMessage.value = labels.value.callbackTimeout;
    updateTaskStatus(activeTask.value?.taskId ?? '', labels.value.failed, labels.value.pendingReview);
  }
};

const startReconciliation = async () => {
  if (!uploadedFileCount.value || isBusy.value || !makeWebhookUrl.value || !callbackUrl.value) return;
  
  // 如果还有待上传文件，先都上传
  if (selectedFiles.value.length) {
    await uploadSelectedFiles(selectedFiles.value);
  }

  if (!backendTask.value) return;

  status.value = 'processing';
  statusMessage.value = labels.value.waitingCallback;
  currentStep.value = 'processing';
  fileUploadProgress.value = 50;
  results.value = [];
  manualReviewMode.value = false;
  reviewComment.value = '';

  try {
    const createdTask = backendTask.value;
    const taskSummary = createTaskSummary(createdTask);
    tasks.value = [taskSummary];
    activeTaskId.value = taskSummary.id;
    pushLog(copy('preparedTaskLog', { task: taskSummary.taskName }));

    const sendOk = await triggerMakeWorkflow(createdTask);
    fileUploadProgress.value = 50;
    if (!sendOk) {
      status.value = 'failed';
      statusMessage.value = labels.value.makeFailed;
      updateTaskStatus(createdTask.taskId, labels.value.failed, labels.value.pendingReview);
      pushLog(labels.value.makeErrorLog);
      return;
    }

    status.value = 'processing';
    statusMessage.value = labels.value.waitingCallback;
    updateTaskStatus(createdTask.taskId, labels.value.processing);
    pushLog(labels.value.waitingCallbackLog);

    await pollTask(createdTask.taskId);
  } catch (error) {
    status.value = 'failed';
    statusMessage.value = labels.value.taskSubmitFailed;
    pushLog(copy('taskErrorLog', { error: error.message }));
  }
};

const showResult = (id) => {
  activeTaskId.value = id;
  const resultCard = document.getElementById('results-card');
  if (resultCard) {
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

const openManualReview = (id) => {
  activeTaskId.value = id;
  manualReviewMode.value = true;
  const resultCard = document.getElementById('results-card');
  if (resultCard) {
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

const completeReview = () => {
  if (!activeTask.value) return;
  activeTask.value.reviewStatus = labels.value.reviewed;
  pushLog(copy('reviewedLog', { task: activeTask.value.taskName }));
  manualReviewMode.value = false;
};
</script>

<style scoped>
.hidden-input {
  display: none;
}

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

.page-title-row h2 {
  margin: 0;
  font-size: 28px;
}

.subtle {
  margin: 8px 0 0;
  color: var(--muted);
  max-width: 680px;
}

.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 2.2fr) minmax(320px, 1fr);
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

.config-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.config-field {
  display: grid;
  gap: 8px;
}

.config-field label {
  font-size: 13px;
  color: var(--muted);
}

.config-field input {
  width: 100%;
  min-height: 44px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 14px;
  font-size: 14px;
}

.upload-zone {
  border: 1px dashed var(--line);
  border-radius: 16px;
  padding: 24px;
  background: linear-gradient(135deg, #f7fbff 0%, #f2f6ff 100%);
  display: grid;
  gap: 16px;
}

.upload-zone.active {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(36, 107, 255, 0.14);
}

.upload-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.upload-desc {
  margin: 0;
  color: var(--muted);
}

.upload-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.upload-actions-primary {
  display: flex;
  gap: 10px;
  flex: 1;
}

.upload-summary {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 14px;
  background: #f6f8ff;
  color: var(--muted);
}

.files-list {
  display: grid;
  gap: 12px;
  margin-top: 12px;
}

.files-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
  font-size: 13px;
}

.files-header strong {
  font-weight: 700;
}

.file-size {
  color: var(--muted);
}

.file-item-container {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  max-height: 280px;
  overflow-y: auto;
  padding-right: 8px;
}

.file-item-container::-webkit-scrollbar {
  width: 6px;
}

.file-item-container::-webkit-scrollbar-track {
  background: transparent;
}

.file-item-container::-webkit-scrollbar-thumb {
  background: #ddd;
  border-radius: 3px;
}

.file-item-container::-webkit-scrollbar-thumb:hover {
  background: #bbb;
}

.file-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: #f8fbff;
  border-radius: 12px;
  border: 1px solid var(--line);
  position: relative;
}

.file-badge {
  padding: 4px 8px;
  background: #e8f9ee;
  color: #177b3f;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.file-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  color: var(--muted);
}

.file-text {
  min-width: 0;
  flex: 1;
}

.file-name {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100px;
}

.file-meta {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--muted);
}

.remove-btn {
  padding: 4px 6px;
  background: transparent;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  transition: color 0.2s ease;
  flex-shrink: 0;
  margin-left: 8px;
}

.remove-btn:hover {
  color: #c63a3a;
}

.file-badge {
  padding: 4px 8px;
  background: #e8f9ee;
  color: #177b3f;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
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
  height: 10px;
  background: #f1f5ff;
  border-radius: 999px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #4b7dff, #7398ff);
  border-radius: 999px;
  transition: width 0.25s ease;
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
  max-width: 280px;
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
  padding: 16px;
  border-radius: 16px;
  background: #f8fbff;
  border: 1px solid var(--line);
}

.task-row.active {
  border-color: var(--primary);
  background: #eff4ff;
}

.task-row p {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 13px;
}

.task-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
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
