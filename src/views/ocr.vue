<template>
  <section class="ocr-page">
    <!-- 工作流配置列表 -->
    <template v-if="pageMode === 'list'">
      <div class="toolbar-card">
        <div>
          <p class="eyebrow">LLM 工作流</p>
          <h3>工作流任务配置</h3>
          <p class="muted">创建不同的识别工作流，并为每个工作流配置独立的 Webhook 与 JSON 回调地址。</p>
        </div>
        <button class="primary-button" type="button" @click="beginCreateWorkflow">＋ 新建工作流</button>
      </div>

      <div class="panel-card workflow-list-card">
        <div class="section-head">
          <div><p class="eyebrow">工作流列表</p><h3>已创建的工作流任务</h3></div>
          <button class="secondary-button" type="button" @click="loadPage">刷新</button>
        </div>
        <div v-if="workflows.length" class="table-scroll">
          <table class="workflow-table">
            <thead><tr><th>工作流名称</th><th>说明</th><th>Webhook 地址</th><th>回调地址</th><th>状态</th><th>执行次数</th><th>更新时间</th><th class="operation-col">操作</th></tr></thead>
            <tbody>
              <tr v-for="workflow in workflows" :key="workflow.id">
                <td><strong>{{ workflow.name }}</strong></td>
                <td>{{ workflow.description || '—' }}</td>
                <td><code :title="workflow.webhookUrl">{{ compactUrl(workflow.webhookUrl) }}</code></td>
                <td><code :title="workflow.callbackUrl">{{ compactUrl(workflow.callbackUrl) }}</code></td>
                <td><span class="status-tag" :class="workflow.enabled ? 'success' : 'muted-tag'">{{ workflow.enabled ? '已启用' : '已停用' }}</span></td>
                <td>{{ taskCountByWorkflow[workflow.id] || 0 }}</td>
                <td>{{ formatDate(workflow.updatedAt) }}</td>
                <td class="operation-col">
                  <div class="row-actions">
                    <button type="button" @click="editWorkflow(workflow)">编辑</button>
                    <button type="button" class="execute-link" :disabled="!workflow.enabled" @click="openExecution(workflow)">执行</button>
                    <button type="button" class="danger-link" @click="requestDelete(workflow)">删除</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <button v-else-if="!loading" class="empty-list" type="button" @click="beginCreateWorkflow">
          <strong>＋ 创建第一个 LLM 工作流</strong>
          <span>保存后将在此列表中显示，并可编辑、执行或删除。</span>
        </button>
        <div v-else class="empty-state">正在加载工作流…</div>
      </div>
    </template>

    <!-- 独立执行页面 -->
    <template v-else-if="pageMode === 'execute'">
      <div class="page-heading">
        <div>
          <button class="back-link" type="button" @click="goToWorkflowList">← 返回工作流列表</button>
          <p class="eyebrow">执行 LLM 工作流</p>
          <h2>{{ executionWorkflow?.name || '加载工作流中…' }}</h2>
          <p class="muted">本次执行将自动生成 sessionId，并将所有文件一次性提交到该工作流。</p>
        </div>
        <span v-if="executionWorkflow" class="status-tag" :class="executionWorkflow.enabled ? 'success' : 'muted-tag'">{{ executionWorkflow.enabled ? '工作流已启用' : '工作流已停用' }}</span>
      </div>

      <div class="panel-card execution-card">
        <div class="workflow-info-grid">
          <div><small>Webhook</small><code>{{ executionWorkflow?.webhookUrl || '—' }}</code></div>
          <div><small>JSON 回调地址</small><code>{{ executionWorkflow?.callbackUrl || '—' }}</code></div>
        </div>
        <label class="task-name-field"><span>本次任务名称</span><input v-model="taskName" :disabled="isExecuting" placeholder="例如：2026 年 8 月合同对账" /></label>
        <div
          class="drop-zone"
          :class="{ dragging: isDragging, disabled: isExecuting }"
          @dragover.prevent="!isExecuting && (isDragging = true)"
          @dragleave.prevent="isDragging = false"
          @drop.prevent="handleDrop"
        >
          <input ref="fileInput" class="hidden-input" type="file" multiple :disabled="isExecuting" @change="handleFileSelection" />
          <div class="upload-symbol">⇧</div>
          <strong>选择本地单个或多个文件</strong>
          <p>支持 PDF、JPG、PNG、Excel、CSV、Word；单个文件最大 100 MB。</p>
          <button class="secondary-button" type="button" :disabled="isExecuting" @click="fileInput?.click()">选择文件</button>
        </div>

        <div v-if="selectedFiles.length" class="selected-files">
          <div v-for="(file, index) in selectedFiles" :key="`${file.name}-${file.size}-${index}`" class="file-row">
            <span><strong>{{ file.name }}</strong><small>{{ formatSize(file.size) }}</small></span>
            <button type="button" :disabled="isExecuting" @click="selectedFiles.splice(index, 1)">×</button>
          </div>
        </div>

        <div v-if="executionPhase !== 'idle'" class="progress-card">
          <div class="progress-head"><strong>{{ progressTitle }}</strong><span>{{ Math.round(progressPercent) }}%</span></div>
          <div class="progress-track"><div class="progress-fill" :class="{ failed: executionPhase === 'failed' }" :style="{ width: `${progressPercent}%` }"></div></div>
          <div class="progress-steps">
            <span :class="{ active: progressPercent >= 1 }">上传文件</span>
            <span :class="{ active: progressPercent >= 60 }">调用 Webhook</span>
            <span :class="{ active: progressPercent >= 72 }">等待 JSON 回调</span>
            <span :class="{ active: progressPercent === 100 }">完成匹配</span>
          </div>
          <p v-if="activeTask?.sessionId">sessionId：<code>{{ activeTask.sessionId }}</code></p>
        </div>

        <div class="execute-bar">
          <span>已选择 {{ selectedFiles.length }} 个文件</span>
          <div class="execute-actions">
            <button v-if="activeTask && ['completed','review','failed'].includes(executionPhase)" class="secondary-button" type="button" @click="openTaskDetail(activeTask)">查看任务详情</button>
            <button class="primary-button" type="button" :disabled="isExecuting || !canExecute" @click="executeWorkflow">{{ isExecuting ? '正在执行…' : '执行工作流' }}</button>
          </div>
        </div>
        <p v-if="message" class="feedback" :class="{ error: messageIsError }">{{ message }}</p>
      </div>
    </template>

    <!-- 任务匹配详情 -->
    <template v-else>
      <div class="page-heading">
        <div><p class="eyebrow">OCR 对账任务详情</p><h2>{{ detailTask?.taskName || '加载任务中…' }}</h2><p class="muted">{{ detailTask?.workflow?.name }} · sessionId: {{ detailTask?.sessionId }}</p></div>
        <button class="secondary-button" type="button" @click="loadDetailTask">刷新</button>
      </div>
      <div class="detail-process panel-card">
        <div class="process-main"><span :class="{ done: detailTask }">上传文件</span><i>→</i><span :class="{ done: detailTask?.startedAt }">执行工作流</span><i>→</i><span :class="{ done: ['COMPLETED','REVIEW_REQUIRED'].includes(detailTask?.state) }">回调解析</span><i>→</i><span :class="{ done: detailSummary.total > 0 }">系统匹配</span></div>
        <span class="status-tag large" :class="statusTone(detailTask?.state)">{{ statusText(detailTask?.state) }}</span>
      </div>
      <div class="metrics-grid"><div><small>合计</small><strong>{{ detailSummary.total }}</strong></div><div><small>自动匹配</small><strong>{{ detailSummary.matched }}</strong></div><div><small>待人工确认</small><strong>{{ detailSummary.unmatched }}</strong></div><div><small>文件数量</small><strong>{{ detailTask?.fileNames?.length || 0 }}</strong></div><div><small>审核状态</small><strong class="metric-text">{{ detailTask?.reviewStatus || 'PENDING' }}</strong></div></div>
      <div class="detail-layout">
        <aside class="panel-card history-card"><div class="section-head"><h3>原始文件</h3><span>{{ detailTask?.fileNames?.length || 0 }}</span></div><div v-for="name in detailTask?.fileNames || []" :key="name" class="source-file">▧ {{ name }}</div></aside>
        <div class="panel-card result-panel">
          <div class="result-toolbar"><div class="tabs"><button :class="{ active: resultFilter === 'ALL' }" @click="resultFilter = 'ALL'">全部</button><button :class="{ active: resultFilter === 'MATCHED' }" @click="resultFilter = 'MATCHED'">已匹配</button><button :class="{ active: resultFilter === 'UNMATCHED' }" @click="resultFilter = 'UNMATCHED'">待确认</button></div><input v-model="searchKeyword" type="search" placeholder="搜索摘要、租客、业主、房间" /></div>
          <div class="table-scroll"><table class="result-table"><thead><tr><th>原始文件</th><th>日期</th><th>摘要 / 对方</th><th>金额</th><th>房间</th><th>系统匹配</th><th>匹配说明</th></tr></thead><tbody><tr v-for="(record, index) in visibleRecords" :key="index"><td>{{ valueOf(record, 'original_file_name', 'fileName') || detailTask?.fileNames?.[0] || '—' }}</td><td>{{ valueOf(record, 'date', 'target_month', 'transactionDate') || '—' }}</td><td>{{ valueOf(record, 'summary', 'tenant_name', 'tenantName', 'owner_name', 'ownerName') || '—' }}</td><td>{{ money(valueOf(record, 'net_amount', 'document_amount', 'amount')) }}</td><td>{{ valueOf(record, 'room_number', 'roomNumber', 'room') || '—' }}</td><td><span class="status-tag" :class="record.systemMatch?.status === 'MATCHED' ? 'success' : 'warning'">{{ record.systemMatch?.status === 'MATCHED' ? '已匹配' : '待确认' }}</span></td><td>{{ record.systemMatch?.reason || '—' }}</td></tr><tr v-if="!visibleRecords.length"><td colspan="7" class="empty-cell">暂无回调数据，工作流完成后将自动显示匹配结果。</td></tr></tbody></table></div>
        </div>
      </div>
      <p v-if="detailTask?.errorMessage" class="feedback error">{{ detailTask.errorMessage }}</p>
    </template>

    <!-- 新建/编辑弹框 -->
    <div v-if="workflowEditorOpen" class="modal-backdrop" @click.self="workflowEditorOpen = false">
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="workflow-dialog-title">
        <div class="section-head"><div><p class="eyebrow">LLM 工作流配置</p><h3 id="workflow-dialog-title">{{ editingWorkflowId ? '编辑工作流' : '新建工作流' }}</h3></div><button class="icon-button" type="button" @click="workflowEditorOpen = false">×</button></div>
        <div class="form-grid">
          <label><span>工作流名称</span><input v-model="workflowForm.name" placeholder="例如：银行账单对账" /></label>
          <label><span>工作流说明（可选）</span><input v-model="workflowForm.description" placeholder="说明识别单据和用途" /></label>
          <label class="full-field"><span>Make Webhook 地址</span><input v-model="workflowForm.webhookUrl" type="url" placeholder="https://hook.eu1.make.com/..." /></label>
          <label class="full-field"><span>JSON 回调地址</span><input v-model="workflowForm.callbackUrl" type="url" placeholder="https://your-server.com/api/v1/ocr/callback" /></label>
        </div>
        <p class="contract-note">Webhook 接收：taskId、sessionId、seesinId、taskName、callbackUrl，以及重复的 requestFile 文件字段。</p>
        <div class="modal-actions"><label class="switch-label"><input v-model="workflowForm.enabled" type="checkbox" /> 启用工作流</label><button class="ghost-button" type="button" @click="workflowEditorOpen = false">取消</button><button class="primary-button" type="button" :disabled="savingWorkflow" @click="saveWorkflow">{{ savingWorkflow ? '保存中…' : '保存' }}</button></div>
      </div>
    </div>

    <!-- 删除二次确认弹框 -->
    <div v-if="workflowPendingDelete" class="modal-backdrop" @click.self="workflowPendingDelete = null">
      <div class="modal-card confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title">
        <div class="warning-icon">!</div><h3 id="delete-dialog-title">确认删除工作流？</h3>
        <p>即将删除“{{ workflowPendingDelete.name }}”。历史执行任务和结果会保留，但该工作流将无法再次执行。</p>
        <div class="modal-actions confirm-actions"><button class="ghost-button" type="button" @click="workflowPendingDelete = null">取消</button><button class="danger-button" type="button" :disabled="deletingWorkflow" @click="confirmDelete">{{ deletingWorkflow ? '删除中…' : '确认删除' }}</button></div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { API_BASE, api } from '../services/api';

const path = window.location.pathname;
const routeQuery = new URLSearchParams(window.location.search);
const configuredEntryPath = import.meta.env?.VITE_APP_ENTRY_PATH;
const appEntryPath = configuredEntryPath
  || (/^(www\.)?kotabi\.top$/i.test(window.location.hostname) ? '/finance/' : '/');
// Query-based child pages work even when Nginx only exposes the base OCR SPA route.
// Keep parsing legacy deep links so direct NestJS deployments remain compatible.
const executionWorkflowId = routeQuery.get('mode') === 'execute'
  ? routeQuery.get('workflowId') || ''
  : decodeURIComponent(path.match(/^\/ai-reconciliation\/ocr\/workflows\/([^/]+)\/execute/)?.[1] || '');
const detailTaskId = routeQuery.get('mode') === 'detail'
  ? routeQuery.get('taskId') || ''
  : decodeURIComponent(path.match(/^\/ai-reconciliation\/ocr\/tasks\/([^/]+)/)?.[1] || '');
const pageMode = detailTaskId ? 'detail' : executionWorkflowId ? 'execute' : 'list';
const workflows = ref([]), tasks = ref([]), selectedFiles = ref([]), detailTask = ref(null), activeTask = ref(null);
const loading = ref(true), workflowEditorOpen = ref(false), savingWorkflow = ref(false), deletingWorkflow = ref(false), submitting = ref(false), isDragging = ref(false);
const editingWorkflowId = ref(''), workflowPendingDelete = ref(null), taskName = ref(''), fileInput = ref(null), message = ref(''), messageIsError = ref(false);
const executionPhase = ref('idle'), progressPercent = ref(0), resultFilter = ref('ALL'), searchKeyword = ref('');
let pollTimer, progressTimer;
const workflowForm = reactive({ name: '', description: '', webhookUrl: '', callbackUrl: '', enabled: true });
const executionWorkflow = computed(() => workflows.value.find((item) => item.id === executionWorkflowId) || null);
const taskCountByWorkflow = computed(() => tasks.value.reduce((counts, task) => ({ ...counts, [task.workflowId]: (counts[task.workflowId] || 0) + 1 }), {}));
const isExecuting = computed(() => ['uploading','dispatching','waiting'].includes(executionPhase.value));
const canExecute = computed(() => executionWorkflow.value?.enabled && selectedFiles.value.length && taskName.value.trim());
const progressTitle = computed(() => ({ uploading:'正在上传文件', dispatching:'文件已上传，正在调用 Webhook', waiting:'Webhook 已接收，等待 JSON 回调', completed:'工作流执行完成', review:'回调完成，需要人工确认', failed:'工作流执行失败' })[executionPhase.value] || '准备执行');
const detailRecords = computed(() => detailTask.value?.resultJson?.records || detailTask.value?.matchedResultJson?.records || []);
const detailSummary = computed(() => detailTask.value?.resultJson?.summary || { total: detailRecords.value.length, matched: detailRecords.value.filter((item) => item.systemMatch?.status === 'MATCHED').length, unmatched: detailRecords.value.filter((item) => item.systemMatch?.status !== 'MATCHED').length });
const visibleRecords = computed(() => { const query = searchKeyword.value.trim().toLowerCase(); return detailRecords.value.filter((record) => (resultFilter.value === 'ALL' || (resultFilter.value === 'MATCHED' ? record.systemMatch?.status === 'MATCHED' : record.systemMatch?.status !== 'MATCHED')) && (!query || JSON.stringify(record).toLowerCase().includes(query))); });

function beginCreateWorkflow() { editingWorkflowId.value = ''; Object.assign(workflowForm, { name:'', description:'', webhookUrl:'', callbackUrl:`${window.location.origin}${API_BASE}/ocr/callback`, enabled:true }); workflowEditorOpen.value = true; }
function editWorkflow(item) { editingWorkflowId.value = item.id; Object.assign(workflowForm, { name:item.name, description:item.description || '', webhookUrl:item.webhookUrl, callbackUrl:item.callbackUrl, enabled:item.enabled }); workflowEditorOpen.value = true; }
async function saveWorkflow() { if (!workflowForm.name.trim() || !workflowForm.webhookUrl.trim() || !workflowForm.callbackUrl.trim()) return showMessage('请完整填写工作流名称、Webhook 和回调地址。', true); savingWorkflow.value = true; try { await api.saveOcrWorkflow({ ...workflowForm }, editingWorkflowId.value); workflowEditorOpen.value = false; await loadPage(); showMessage('工作流配置已保存。'); } catch (error) { showMessage(error.message, true); } finally { savingWorkflow.value = false; } }
function requestDelete(item) { workflowPendingDelete.value = item; }
async function confirmDelete() { deletingWorkflow.value = true; try { await api.deleteOcrWorkflow(workflowPendingDelete.value.id); workflowPendingDelete.value = null; await loadPage(); showMessage('工作流已删除，历史任务仍保留。'); } catch (error) { showMessage(error.message, true); } finally { deletingWorkflow.value = false; } }
function openExecution(item) { window.open(`${appEntryPath}?view=ocr&mode=execute&workflowId=${encodeURIComponent(item.id)}`, '_blank', 'noopener,noreferrer'); }
function goToWorkflowList() { window.location.href = `${appEntryPath}?view=ocr`; }
async function loadPage() { [workflows.value, tasks.value] = await Promise.all([api.listOcrWorkflows(), api.listOcrTasks()]); }
function handleFileSelection(event) { selectedFiles.value.push(...Array.from(event.target.files || [])); event.target.value = ''; }
function handleDrop(event) { isDragging.value = false; if (!isExecuting.value) selectedFiles.value.push(...Array.from(event.dataTransfer?.files || [])); }
async function executeWorkflow() {
  submitting.value = true; message.value = ''; executionPhase.value = 'uploading'; progressPercent.value = 1;
  try {
    const form = new FormData(); form.append('workflowId', executionWorkflowId); form.append('taskName', taskName.value.trim()); selectedFiles.value.forEach((file) => form.append('files', file, file.name));
    activeTask.value = await api.uploadOcrTaskWithProgress(form, (percent) => { progressPercent.value = Math.max(progressPercent.value, percent * .58); });
    executionPhase.value = 'dispatching'; progressPercent.value = 62;
    await api.startOcrTask(activeTask.value.taskId);
    executionPhase.value = 'waiting'; progressPercent.value = 72;
    progressTimer = setInterval(() => { if (progressPercent.value < 92) progressPercent.value += 1; }, 1200);
    await pollExecution(activeTask.value.taskId);
  } catch (error) { clearTimers(); executionPhase.value = 'failed'; message.value = error.message; messageIsError.value = true; }
  finally { submitting.value = false; }
}
async function pollExecution(taskId) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await new Promise((resolve) => { pollTimer = setTimeout(resolve, 2500); });
    activeTask.value = await api.getOcrTask(taskId);
    if (['COMPLETED','REVIEW_REQUIRED','FAILED'].includes(activeTask.value.state)) {
      clearTimers(); progressPercent.value = activeTask.value.state === 'FAILED' ? Math.max(72, progressPercent.value) : 100; executionPhase.value = activeTask.value.state === 'COMPLETED' ? 'completed' : activeTask.value.state === 'REVIEW_REQUIRED' ? 'review' : 'failed';
      showMessage(activeTask.value.state === 'COMPLETED' ? 'JSON 回调已接收，系统数据匹配完成。' : activeTask.value.state === 'REVIEW_REQUIRED' ? 'JSON 回调已接收，部分记录需要人工确认。' : activeTask.value.errorMessage || '工作流执行失败。', activeTask.value.state === 'FAILED'); return;
    }
  }
  clearTimers(); executionPhase.value = 'failed'; showMessage('等待回调超时，可稍后在任务详情中查看结果。', true);
}
function openTaskDetail(task) { window.open(`${appEntryPath}?view=ocr&mode=detail&taskId=${encodeURIComponent(task.taskId)}`, '_blank', 'noopener,noreferrer'); }
async function loadDetailTask() { try { detailTask.value = await api.getOcrTask(detailTaskId); } catch (error) { showMessage(error.message, true); } }
function clearTimers() { clearTimeout(pollTimer); clearInterval(progressTimer); pollTimer = undefined; progressTimer = undefined; }
function showMessage(text, error = false) { message.value = text; messageIsError.value = error; }
function compactUrl(value) { return value?.length > 36 ? `${value.slice(0, 25)}…${value.slice(-8)}` : value || '—'; }
function formatDate(value) { return value ? new Date(value).toLocaleString() : '—'; }
function formatSize(bytes) { if (!bytes) return '0 B'; const units=['B','KB','MB','GB']; const index=Math.min(Math.floor(Math.log(bytes)/Math.log(1024)),3); return `${(bytes/1024**index).toFixed(index?1:0)} ${units[index]}`; }
function statusText(state) { return ({PENDING:'待处理',UPLOADING:'已上传',PROCESSING:'执行中',COMPLETED:'已完成',REVIEW_REQUIRED:'待人工确认',FAILED:'失败'})[state] || '未知'; }
function statusTone(state) { return state === 'COMPLETED' ? 'success' : state === 'FAILED' ? 'danger' : state === 'REVIEW_REQUIRED' ? 'warning' : 'processing'; }
function valueOf(record,...keys) { return keys.map((key)=>record?.[key]).find((value)=>value!==undefined&&value!==null&&value!==''); }
function money(value) { if(value===undefined||value===null||value==='') return '—'; const number=Number(value); return Number.isFinite(number)?`¥${number.toLocaleString()}`:value; }

onMounted(async () => { try { if (pageMode === 'detail') await loadDetailTask(); else { await loadPage(); if (pageMode === 'execute' && !executionWorkflow.value) showMessage('工作流不存在或已删除。', true); } } catch (error) { showMessage(error.message, true); } finally { loading.value = false; } });
onBeforeUnmount(clearTimers);
</script>

<style scoped>
.ocr-page{display:grid;gap:20px;color:#10223c}.panel-card,.toolbar-card,.metrics-grid>div{background:#fff;border:1px solid #d8e1eb;border-radius:16px;box-shadow:0 8px 26px rgba(20,42,72,.04)}.toolbar-card,.page-heading{padding:22px;display:flex;align-items:center;justify-content:space-between;gap:20px}.toolbar-card h3,.section-head h3,.page-heading h2{margin:3px 0 0}.muted{color:#687c96;margin:6px 0 0}.eyebrow{color:#087f78;font-size:12px;font-weight:800;letter-spacing:.08em;margin:0}.panel-card{padding:20px}.section-head,.modal-actions,.execute-bar,.progress-head,.result-toolbar,.detail-process{display:flex;align-items:center;justify-content:space-between;gap:14px}.table-scroll{overflow:auto;margin-top:14px}.workflow-table,.result-table{width:100%;min-width:1050px;border-collapse:collapse}.workflow-table th,.workflow-table td,.result-table th,.result-table td{padding:14px 11px;text-align:left;border-bottom:1px solid #e4eaf1;font-size:13px}.workflow-table th,.result-table th{color:#62768e;background:#f7f9fb;white-space:nowrap}.workflow-table code{display:block;max-width:220px;overflow:hidden;text-overflow:ellipsis}.operation-col{position:sticky;right:0;background:#fff;box-shadow:-8px 0 12px rgba(30,50,75,.035)}thead .operation-col{background:#f7f9fb}.row-actions{display:flex;gap:12px;white-space:nowrap}.row-actions button{border:0;background:transparent;color:#315b7b;cursor:pointer;padding:4px}.row-actions .execute-link{color:#087f78;font-weight:800}.row-actions .danger-link{color:#c23b48}.row-actions button:disabled{color:#aab4bf;cursor:not-allowed}.status-tag{display:inline-flex;padding:5px 9px;border-radius:999px;font-size:12px;white-space:nowrap}.status-tag.success{background:#e8f8ee;color:#177647}.status-tag.processing{background:#eaf3ff;color:#2764a8}.status-tag.warning{background:#fff4dc;color:#a45b05}.status-tag.danger{background:#ffe9eb;color:#b4232f}.status-tag.muted-tag{background:#eef1f4;color:#707d8b}.status-tag.large{padding:8px 12px}.empty-list{width:100%;min-height:180px;margin-top:14px;border:1px dashed #aebfd0;border-radius:13px;background:#f7fafc;display:grid;place-content:center;gap:8px;color:#5b7088;cursor:pointer}.empty-state,.empty-cell{text-align:center;color:#7c8ea3;padding:34px!important}.back-link{border:0;background:transparent;color:#087f78;padding:0;margin-bottom:14px;cursor:pointer}.workflow-info-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.workflow-info-grid>div{display:grid;gap:7px;background:#f6f8fb;padding:13px;border-radius:10px;overflow:hidden}.workflow-info-grid small{color:#6c7f96}.workflow-info-grid code{overflow:hidden;text-overflow:ellipsis}.task-name-field{max-width:650px;display:grid;gap:8px;margin:18px 0 12px;font-weight:700;font-size:13px}.task-name-field input,.form-grid input,.result-toolbar input{border:1px solid #ccd8e5;border-radius:10px;padding:11px 13px;font:inherit}.drop-zone{min-height:210px;border:1.5px dashed #b8c9dc;border-radius:14px;background:#f6f9fd;display:grid;place-items:center;align-content:center;gap:8px;text-align:center;padding:20px}.drop-zone.dragging{border-color:#0b948b;background:#ecfaf8}.drop-zone.disabled{opacity:.65}.drop-zone p{margin:0 0 8px;color:#718096}.upload-symbol{font-size:28px;color:#0b948b}.hidden-input{display:none}.selected-files{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}.file-row{display:flex;align-items:center;justify-content:space-between;background:#f5f8fb;border-radius:9px;padding:10px 12px}.file-row span{min-width:0;display:flex;gap:8px}.file-row strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.file-row small{color:#7b8da3;white-space:nowrap}.file-row button{border:0;background:transparent;font-size:18px}.progress-card{margin-top:16px;border:1px solid #cfe1e2;background:#f4fbfa;border-radius:12px;padding:15px}.progress-track{height:12px;background:#dfe8ec;border-radius:999px;overflow:hidden;margin:12px 0}.progress-fill{height:100%;background:linear-gradient(90deg,#16b9a7,#087f78);border-radius:999px;transition:width .35s}.progress-fill.failed{background:#c23b48}.progress-steps{display:flex;justify-content:space-between;color:#8b99a8;font-size:12px}.progress-steps span.active{color:#087f78;font-weight:800}.progress-card p{margin:12px 0 0;color:#536982}.execute-bar{margin-top:18px}.execute-actions{display:flex;gap:9px}.feedback{padding:11px 13px;border-radius:9px;background:#e9f8f5;color:#087f78}.feedback.error{background:#fff0f1;color:#b4232f}.modal-backdrop{position:fixed;inset:0;z-index:1000;background:rgba(16,34,60,.42);display:grid;place-items:center;padding:20px}.modal-card{width:min(680px,100%);background:#fff;border-radius:16px;padding:22px;box-shadow:0 24px 70px rgba(15,35,60,.25)}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px}.form-grid label{display:grid;gap:7px;font-size:13px;font-weight:700}.form-grid .full-field{grid-column:1/-1}.contract-note{background:#f4f8fb;color:#61758c;border-radius:9px;padding:11px;font-size:12px}.switch-label{margin-right:auto}.icon-button{border:0;background:#f1f5f8;width:32px;height:32px;border-radius:8px;font-size:21px}.confirm-card{max-width:430px;text-align:center}.confirm-card p{color:#667a92;line-height:1.65}.warning-icon{display:grid;place-items:center;width:48px;height:48px;margin:0 auto;border-radius:50%;background:#fff0e2;color:#b55c0b;font-size:24px;font-weight:900}.confirm-actions{justify-content:center;margin-top:20px}.primary-button,.secondary-button,.ghost-button,.danger-button{border-radius:10px;padding:10px 16px;font-weight:700;cursor:pointer}.primary-button{border:1px solid #0b948b;background:#0b948b;color:#fff}.secondary-button{border:1px solid #cdd9e5;background:#fff;color:#17304f}.ghost-button{border:0;background:#eef3f6;color:#536982}.danger-button{border:1px solid #c23b48;background:#c23b48;color:#fff}.primary-button:disabled,.secondary-button:disabled,.danger-button:disabled{opacity:.5;cursor:not-allowed}.process-main{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.process-main span{background:#edf2f6;color:#718096;padding:9px 14px;border-radius:8px;font-weight:700}.process-main span.done{background:#dff4f0;color:#087f78}.process-main i{font-style:normal;color:#0b948b}.metrics-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.metrics-grid>div{padding:18px;display:grid;gap:8px}.metrics-grid small{color:#667a92}.metrics-grid strong{font-size:25px}.metrics-grid .metric-text{font-size:15px}.detail-layout{display:grid;grid-template-columns:250px minmax(0,1fr);gap:14px}.history-card{align-self:start}.source-file{padding:11px 0;border-bottom:1px solid #e6ebf0;overflow:hidden;text-overflow:ellipsis}.tabs{display:flex;gap:8px}.tabs button{border:0;background:transparent;color:#087f78;padding:8px 11px}.tabs button.active{font-weight:800;border-bottom:2px solid #0b948b}.result-toolbar input{width:280px}@media(max-width:900px){.workflow-info-grid,.form-grid,.detail-layout{grid-template-columns:1fr}.form-grid .full-field{grid-column:auto}.metrics-grid{grid-template-columns:repeat(2,1fr)}.selected-files{grid-template-columns:1fr}}@media(max-width:620px){.toolbar-card,.page-heading,.execute-bar,.detail-process{align-items:flex-start;flex-direction:column}.metrics-grid{grid-template-columns:1fr}.progress-steps{gap:8px;flex-wrap:wrap}}
</style>
