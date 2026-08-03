<template>
  <section class="ocr-page">
    <template v-if="!detailTaskId">
      <div class="toolbar-card">
        <div>
          <p class="eyebrow">LLM 工作流</p>
          <h3>选择识别工作流并创建执行任务</h3>
          <p class="muted">每个工作流独立保存 Webhook 与回调地址，执行时自动携带 sessionId。</p>
        </div>
        <button class="primary-button" type="button" @click="beginCreateWorkflow">＋ 新建工作流</button>
      </div>

      <div v-if="workflowEditorOpen" class="panel-card workflow-editor">
        <div class="section-head">
          <div><p class="eyebrow">工作流配置</p><h3>{{ editingWorkflowId ? '编辑工作流' : '新建工作流' }}</h3></div>
          <button class="icon-button" type="button" @click="workflowEditorOpen = false">×</button>
        </div>
        <div class="form-grid">
          <label><span>工作流名称</span><input v-model="workflowForm.name" placeholder="例如：租赁合同 OCR 对账" /></label>
          <label><span>Make Webhook 地址</span><input v-model="workflowForm.webhookUrl" type="url" placeholder="https://hook.eu1.make.com/..." /></label>
          <label><span>回调地址</span><input v-model="workflowForm.callbackUrl" type="url" placeholder="https://your-server.com/api/v1/ocr/callback" /></label>
          <label class="description-field"><span>说明（可选）</span><input v-model="workflowForm.description" placeholder="说明该工作流识别的单据和用途" /></label>
        </div>
        <div class="editor-actions">
          <label class="switch-label"><input v-model="workflowForm.enabled" type="checkbox" /> 启用</label>
          <button class="ghost-button" type="button" @click="workflowEditorOpen = false">取消</button>
          <button class="primary-button" type="button" :disabled="savingWorkflow" @click="saveWorkflow">{{ savingWorkflow ? '保存中…' : '保存工作流' }}</button>
        </div>
      </div>

      <div class="workflow-grid">
        <article
          v-for="workflow in workflows"
          :key="workflow.id"
          class="workflow-card"
          :class="{ selected: selectedWorkflowId === workflow.id, disabled: !workflow.enabled }"
          @click="selectWorkflow(workflow.id)"
        >
          <div class="workflow-top">
            <span class="workflow-icon">AI</span>
            <span class="state-dot" :class="{ off: !workflow.enabled }">{{ workflow.enabled ? '已启用' : '已停用' }}</span>
          </div>
          <h3>{{ workflow.name }}</h3>
          <p>{{ workflow.description || '未填写工作流说明' }}</p>
          <div class="webhook-preview">{{ workflow.webhookUrl }}</div>
          <div class="workflow-actions">
            <button type="button" @click.stop="editWorkflow(workflow)">编辑</button>
            <button class="danger-link" type="button" @click.stop="removeWorkflow(workflow)">删除</button>
          </div>
        </article>
        <button v-if="!workflows.length && !loading" class="empty-workflow" type="button" @click="beginCreateWorkflow">
          <strong>＋ 创建第一个 LLM 工作流</strong>
          <span>配置名称、Webhook 与回调地址后即可执行。</span>
        </button>
      </div>

      <div v-if="selectedWorkflow" class="panel-card execution-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">创建执行任务</p>
            <h3>{{ selectedWorkflow.name }}</h3>
          </div>
          <span class="session-chip">sessionId 将自动生成</span>
        </div>
        <div class="task-name-row">
          <label><span>任务名称</span><input v-model="taskName" placeholder="例如：2026 年 8 月合同对账" /></label>
        </div>
        <div
          class="drop-zone"
          :class="{ dragging: isDragging }"
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @drop.prevent="handleDrop"
        >
          <input ref="fileInput" class="hidden-input" type="file" multiple @change="handleFileSelection" />
          <div class="upload-symbol">⇧</div>
          <strong>拖放任意数量文件到这里</strong>
          <p>支持 PDF、JPG、PNG、Excel、CSV、Word；单个文件最大 100 MB。</p>
          <button class="secondary-button" type="button" @click="fileInput?.click()">选择文件</button>
        </div>
        <div v-if="selectedFiles.length" class="selected-files">
          <div v-for="(file, index) in selectedFiles" :key="`${file.name}-${index}`" class="file-row">
            <span><strong>{{ file.name }}</strong><small>{{ formatSize(file.size) }}</small></span>
            <button type="button" @click="selectedFiles.splice(index, 1)">×</button>
          </div>
        </div>
        <div class="execute-bar">
          <span>已选择 {{ selectedFiles.length }} 个文件</span>
          <button class="primary-button" type="button" :disabled="submitting || !selectedFiles.length || !taskName.trim()" @click="createAndStartTask">
            {{ submitting ? '正在提交…' : '执行工作流' }}
          </button>
        </div>
        <p v-if="message" class="feedback" :class="{ error: messageIsError }">{{ message }}</p>
      </div>

      <div class="panel-card task-center">
        <div class="section-head">
          <div><p class="eyebrow">任务中心</p><h3>{{ selectedWorkflow ? selectedWorkflow.name : '全部工作流' }}的执行记录</h3></div>
          <button class="secondary-button" type="button" @click="loadTasks">刷新</button>
        </div>
        <div v-if="filteredTasks.length" class="task-table-wrap">
          <table class="task-table">
            <thead><tr><th>任务名称</th><th>工作流</th><th>文件</th><th>sessionId</th><th>状态</th><th>创建时间</th><th></th></tr></thead>
            <tbody>
              <tr v-for="task in filteredTasks" :key="task.id" class="clickable" @click="openTask(task)">
                <td><strong>{{ task.taskName }}</strong></td>
                <td>{{ task.workflow?.name || '已删除工作流' }}</td>
                <td>{{ task.fileNames.length }}</td>
                <td><code>{{ shortSession(task.sessionId) }}</code></td>
                <td><span class="status-tag" :class="statusTone(task.state)">{{ statusText(task.state) }}</span></td>
                <td>{{ formatDate(task.createdAt) }}</td>
                <td><button class="open-link" type="button">打开详情 ↗</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="empty-state">暂无执行任务。选择工作流并上传文件后，任务会显示在这里。</div>
      </div>
    </template>

    <template v-else>
      <div class="detail-heading">
        <div>
          <p class="eyebrow">OCR 对账任务详情</p>
          <h2>{{ detailTask?.taskName || '加载任务中…' }}</h2>
          <p class="muted">{{ detailTask?.workflow?.name }} · sessionId: {{ detailTask?.sessionId }}</p>
        </div>
        <button class="secondary-button" type="button" @click="loadDetailTask">刷新</button>
      </div>

      <div class="detail-process panel-card">
        <div class="process-main">
          <span :class="{ done: detailTask }">上传文件</span><i>→</i>
          <span :class="{ done: detailTask?.startedAt }">执行工作流</span><i>→</i>
          <span :class="{ done: ['COMPLETED','REVIEW_REQUIRED'].includes(detailTask?.state) }">回调解析</span><i>→</i>
          <span :class="{ done: detailSummary.total > 0 }">系统匹配</span><i>→</i>
          <span :class="{ done: detailTask?.reviewStatus === 'COMPLETED' }">完成审核</span>
        </div>
        <span class="status-tag large" :class="statusTone(detailTask?.state)">{{ statusText(detailTask?.state) }}</span>
      </div>

      <div class="metrics-grid">
        <div><small>合计</small><strong>{{ detailSummary.total }}</strong></div>
        <div><small>自动匹配</small><strong>{{ detailSummary.matched }}</strong></div>
        <div><small>待人工确认</small><strong>{{ detailSummary.unmatched }}</strong></div>
        <div><small>文件数量</small><strong>{{ detailTask?.fileNames?.length || 0 }}</strong></div>
        <div><small>审核状态</small><strong class="metric-text">{{ detailTask?.reviewStatus || 'PENDING' }}</strong></div>
      </div>

      <div class="detail-layout">
        <aside class="history-card panel-card">
          <div class="section-head"><h3>原始文件</h3><span>{{ detailTask?.fileNames?.length || 0 }}</span></div>
          <div v-for="name in detailTask?.fileNames || []" :key="name" class="source-file">▧ {{ name }}</div>
        </aside>
        <div class="panel-card result-panel">
          <div class="result-toolbar">
            <div class="tabs"><button :class="{ active: resultFilter === 'ALL' }" @click="resultFilter = 'ALL'">全部</button><button :class="{ active: resultFilter === 'MATCHED' }" @click="resultFilter = 'MATCHED'">已匹配</button><button :class="{ active: resultFilter === 'UNMATCHED' }" @click="resultFilter = 'UNMATCHED'">待确认</button></div>
            <input v-model="searchKeyword" type="search" placeholder="搜索摘要、租客、业主、房间" />
          </div>
          <div class="result-table-wrap">
            <table class="result-table">
              <thead><tr><th>原始文件</th><th>日期</th><th>摘要 / 对方</th><th>金额</th><th>房间</th><th>系统匹配</th><th>匹配说明</th></tr></thead>
              <tbody>
                <tr v-for="(record, index) in visibleRecords" :key="index">
                  <td>{{ valueOf(record, 'original_file_name', 'fileName') || detailTask?.fileNames?.[0] || '—' }}</td>
                  <td>{{ valueOf(record, 'date', 'target_month', 'transactionDate') || '—' }}</td>
                  <td>{{ valueOf(record, 'summary', 'tenant_name', 'tenantName', 'owner_name', 'ownerName') || '—' }}</td>
                  <td>{{ money(valueOf(record, 'net_amount', 'document_amount', 'amount')) }}</td>
                  <td>{{ valueOf(record, 'room_number', 'roomNumber', 'room') || '—' }}</td>
                  <td><span class="status-tag" :class="record.systemMatch?.status === 'MATCHED' ? 'success' : 'warning'">{{ record.systemMatch?.status === 'MATCHED' ? '已匹配' : '待确认' }}</span></td>
                  <td>{{ record.systemMatch?.reason || '—' }}</td>
                </tr>
                <tr v-if="!visibleRecords.length"><td colspan="7" class="empty-cell">暂无回调数据，工作流完成后将自动显示匹配结果。</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <p v-if="detailTask?.errorMessage" class="feedback error">{{ detailTask.errorMessage }}</p>
    </template>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { api } from '../services/api';

const detailTaskId = decodeURIComponent(window.location.pathname.match(/^\/ai-reconciliation\/ocr\/tasks\/([^/]+)/)?.[1] || '');
const workflows = ref([]);
const tasks = ref([]);
const selectedWorkflowId = ref('');
const selectedFiles = ref([]);
const taskName = ref('');
const fileInput = ref(null);
const isDragging = ref(false);
const loading = ref(true);
const submitting = ref(false);
const savingWorkflow = ref(false);
const workflowEditorOpen = ref(false);
const editingWorkflowId = ref('');
const message = ref('');
const messageIsError = ref(false);
const detailTask = ref(null);
const resultFilter = ref('ALL');
const searchKeyword = ref('');
let pollTimer;

const workflowForm = reactive({ name: '', description: '', webhookUrl: '', callbackUrl: '', enabled: true });
const selectedWorkflow = computed(() => workflows.value.find((item) => item.id === selectedWorkflowId.value) || null);
const filteredTasks = computed(() => selectedWorkflowId.value ? tasks.value.filter((task) => task.workflowId === selectedWorkflowId.value) : tasks.value);
const detailRecords = computed(() => detailTask.value?.resultJson?.records || detailTask.value?.matchedResultJson?.records || []);
const detailSummary = computed(() => detailTask.value?.resultJson?.summary || { total: detailRecords.value.length, matched: detailRecords.value.filter((item) => item.systemMatch?.status === 'MATCHED').length, unmatched: detailRecords.value.filter((item) => item.systemMatch?.status !== 'MATCHED').length });
const visibleRecords = computed(() => {
  const query = searchKeyword.value.trim().toLowerCase();
  return detailRecords.value.filter((record) => {
    const matchesFilter = resultFilter.value === 'ALL' || (resultFilter.value === 'MATCHED' ? record.systemMatch?.status === 'MATCHED' : record.systemMatch?.status !== 'MATCHED');
    const matchesQuery = !query || JSON.stringify(record).toLowerCase().includes(query);
    return matchesFilter && matchesQuery;
  });
});

function defaultCallbackUrl() { return `${window.location.origin}/api/v1/ocr/callback`; }
function beginCreateWorkflow() {
  editingWorkflowId.value = '';
  Object.assign(workflowForm, { name: '', description: '', webhookUrl: '', callbackUrl: defaultCallbackUrl(), enabled: true });
  workflowEditorOpen.value = true;
}
function editWorkflow(workflow) {
  editingWorkflowId.value = workflow.id;
  Object.assign(workflowForm, { name: workflow.name, description: workflow.description || '', webhookUrl: workflow.webhookUrl, callbackUrl: workflow.callbackUrl, enabled: workflow.enabled });
  workflowEditorOpen.value = true;
}
async function saveWorkflow() {
  if (!workflowForm.name.trim() || !workflowForm.webhookUrl.trim() || !workflowForm.callbackUrl.trim()) return showMessage('请完整填写名称、Webhook 与回调地址。', true);
  savingWorkflow.value = true;
  try {
    const saved = await api.saveOcrWorkflow({ ...workflowForm }, editingWorkflowId.value);
    await loadWorkflows();
    selectedWorkflowId.value = saved.id;
    workflowEditorOpen.value = false;
    showMessage('工作流已保存。');
  } catch (error) { showMessage(error.message, true); }
  finally { savingWorkflow.value = false; }
}
async function removeWorkflow(workflow) {
  if (!window.confirm(`确定删除工作流“${workflow.name}”吗？历史任务仍会保留。`)) return;
  try { await api.deleteOcrWorkflow(workflow.id); if (selectedWorkflowId.value === workflow.id) selectedWorkflowId.value = ''; await loadWorkflows(); }
  catch (error) { showMessage(error.message, true); }
}
function selectWorkflow(id) { const workflow = workflows.value.find((item) => item.id === id); if (workflow?.enabled) selectedWorkflowId.value = id; }
async function loadWorkflows() { workflows.value = await api.listOcrWorkflows(); if (!selectedWorkflowId.value && workflows.value.length) selectedWorkflowId.value = workflows.value.find((item) => item.enabled)?.id || ''; }
async function loadTasks() { tasks.value = await api.listOcrTasks(); }
function handleFileSelection(event) { selectedFiles.value.push(...Array.from(event.target.files || [])); event.target.value = ''; }
function handleDrop(event) { isDragging.value = false; selectedFiles.value.push(...Array.from(event.dataTransfer?.files || [])); }
async function createAndStartTask() {
  submitting.value = true;
  try {
    const form = new FormData();
    form.append('workflowId', selectedWorkflowId.value);
    form.append('taskName', taskName.value.trim());
    selectedFiles.value.forEach((file) => form.append('files', file, file.name));
    const task = await api.uploadOcrTask(form);
    await api.startOcrTask(task.taskId);
    selectedFiles.value = [];
    taskName.value = '';
    await loadTasks();
    showMessage(`任务已提交，sessionId：${task.sessionId}`);
    openTask(task);
  } catch (error) { showMessage(error.message, true); }
  finally { submitting.value = false; }
}
function openTask(task) { window.open(`/ai-reconciliation/ocr/tasks/${encodeURIComponent(task.taskId)}`, '_blank', 'noopener,noreferrer'); }
async function loadDetailTask() {
  try {
    detailTask.value = await api.getOcrTask(detailTaskId);
    if (['COMPLETED', 'REVIEW_REQUIRED', 'FAILED'].includes(detailTask.value.state)) { clearInterval(pollTimer); pollTimer = undefined; }
  } catch (error) { showMessage(error.message, true); }
}
function showMessage(text, isError = false) { message.value = text; messageIsError.value = isError; }
function formatSize(bytes) { if (!bytes) return '0 B'; const units = ['B','KB','MB','GB']; const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3); return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`; }
function formatDate(value) { return value ? new Date(value).toLocaleString() : '—'; }
function shortSession(value) { return value ? `${value.slice(0, 8)}…${value.slice(-4)}` : '—'; }
function statusText(state) { return ({ PENDING:'待处理', UPLOADING:'已上传', PROCESSING:'执行中', COMPLETED:'已完成', REVIEW_REQUIRED:'待人工确认', FAILED:'失败' })[state] || '未知'; }
function statusTone(state) { return ['COMPLETED'].includes(state) ? 'success' : ['FAILED'].includes(state) ? 'danger' : ['REVIEW_REQUIRED'].includes(state) ? 'warning' : 'processing'; }
function valueOf(record, ...keys) { return keys.map((key) => record?.[key]).find((value) => value !== undefined && value !== null && value !== ''); }
function money(value) { if (value === undefined || value === null || value === '') return '—'; const number = Number(value); return Number.isFinite(number) ? `¥${number.toLocaleString()}` : value; }

onMounted(async () => {
  loading.value = true;
  try {
    if (detailTaskId) { await loadDetailTask(); if (!['COMPLETED','REVIEW_REQUIRED','FAILED'].includes(detailTask.value?.state)) pollTimer = setInterval(loadDetailTask, 3000); }
    else { await Promise.all([loadWorkflows(), loadTasks()]); }
  } catch (error) { showMessage(error.message, true); }
  finally { loading.value = false; }
});
onBeforeUnmount(() => clearInterval(pollTimer));
</script>

<style scoped>
.ocr-page{display:grid;gap:20px;color:#10223c}.panel-card,.toolbar-card,.workflow-card,.metrics-grid>div{background:#fff;border:1px solid #d8e1eb;border-radius:16px;box-shadow:0 8px 26px rgba(20,42,72,.04)}.toolbar-card{padding:22px;display:flex;align-items:center;justify-content:space-between;gap:20px}.toolbar-card h3,.section-head h3,.workflow-card h3{margin:3px 0 0}.muted{color:#687c96;margin:6px 0 0}.eyebrow{color:#087f78;font-size:12px;font-weight:800;letter-spacing:.08em;margin:0}.workflow-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.workflow-card{padding:18px;cursor:pointer;transition:.18s}.workflow-card:hover,.workflow-card.selected{border-color:#0b948b;box-shadow:0 9px 28px rgba(11,148,139,.13);transform:translateY(-2px)}.workflow-card.disabled{opacity:.6;cursor:default}.workflow-top,.workflow-actions,.section-head,.editor-actions,.execute-bar,.detail-heading,.result-toolbar{display:flex;align-items:center;justify-content:space-between;gap:14px}.workflow-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:11px;background:#e4f6f3;color:#087f78;font-weight:900}.state-dot,.session-chip{font-size:12px;color:#087f78;background:#e9f8f5;padding:6px 10px;border-radius:999px}.state-dot.off{color:#7c8797;background:#eef1f4}.workflow-card>p{color:#718096;min-height:42px}.webhook-preview{font-family:monospace;font-size:12px;background:#f4f7fa;padding:10px;border-radius:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.workflow-actions{margin-top:13px;justify-content:flex-end}.workflow-actions button,.open-link,.tabs button{border:0;background:transparent;color:#087f78;cursor:pointer}.workflow-actions .danger-link{color:#c2414d}.empty-workflow{min-height:210px;border:1px dashed #9fb2c7;border-radius:16px;background:#f7fafc;color:#536982;display:grid;place-content:center;gap:7px;cursor:pointer}.panel-card{padding:20px}.workflow-editor{border-color:#88c9c3}.form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:18px}.form-grid label,.task-name-row label{display:grid;gap:7px;font-weight:700;font-size:13px}.form-grid input,.task-name-row input,.result-toolbar input{border:1px solid #ccd8e5;border-radius:10px;padding:11px 13px;font:inherit}.description-field{grid-column:1/-1}.editor-actions{margin-top:16px;justify-content:flex-end}.switch-label{margin-right:auto}.icon-button{border:0;background:#f1f5f8;width:32px;height:32px;border-radius:8px;font-size:21px;cursor:pointer}.task-name-row{max-width:560px;margin:18px 0 12px}.drop-zone{min-height:190px;border:1.5px dashed #b8c9dc;border-radius:14px;background:#f6f9fd;display:grid;place-items:center;align-content:center;gap:8px;text-align:center;padding:20px}.drop-zone.dragging{border-color:#0b948b;background:#ecfaf8}.drop-zone p{margin:0 0 8px;color:#718096}.upload-symbol{font-size:25px;color:#0b948b}.hidden-input{display:none}.selected-files{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}.file-row{display:flex;align-items:center;justify-content:space-between;background:#f5f8fb;border-radius:9px;padding:9px 12px}.file-row span{min-width:0;display:flex;gap:8px;align-items:center}.file-row strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.file-row small{color:#7b8da3;white-space:nowrap}.file-row button{border:0;background:transparent;font-size:18px;cursor:pointer}.execute-bar{margin-top:16px}.feedback{padding:10px 13px;border-radius:9px;background:#e9f8f5;color:#087f78}.feedback.error{background:#fff0f1;color:#b4232f}.task-table-wrap,.result-table-wrap{overflow:auto}.task-table,.result-table{border-collapse:collapse;width:100%;min-width:900px}.task-table th,.task-table td,.result-table th,.result-table td{padding:13px 10px;text-align:left;border-bottom:1px solid #e4eaf1;font-size:13px}.task-table th,.result-table th{color:#62768e;font-weight:700}.clickable{cursor:pointer}.clickable:hover{background:#f5fbfa}.status-tag{display:inline-flex;padding:5px 9px;border-radius:999px;font-size:12px;white-space:nowrap}.status-tag.success{background:#e8f8ee;color:#177647}.status-tag.processing{background:#eaf3ff;color:#2764a8}.status-tag.warning{background:#fff4dc;color:#a45b05}.status-tag.danger{background:#ffe9eb;color:#b4232f}.status-tag.large{font-size:13px;padding:8px 12px}.empty-state,.empty-cell{text-align:center;color:#7c8ea3;padding:34px!important}.detail-heading h2{margin:4px 0;font-size:25px}.detail-process{display:flex;align-items:center;justify-content:space-between}.process-main{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.process-main span{background:#edf2f6;color:#718096;padding:9px 14px;border-radius:8px;font-weight:700}.process-main span.done{background:#dff4f0;color:#087f78}.process-main i{font-style:normal;color:#0b948b}.metrics-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.metrics-grid>div{padding:18px;display:grid;gap:8px}.metrics-grid small{color:#667a92}.metrics-grid strong{font-size:25px}.metrics-grid .metric-text{font-size:15px}.detail-layout{display:grid;grid-template-columns:250px minmax(0,1fr);gap:14px}.history-card{align-self:start}.source-file{padding:11px 0;border-bottom:1px solid #e6ebf0;overflow:hidden;text-overflow:ellipsis}.result-toolbar{margin-bottom:10px}.tabs{display:flex;gap:8px}.tabs button{padding:8px 11px}.tabs button.active{color:#087f78;font-weight:800;border-bottom:2px solid #0b948b}.result-toolbar input{width:280px}.primary-button,.secondary-button,.ghost-button{border-radius:10px;padding:10px 16px;font-weight:700;cursor:pointer}.primary-button{border:1px solid #0b948b;background:#0b948b;color:#fff}.secondary-button{border:1px solid #cdd9e5;background:#fff;color:#17304f}.ghost-button{border:0;background:#eef3f6;color:#536982}.primary-button:disabled{opacity:.5;cursor:not-allowed}@media(max-width:1000px){.workflow-grid{grid-template-columns:repeat(2,1fr)}.form-grid{grid-template-columns:1fr}.description-field{grid-column:auto}.metrics-grid{grid-template-columns:repeat(2,1fr)}.detail-layout{grid-template-columns:1fr}}@media(max-width:680px){.workflow-grid,.selected-files{grid-template-columns:1fr}.toolbar-card,.detail-heading,.detail-process{align-items:flex-start;flex-direction:column}.metrics-grid{grid-template-columns:1fr}}
</style>
