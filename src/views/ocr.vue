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
                <td><button class="table-link strong-link" type="button" @click="openWorkflowHistory(workflow)">{{ workflow.name }}</button></td>
                <td>{{ workflow.description || '—' }}</td>
                <td><code :title="workflow.webhookUrl">{{ compactUrl(workflow.webhookUrl) }}</code></td>
                <td><code :title="workflow.callbackUrl">{{ compactUrl(workflow.callbackUrl) }}</code></td>
                <td><span class="status-tag" :class="workflow.enabled ? 'success' : 'muted-tag'">{{ workflow.enabled ? '已启用' : '已停用' }}</span></td>
                <td><button class="table-link count-link" type="button" @click="openWorkflowHistory(workflow)">{{ taskCountByWorkflow[workflow.id] || 0 }}</button></td>
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

    <!-- 工作流历史执行列表 -->
    <template v-else-if="pageMode === 'history'">
      <div class="page-heading">
        <div><button class="back-link" type="button" @click="goToWorkflowList">← 返回工作流列表</button><p class="eyebrow">执行历史</p><h2>{{ historyWorkflow?.name || '工作流执行历史' }}</h2><p class="muted">查看该工作流的所有历史执行信息，并可进入任务详情或删除历史记录。</p></div>
        <button class="secondary-button" type="button" @click="loadPage">刷新</button>
      </div>
      <div class="metrics-grid history-metrics"><div><small>执行总数</small><strong>{{ workflowHistoryTasks.length }}</strong></div><div><small>已完成</small><strong>{{ workflowHistoryTasks.filter((task) => task.state === 'COMPLETED').length }}</strong></div><div><small>待人工确认</small><strong>{{ workflowHistoryTasks.filter((task) => task.state === 'REVIEW_REQUIRED').length }}</strong></div><div><small>失败</small><strong>{{ workflowHistoryTasks.filter((task) => task.state === 'FAILED').length }}</strong></div></div>
      <div class="panel-card">
        <div class="section-head"><div><p class="eyebrow">历史任务</p><h3>执行记录</h3></div><span>{{ workflowHistoryTasks.length }} 条</span></div>
        <div class="table-scroll"><table class="workflow-table history-table"><thead><tr><th>任务名称</th><th>任务编号 / sessionId</th><th>文件</th><th>状态</th><th>解析 / 匹配结果</th><th>开始时间</th><th>完成时间</th><th class="operation-col">操作</th></tr></thead><tbody>
          <tr v-for="task in workflowHistoryTasks" :key="task.taskId"><td><button class="table-link strong-link" type="button" @click="openTaskDetail(task)">{{ task.taskName || '未命名任务' }}</button></td><td><code>{{ task.taskId }}</code><small class="block-muted">{{ task.sessionId || '—' }}</small></td><td><strong>{{ task.fileNames?.length || 0 }} 个文件</strong><small class="block-muted file-summary" :title="task.fileNames?.join('、')">{{ task.fileNames?.join('、') || '—' }}</small></td><td><span class="status-tag" :class="statusTone(task.state)">{{ statusText(task.state) }}</span><small v-if="task.errorMessage" class="block-error" :title="task.errorMessage">{{ task.errorMessage }}</small></td><td>{{ historyResultText(task) }}</td><td>{{ formatDate(task.startedAt || task.createdAt) }}</td><td>{{ formatDate(task.completedAt) }}</td><td class="operation-col"><div class="row-actions"><button class="execute-link" type="button" @click="openTaskDetail(task)">查看详情</button><button class="danger-link" type="button" :disabled="task.state === 'PROCESSING'" @click="taskPendingDelete = task">删除</button></div></td></tr>
          <tr v-if="!workflowHistoryTasks.length"><td colspan="8" class="empty-cell">该工作流暂无历史执行记录。</td></tr>
        </tbody></table></div>
      </div>
      <p v-if="message" class="feedback" :class="{ error: messageIsError }">{{ message }}</p>
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
        <label class="task-name-field">
          <span>本次任务名称 <small>已按当前时间自动生成，可直接修改</small></span>
          <span class="task-name-control"><input v-model="taskName" :disabled="isExecuting" placeholder="例如：202608121658" /><button class="secondary-button" type="button" :disabled="isExecuting" @click.prevent="taskName = createTimestampTaskName()">重新生成</button></span>
        </label>
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
      <div class="panel-card reconciliation-control">
        <div class="control-status-row"><div><p class="control-label">任务进度</p><div class="process-main"><span :class="{ done: detailTask }">1 上传文件</span><i>→</i><span :class="{ done: detailTask?.startedAt }">2 执行工作流</span><i>→</i><span :class="{ done: ['COMPLETED','REVIEW_REQUIRED'].includes(detailTask?.state) }">3 回调解析</span><i>→</i><span :class="{ done: detailSummary.total > 0 }">4 系统匹配</span></div></div><span class="status-tag large" :class="statusTone(detailTask?.state)">{{ statusText(detailTask?.state) }}</span></div>
        <div class="control-action-row"><div class="control-copy"><p class="control-label">匹配操作</p><span>已解析 {{ detailSummary.total }} 条 · 规则 {{ validMatchRuleCount }} 条 · 待处理 {{ rematchableCount }} 条</span></div><div class="control-buttons"><button class="secondary-button" type="button" @click="openMatchConfig">配置规则</button><button class="primary-button" type="button" :disabled="matchingRunning || !validMatchRuleCount || !rematchableCount" @click="runOcrMatching()">{{ matchingRunning ? '匹配中…' : `执行匹配（${rematchableCount}）` }}</button><button class="primary-button sync-button" type="button" :disabled="syncingMatched || !syncableMatchedCount" @click="syncMatchedToDatabase">{{ syncingMatched ? '同步中…' : `同步数据库（${syncableMatchedCount}）` }}</button><button class="secondary-button" type="button" :disabled="!unresolvedCount" @click="downloadRemainingJson">导出待确认</button></div><span class="history-count">历史 {{ matchHistory.length }} 次</span></div>
      </div>
      <div class="metrics-grid detail-metrics"><div><small>合计</small><strong>{{ detailSummary.total }}</strong></div><div><small>自动匹配</small><strong>{{ detailSummary.autoMatched || 0 }}</strong></div><div><small>手工匹配</small><strong>{{ detailSummary.manualMatched || 0 }}</strong></div><div><small>已同步数据库</small><strong>{{ syncedMatchedCount }}</strong></div><div><small>手工同步</small><strong>{{ detailSummary.manualSync || 0 }}</strong></div><div><small>不适用（支出）</small><strong>{{ detailSummary.notApplicable || 0 }}</strong></div><div><small>待人工确认</small><strong>{{ detailSummary.unmatched }}</strong></div><div><small>文件数量</small><strong>{{ detailTask?.fileNames?.length || 0 }}</strong></div></div>
      <div class="detail-layout">
        <div class="panel-card result-panel">
          <div class="source-files-inline"><strong>原始文件</strong><span class="source-file-count">{{ detailTask?.fileNames?.length || 0 }}</span><span v-for="name in detailTask?.fileNames || []" :key="name" class="source-file-chip">▧ {{ name }}</span></div>
          <div class="result-toolbar"><div class="tabs"><button :class="{ active: resultFilter === 'ALL' }" @click="resultFilter = 'ALL'">全部</button><button :class="{ active: resultFilter === 'MATCHED' }" @click="resultFilter = 'MATCHED'">已匹配</button><button :class="{ active: resultFilter === 'MANUAL_SYNC' }" @click="resultFilter = 'MANUAL_SYNC'">手工同步</button><button :class="{ active: resultFilter === 'NOT_APPLICABLE' }" @click="resultFilter = 'NOT_APPLICABLE'">不适用</button><button :class="{ active: resultFilter === 'UNMATCHED' }" @click="resultFilter = 'UNMATCHED'">待确认</button></div><input v-model="searchKeyword" type="search" placeholder="搜索摘要、租客、业主、房间" /></div>
          <div class="table-scroll"><table class="result-table detail-result-table"><thead><tr><th>序号</th><th>原始文件</th><th>单据类型</th><th>单据日期</th><th>实际月份</th><th>摘要 / 对方</th><th>收支方向</th><th>金额</th><th>系统侧数据</th><th>匹配度</th><th>匹配状态</th><th>匹配说明</th><th class="operation-col">操作</th></tr></thead><tbody>
            <tr v-for="(record, index) in visibleRecords" :key="record._recordId || index"><td>{{ valueOf(record, 'sequenceNo', 'record_no') || index + 1 }}</td><td>{{ valueOf(record, 'sourceFileName', 'original_file_name', 'source_file_name', 'fileName') || detailTask?.fileNames?.[0] || '—' }}</td><td>{{ valueOf(record, 'fileType', 'document_type') || '—' }}</td><td>{{ valueOf(record, 'date', 'transactionDate') || '—' }}</td><td><input class="actual-month-input" type="month" :value="record.actualMonth || record.actual_month || ''" :disabled="savingActualMonthId === record._recordId || !!record.systemMatch?.syncedTransactionId" @change="saveActualMonth(record, $event.target.value)" /><small v-if="record.paymentMonth || record.target_month" class="month-hint">识别：{{ record.paymentMonth || record.target_month }}</small></td><td>{{ valueOf(record, 'contentSummary', 'counterparty', 'summary', 'inflow_party', 'outflow_party', 'contractorName', 'tenant_name') || '—' }}</td><td>{{ valueOf(record, 'type', 'transactionCategory', 'money_direction', 'transaction_type') || '—' }}</td><td>{{ money(valueOf(record, 'statisticalAmount', 'fileAmount', 'net_amount', 'document_amount', 'amount')) }}</td><td><div class="system-data-cell"><strong>{{ record.systemMatch?.propertyName || '—' }} {{ record.systemMatch?.roomNumber || '' }}</strong><small>{{ record.systemMatch?.tenantName || record.systemMatch?.bankStatementSummary || record.systemMatch?.contractNumber || '—' }}</small></div></td><td><span v-if="record.systemMatch?.matchScore !== undefined" class="match-score" :class="matchScoreTone(record.systemMatch?.matchScore)">{{ matchScoreText(record.systemMatch?.matchScore) }}</span><span v-else>—</span></td><td><span class="status-tag" :class="matchStatusTone(record)">{{ matchStatusText(record) }}</span></td><td>{{ record.systemMatch?.reason || '—' }}</td><td class="operation-col"><div class="row-actions"><button v-if="!record.systemMatch?.syncedTransactionId && !['MATCHED','MANUAL_SYNC','NOT_APPLICABLE'].includes(record.systemMatch?.status) && validMatchRuleCount" type="button" @click="runOcrMatching([record._recordId])">单独再匹配</button><button v-if="!record.systemMatch?.syncedTransactionId && record.systemMatch?.status !== 'NOT_APPLICABLE'" type="button" class="execute-link" @click="openMatchDialog(record)">{{ record.systemMatch?.status === 'MATCHED' ? '重新匹配' : '手工匹配' }}</button><button type="button" @click="jsonDetailRecord = record">JSON 详情</button><button v-if="!record.systemMatch?.syncedTransactionId && !['MANUAL_SYNC','NOT_APPLICABLE'].includes(record.systemMatch?.status)" type="button" class="manual-sync-link" @click="markManualSync(record)">手工同步</button></div></td></tr><tr v-if="!visibleRecords.length"><td colspan="13" class="empty-cell">暂无符合条件的数据。</td></tr>
          </tbody></table></div>
        </div>
      </div>
      <p v-if="detailTask?.errorMessage" class="feedback error">{{ detailTask.errorMessage }}</p>
      <p v-if="message" class="feedback" :class="{ error: messageIsError }">{{ message }}</p>
    </template>

    <!-- OCR 匹配字段配置：布局与银行账单对账一致 -->
    <div v-if="matchConfigOpen" class="modal-backdrop" @click.self="matchConfigOpen = false">
      <div class="modal-card match-config-dialog" role="dialog" aria-modal="true" aria-labelledby="match-config-title">
        <div class="section-head"><div><p class="eyebrow">AI 对账规则</p><h3 id="match-config-title">选择匹配字段</h3><p class="muted">每条规则的左右字段均可多选，任意一组字段匹配即视为该规则命中；第二条规则起可单独选择与上一条规则的 AND / OR 关系。</p></div><button class="icon-button" type="button" @click="matchConfigOpen = false">×</button></div>
        <div class="rule-template-bar"><div class="template-picker"><label>选择已保存规则</label><select v-model="selectedMatchTemplateId"><option value="">请选择规则</option><option v-for="template in matchRuleTemplates" :key="template.id" :value="template.id">{{ template.name }}</option></select><button class="secondary-button" type="button" :disabled="!selectedMatchTemplateId" @click="loadSelectedMatchTemplate">加载</button><button class="ghost-button danger-text" type="button" :disabled="!selectedMatchTemplateId" @click="deleteSelectedMatchTemplate">删除</button></div><div class="template-save"><label>保存当前规则</label><input v-model="matchTemplateName" maxlength="80" placeholder="例如：月度租金匹配" /><button class="secondary-button" type="button" :disabled="savingMatchTemplate || !hasValidDraftMatchRule || !matchTemplateName.trim()" @click="saveCurrentMatchTemplate">{{ savingMatchTemplate ? '保存中…' : '保存规则' }}</button></div></div>
        <div class="mapping-layout">
          <aside class="mapping-fields"><h4>内部系统字段 <small>{{ systemMatchFields.length }} 项</small></h4><input v-model="systemFieldSearch" class="mapping-search" type="search" placeholder="搜索物件、房间、契约字段" /><div v-for="field in filteredSystemMatchFields" :key="field.key" class="mapping-field-card"><small>{{ field.group }}</small><strong>{{ field.label }}</strong><code>{{ field.key }}</code></div></aside>
          <main class="mapping-workspace"><div class="mapping-toolbar"><div><h4>匹配规则工作区</h4><small>规则内多选字段按“任一命中”；规则之间按各自 AND / OR 连接。</small></div><button class="ghost-button" type="button" @click="applyRecommendedRentRules">应用收租推荐规则</button><button class="secondary-button" type="button" @click="addMatchRule">＋ 添加规则</button></div>
            <div v-for="(rule, index) in draftMatchConfiguration.rules" :key="rule.id" class="mapping-rule-wrap">
              <div class="rule-connector"><span v-if="index === 0">首条规则</span><label v-else>与上一条 <select v-model="rule.logicalOperator"><option value="AND">AND（且）</option><option value="OR">OR（或）</option></select></label></div>
              <div class="mapping-rule"><b>{{ index + 1 }}</b>
                <details class="multi-field-select"><summary>{{ selectedSystemFieldSummary(rule.systemFields) }}</summary><div class="multi-field-menu"><label v-for="field in systemMatchFields" :key="field.key"><input v-model="rule.systemFields" type="checkbox" :value="field.key" /><span><small>{{ field.group }}</small><strong>{{ field.label }}</strong><code>{{ field.key }}</code></span></label></div></details>
                <div class="rule-operator"><select v-model="rule.operator"><option v-for="operator in matchOperators" :key="operator.key" :value="operator.key">{{ operator.label }}</option></select><label v-if="rule.operator === 'similar'">最低 <input v-model.number="rule.minScore" type="number" min="70" max="100" />%</label></div>
                <details class="multi-field-select"><summary>{{ selectedSourceFieldSummary(rule.sourceFields) }}</summary><div class="multi-field-menu source-menu"><label v-for="field in sourceMatchFields" :key="field.key"><input v-model="rule.sourceFields" type="checkbox" :value="field.key" /><span><strong>{{ field.key }}</strong><small>{{ field.type }} · 非空 {{ field.count }}</small></span></label></div></details>
                <label class="required-rule"><input v-model="rule.required" type="checkbox" /> 至少一项必需</label><button class="rule-delete" type="button" @click="removeMatchRule(index)">删除</button>
              </div>
            </div>
            <button v-if="!draftMatchConfiguration.rules.length" class="empty-rule" type="button" @click="addMatchRule">＋ 添加第一条匹配规则</button>
          </main>
          <aside class="mapping-fields source-fields"><h4>Make 回调 JSON 字段 <small>{{ sourceMatchFields.length }} 项</small></h4><input v-model="sourceFieldSearch" class="mapping-search" type="search" placeholder="搜索回调字段" /><div v-for="field in filteredSourceMatchFields" :key="field.key" class="mapping-field-card"><span><strong>{{ field.key }}</strong><em>{{ field.type }}</em></span><small>非空 {{ field.count }} · {{ field.sample.join(' / ') || '无示例' }}</small></div></aside>
        </div>
        <p v-if="!hasValidDraftMatchRule" class="configuration-warning">执行匹配前，请至少建立一条左右两侧均已选择字段的有效规则。</p>
        <div class="modal-actions"><button class="ghost-button" type="button" @click="matchConfigOpen = false">取消</button><button class="secondary-button" type="button" :disabled="savingMatchConfig || !hasValidDraftMatchRule" @click="saveMatchConfiguration(false)">{{ savingMatchConfig ? '保存中…' : '仅保存到当前任务' }}</button><button class="primary-button" type="button" :disabled="savingMatchConfig || matchingRunning || !hasValidDraftMatchRule || !rematchableCount" @click="saveMatchConfiguration(true)">{{ matchingRunning ? '执行中…' : '保存并执行匹配' }}</button></div>
      </div>
    </div>

    <div v-if="jsonDetailRecord" class="modal-backdrop" @click.self="jsonDetailRecord = null"><div class="modal-card json-detail-dialog"><div class="section-head"><div><p class="eyebrow">格式化回调记录</p><h3>JSON 详情</h3></div><button class="icon-button" type="button" @click="jsonDetailRecord = null">×</button></div><pre>{{ JSON.stringify(jsonDetailRecord, null, 2) }}</pre></div></div>

    <!-- OCR 明细手工匹配 -->
    <div v-if="reviewingRecord" class="modal-backdrop" @click.self="closeMatchDialog">
      <div class="modal-card match-dialog" role="dialog" aria-modal="true" aria-labelledby="match-dialog-title">
        <div class="section-head"><div><p class="eyebrow">手工匹配系统数据</p><h3 id="match-dialog-title">核对入金与系统合同</h3><p class="muted">可选择一个或多个物件；金额差额会醒目提示，但不影响人工确认。</p></div><button class="icon-button" type="button" @click="closeMatchDialog">×</button></div>
        <div class="record-preview"><div><small>银行流水摘要</small><strong>{{ sourceRecordSummary(reviewingRecord) }}</strong></div><div><small>交易日期</small><span>{{ valueOf(reviewingRecord, 'date', 'transactionDate') || '—' }}</span></div><div><small>收支 / 金额</small><span>{{ valueOf(reviewingRecord, 'type', 'transactionCategory') || '—' }} · {{ money(sourceRecordAmount(reviewingRecord)) }}</span></div><div><small>当前匹配度</small><span class="match-score" :class="matchScoreTone(reviewingRecord.systemMatch?.matchScore)">{{ matchScoreText(reviewingRecord.systemMatch?.matchScore) }}</span></div></div>
        <div class="active-rule-panel"><div class="rule-panel-title"><strong>本任务匹配规则</strong><small>候选项将按以下字段逐项展示</small></div><div class="active-rule-list"><div v-for="(rule, index) in matchConfiguration.rules" :key="rule.id" class="active-rule-item"><b>{{ index + 1 }}</b><span><strong>{{ rule.systemFields.map(systemFieldLabel).join(' / ') }}</strong><small>{{ operatorLabel(rule.operator) }} ← {{ rule.sourceFields.join(' / ') }}</small></span><em>{{ rule.sourceFields.map((field) => displayRuleValue(reviewingRecord, field)).filter(Boolean).join(' / ') || '源字段无值' }}</em></div></div></div>
        <div class="candidate-tools"><div><strong>选择系统合同</strong><small>共 {{ matchCandidates.length }} 条候选，可勾选一条或多条</small></div><div class="candidate-search"><input v-model="candidateSearch" type="search" placeholder="搜索合同号、物件、房间、租客或银行摘要" @keyup.enter="loadMatchCandidates" /><button class="secondary-button" type="button" :disabled="loadingCandidates" @click="loadMatchCandidates">{{ loadingCandidates ? '搜索中…' : '搜索' }}</button></div></div>
        <div class="candidate-list">
          <label v-for="candidate in matchCandidates" :key="candidate.id" class="candidate-row" :class="{ selected: selectedContractIds.includes(candidate.id) }"><span class="candidate-check"><input v-model="selectedContractIds" type="checkbox" :value="candidate.id" /><i aria-hidden="true">✓</i></span><span class="candidate-main"><span class="candidate-heading"><strong>{{ candidate.propertyName }} <em>{{ candidate.roomNumber || '无房间号' }}</em></strong><b>{{ money(candidate.expectedAmount) }}</b></span><small class="candidate-meta">合同 {{ candidate.contractNumber || '未填写' }}<i></i>{{ candidate.tenantName || candidate.contractorName || candidate.payerName || '无租客信息' }}</small><span class="candidate-rule-grid"><span v-for="rule in matchConfiguration.rules" :key="rule.id"><small>{{ rule.systemFields.map(systemFieldLabel).join(' / ') }}</small><b>{{ candidateRuleValue(candidate, rule) }}</b></span></span></span><span class="candidate-score"><small>匹配度</small><strong class="match-score" :class="matchScoreTone(candidate.matchScore)">{{ matchScoreText(candidate.matchScore) }}</strong><small>{{ candidateMatchFieldLabel(candidate.matchedField) }}</small></span></label>
          <div v-if="!loadingCandidates && !matchCandidates.length" class="empty-cell">未找到系统侧合同，可调整关键词或标记为手工同步。</div>
        </div>
        <div class="selection-summary"><span>已选 <strong>{{ selectedContractIds.length }}</strong> 个物件</span><span>合同合计 <strong>{{ money(selectedExpectedAmount) }}</strong></span><span>入金金额 <strong>{{ money(reviewingSourceAmount) }}</strong></span><span :class="selectionDifference === 0 ? 'amount-balanced' : 'amount-unbalanced'">差额 <strong>{{ money(selectionDifference) }}</strong><small v-if="selectedContractIds.length > 1 && selectionDifference !== 0">金额不一致，请确认后再提交</small></span></div>
        <div class="modal-actions"><button class="ghost-button manual-sync-button" type="button" :disabled="savingReview" @click="markManualSync(reviewingRecord)">标记为无法匹配</button><button class="ghost-button" type="button" :disabled="savingReview" @click="closeMatchDialog">取消</button><button class="primary-button" type="button" :disabled="savingReview || !canConfirmManualMatch" @click="confirmManualMatch">{{ savingReview ? '保存中…' : `确认匹配（${selectedContractIds.length}）` }}</button></div>
      </div>
    </div>

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
        <p class="contract-note">Webhook 接收：taskId、sessionId、taskName、callbackUrl，以及重复的 requestFile 文件字段。</p>
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

    <div v-if="taskPendingDelete" class="modal-backdrop" @click.self="taskPendingDelete = null">
      <div class="modal-card confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="delete-task-dialog-title">
        <div class="warning-icon">!</div><h3 id="delete-task-dialog-title">确认删除历史执行记录？</h3>
        <p>即将删除“{{ taskPendingDelete.taskName || taskPendingDelete.taskId }}”及其解析、匹配结果和已上传文件。该操作无法恢复。</p>
        <div class="modal-actions confirm-actions"><button class="ghost-button" type="button" @click="taskPendingDelete = null">取消</button><button class="danger-button" type="button" :disabled="deletingTask" @click="confirmTaskDelete">{{ deletingTask ? '删除中…' : '确认删除' }}</button></div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { API_BASE, api } from '../services/api';
import { requestConfirm } from '../services/confirm';
import { APP_ENTRY_PATH as appEntryPath } from '../utils/appPath';

const path = window.location.pathname;
const routeQuery = new URLSearchParams(window.location.search);
// Query-based child pages work even when Nginx only exposes the base OCR SPA route.
// Keep parsing legacy deep links so direct NestJS deployments remain compatible.
const executionWorkflowId = routeQuery.get('mode') === 'execute'
  ? routeQuery.get('workflowId') || ''
  : decodeURIComponent(path.match(/^\/ai-reconciliation\/ocr\/workflows\/([^/]+)\/execute/)?.[1] || '');
const detailTaskId = routeQuery.get('mode') === 'detail'
  ? routeQuery.get('taskId') || ''
  : decodeURIComponent(path.match(/^\/ai-reconciliation\/ocr\/tasks\/([^/]+)/)?.[1] || '');
const historyWorkflowId = routeQuery.get('mode') === 'history' ? routeQuery.get('workflowId') || '' : '';
const pageMode = detailTaskId ? 'detail' : executionWorkflowId ? 'execute' : historyWorkflowId ? 'history' : 'list';
const workflows = ref([]), tasks = ref([]), selectedFiles = ref([]), detailTask = ref(null), activeTask = ref(null);
const loading = ref(true), workflowEditorOpen = ref(false), savingWorkflow = ref(false), deletingWorkflow = ref(false), deletingTask = ref(false), submitting = ref(false), isDragging = ref(false);
const editingWorkflowId = ref(''), workflowPendingDelete = ref(null), taskPendingDelete = ref(null), taskName = ref(createTimestampTaskName()), fileInput = ref(null), message = ref(''), messageIsError = ref(false);
const executionPhase = ref('idle'), progressPercent = ref(0), resultFilter = ref('ALL'), searchKeyword = ref('');
const reviewingRecord = ref(null), matchCandidates = ref([]), candidateSearch = ref(''), selectedContractIds = ref([]);
const loadingCandidates = ref(false), savingReview = ref(false);
const matchConfigOpen = ref(false), matchConfiguration = ref({ version:2, rules:[] }), draftMatchConfiguration = ref({ version:2, rules:[] });
const savingMatchConfig = ref(false), matchingRunning = ref(false), savingActualMonthId = ref(''), jsonDetailRecord = ref(null);
const matchRuleTemplates = ref([]), selectedMatchTemplateId = ref(''), matchTemplateName = ref('');
const savingMatchTemplate = ref(false), syncingMatched = ref(false);
const systemFieldSearch = ref(''), sourceFieldSearch = ref('');
let pollTimer, progressTimer, messageTimer;
const availableMatchFields = [
  { key:'partyName', label:'对方名称', help:'入金方/出金方 ↔ 租客、付款人或契约者' },
  { key:'summary', label:'银行摘要', help:'OCR 摘要 ↔ 合同银行摘要/入金名义' },
  { key:'propertyName', label:'物件名称', help:'OCR 物件名称 ↔ 系统物件名称' },
  { key:'roomNumber', label:'房间号', help:'OCR 房间号 ↔ 系统房间号' },
  { key:'contractNumber', label:'合同编号', help:'OCR 合同编号 ↔ 系统合同编号' },
  { key:'amount', label:'金额', help:'OCR 金额 ↔ 合同月租金额' },
  { key:'date', label:'日期', help:'交易日期须在合同有效期内' },
];
const systemMatchFields = [
  { key:'property.propertyCode', label:'物件编号', group:'物件' }, { key:'property.name', label:'物件名称', group:'物件' },
  { key:'property.nameKana', label:'物件名称假名', group:'物件' }, { key:'property.postalCode', label:'邮政编码', group:'物件' },
  { key:'property.address', label:'地址', group:'物件' }, { key:'property.ward', label:'区', group:'物件' },
  { key:'property.city', label:'城市', group:'物件' }, { key:'property.prefecture', label:'都道府县', group:'物件' },
  { key:'property.buildingType', label:'建筑类型', group:'物件' }, { key:'property.usageType', label:'用途类型', group:'物件' },
  { key:'property.currentOwnerSummary', label:'当前业主摘要', group:'物件' }, { key:'property.remark', label:'物件备注', group:'物件' },
  { key:'room.roomCode', label:'房间编号', group:'房间' }, { key:'room.houseNumber', label:'房屋编号', group:'房间' },
  { key:'room.roomNumber', label:'房间号', group:'房间' }, { key:'room.displayName', label:'房间显示名', group:'房间' },
  { key:'room.unitType', label:'单元类型', group:'房间' }, { key:'room.floorLabel', label:'楼层', group:'房间' },
  { key:'room.usageType', label:'房间用途', group:'房间' }, { key:'room.currentOwnerSummary', label:'房间业主摘要', group:'房间' },
  { key:'room.remark', label:'房间备注', group:'房间' },
  { key:'contract.contractNumber', label:'合同编号', group:'契约' }, { key:'contract.externalContractId', label:'外部契约ID', group:'契约' },
  { key:'contract.contractorName', label:'契约者', group:'契约' }, { key:'contract.contractorNameKana', label:'契约者假名', group:'契约' },
  { key:'contract.contractorType', label:'契约者类型', group:'契约' }, { key:'contract.payerName', label:'支付人', group:'契约' },
  { key:'contract.payerNameKana', label:'支付人假名', group:'契约' }, { key:'contract.bankStatementSummary', label:'银行账单摘要', group:'契约' },
  { key:'contract.bankSummaryName', label:'入金名义', group:'契约' }, { key:'contract.startDate', label:'契约开始日', group:'契约' },
  { key:'contract.endDate', label:'契约结束日', group:'契约' }, { key:'contract.validDate', label:'契约有效日期', group:'契约' },
  { key:'contract.paymentMethod', label:'支付方式', group:'契约' }, { key:'contract.paymentMonthType', label:'支付月份类型', group:'契约' },
  { key:'contract.monthlyRent', label:'月租金额', group:'契约' }, { key:'contract.monthlyPaymentTotal', label:'每月应收合计', group:'契约' }, { key:'contract.managementFee', label:'管理费', group:'契约' },
  { key:'contract.deposit', label:'押金', group:'契约' }, { key:'contract.keyMoney', label:'礼金', group:'契约' },
  { key:'contract.guaranteeDeposit', label:'保证金', group:'契约' }, { key:'contract.guaranteeFee', label:'保证费', group:'契约' },
  { key:'contract.guaranteeCompanyName', label:'保证公司', group:'契约' }, { key:'contract.guaranteeCompanyNameKana', label:'保证公司假名', group:'契约' },
  { key:'contract.keyReplacementFee', label:'换锁费', group:'契约' }, { key:'contract.renewalAdministrativeFee', label:'更新事务手续费', group:'契约' },
  { key:'contract.insuranceName', label:'保险名称', group:'契约' }, { key:'contract.insuranceFee', label:'保险费', group:'契约' },
  { key:'contract.insurancePeriod', label:'保险期间', group:'契约' }, { key:'contract.insuranceStartDate', label:'保险开始日', group:'契约' },
  { key:'contract.insuranceEndDate', label:'保险结束日', group:'契约' }, { key:'contract.collectionAccount', label:'收租账户', group:'契约' },
  { key:'contract.managementContractType', label:'管理委托契约方式', group:'契约' }, { key:'contract.remark', label:'契约备注', group:'契约' },
  { key:'tenant.customerCode', label:'租客编号', group:'租客' }, { key:'tenant.name', label:'租客名称', group:'租客' },
  { key:'tenant.nameKana', label:'租客名称假名', group:'租客' }, { key:'tenant.phone', label:'租客电话', group:'租客' },
  { key:'tenant.email', label:'租客邮箱', group:'租客' },
];
const matchOperators = [{key:'equals',label:'等于'}, {key:'similar',label:'假名相似（容错）'}, {key:'contains',label:'包含'}, {key:'normalized_equals',label:'标准化后等于'}, {key:'within_date_range',label:'在有效期内'}];
const workflowForm = reactive({ name: '', description: '', webhookUrl: '', callbackUrl: '', enabled: true });
const executionWorkflow = computed(() => workflows.value.find((item) => item.id === executionWorkflowId) || null);
const historyWorkflow = computed(() => workflows.value.find((item) => item.id === historyWorkflowId) || null);
const workflowHistoryTasks = computed(() => tasks.value.filter((task) => task.workflowId === historyWorkflowId));
const taskCountByWorkflow = computed(() => tasks.value.reduce((counts, task) => ({ ...counts, [task.workflowId]: (counts[task.workflowId] || 0) + 1 }), {}));
const isExecuting = computed(() => ['uploading','dispatching','waiting'].includes(executionPhase.value));
const canExecute = computed(() => executionWorkflow.value?.enabled && selectedFiles.value.length && taskName.value.trim());
const progressTitle = computed(() => ({ uploading:'正在上传文件', dispatching:'文件已上传，正在调用 Webhook', waiting:'Webhook 已接收，等待 JSON 回调', completed:'工作流执行完成', review:'回调完成，需要人工确认', failed:'工作流执行失败' })[executionPhase.value] || '准备执行');
const detailRecords = computed(() => detailTask.value?.resultJson?.records || detailTask.value?.matchedResultJson?.records || []);
const detailSummary = computed(() => detailTask.value?.resultJson?.summary || summarizeRecords(detailRecords.value));
const unresolvedRecords = computed(() => detailRecords.value.filter((record) => !['MATCHED','MANUAL_SYNC','NOT_APPLICABLE'].includes(record.systemMatch?.status)));
const unresolvedCount = computed(() => unresolvedRecords.value.length);
const rematchableRecords = computed(() => detailRecords.value.filter((record) => !record.systemMatch?.syncedTransactionId && record.systemMatch?.status !== 'MANUAL_SYNC' && record.systemMatch?.matchMode !== 'MANUAL'));
const rematchableCount = computed(() => rematchableRecords.value.length);
const syncableMatchedCount = computed(() => detailRecords.value.filter((record) => record.systemMatch?.status === 'MATCHED' && !record.systemMatch?.syncedTransactionId).length);
const syncedMatchedCount = computed(() => detailRecords.value.filter((record) => !!record.systemMatch?.syncedTransactionId).length);
const matchHistory = computed(() => detailTask.value?.resultJson?.matchHistory || []);
const visibleRecords = computed(() => { const query = searchKeyword.value.trim().toLowerCase(); return detailRecords.value.filter((record) => { const status = record.systemMatch?.status; const matchesFilter = resultFilter.value === 'ALL' || (resultFilter.value === 'MATCHED' ? status === 'MATCHED' : resultFilter.value === 'MANUAL_SYNC' ? status === 'MANUAL_SYNC' : resultFilter.value === 'NOT_APPLICABLE' ? status === 'NOT_APPLICABLE' : !['MATCHED','MANUAL_SYNC','NOT_APPLICABLE'].includes(status)); return matchesFilter && (!query || JSON.stringify(record).toLowerCase().includes(query)); }); });
const sourceMatchFields = computed(() => {
  const ignored = new Set(['_recordId','systemMatch','details','amount_components']);
  const keys = [...new Set(detailRecords.value.flatMap((record) => Object.keys(record || {})))].filter((key) => !ignored.has(key));
  return keys.map((key) => {
    const values = detailRecords.value.map((record) => record?.[key]).filter((value) => value !== undefined && value !== null && value !== '');
    const sample = values.slice(0, 3).map((value) => typeof value === 'object' ? JSON.stringify(value) : String(value));
    return { key, type: values[0] === undefined ? 'unknown' : Array.isArray(values[0]) ? 'array' : typeof values[0], count: values.length, sample };
  });
});
const filteredSystemMatchFields = computed(() => { const query=systemFieldSearch.value.trim().toLowerCase(); return query ? systemMatchFields.filter((field)=>`${field.group} ${field.label} ${field.key}`.toLowerCase().includes(query)) : systemMatchFields; });
const filteredSourceMatchFields = computed(() => { const query=sourceFieldSearch.value.trim().toLowerCase(); return query ? sourceMatchFields.value.filter((field)=>field.key.toLowerCase().includes(query)) : sourceMatchFields.value; });
const isValidMatchRule = (rule) => Array.isArray(rule?.systemFields) && rule.systemFields.length > 0 && Array.isArray(rule?.sourceFields) && rule.sourceFields.length > 0;
const validMatchRuleCount = computed(() => matchConfiguration.value.rules.filter(isValidMatchRule).length);
const hasValidDraftMatchRule = computed(() => draftMatchConfiguration.value.rules.some(isValidMatchRule));
const selectedCandidates = computed(() => matchCandidates.value.filter((candidate) => selectedContractIds.value.includes(candidate.id)));
const selectedExpectedAmount = computed(() => selectedCandidates.value.reduce((total, candidate) => total + Number(candidate.expectedAmount || 0), 0));
const reviewingSourceAmount = computed(() => Math.abs(Number(String(sourceRecordAmount(reviewingRecord.value) || 0).replace(/[,￥¥\s]/g, ''))) || 0);
const selectionDifference = computed(() => Math.round((reviewingSourceAmount.value - selectedExpectedAmount.value) * 100) / 100);
const canConfirmManualMatch = computed(() => selectedContractIds.value.length > 0);

function beginCreateWorkflow() { editingWorkflowId.value = ''; Object.assign(workflowForm, { name:'', description:'', webhookUrl:'', callbackUrl:`${window.location.origin}${API_BASE}/ocr/callback`, enabled:true }); workflowEditorOpen.value = true; }
function createTimestampTaskName(date = new Date()) { const pad = (value) => String(value).padStart(2, '0'); return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}`; }
function editWorkflow(item) { editingWorkflowId.value = item.id; Object.assign(workflowForm, { name:item.name, description:item.description || '', webhookUrl:item.webhookUrl, callbackUrl:item.callbackUrl, enabled:item.enabled }); workflowEditorOpen.value = true; }
async function saveWorkflow() { if (!workflowForm.name.trim() || !workflowForm.webhookUrl.trim() || !workflowForm.callbackUrl.trim()) return showMessage('请完整填写工作流名称、Webhook 和回调地址。', true); savingWorkflow.value = true; try { await api.saveOcrWorkflow({ ...workflowForm }, editingWorkflowId.value); workflowEditorOpen.value = false; await loadPage(); showMessage('工作流配置已保存。'); } catch (error) { showMessage(error.message, true); } finally { savingWorkflow.value = false; } }
function requestDelete(item) { workflowPendingDelete.value = item; }
async function confirmDelete() { deletingWorkflow.value = true; try { await api.deleteOcrWorkflow(workflowPendingDelete.value.id); workflowPendingDelete.value = null; await loadPage(); showMessage('工作流已删除，历史任务仍保留。'); } catch (error) { showMessage(error.message, true); } finally { deletingWorkflow.value = false; } }
function openExecution(item) { window.open(`${appEntryPath}?view=ocr&mode=execute&workflowId=${encodeURIComponent(item.id)}`, '_blank', 'noopener,noreferrer'); }
function openWorkflowHistory(item) { window.location.href = `${appEntryPath}?view=ocr&mode=history&workflowId=${encodeURIComponent(item.id)}`; }
function goToWorkflowList() { window.location.href = `${appEntryPath}?view=ocr`; }
async function loadPage() { [workflows.value, tasks.value] = await Promise.all([api.listOcrWorkflows(), api.listOcrTasks(pageMode === 'history' ? historyWorkflowId : '')]); }
function historyResultText(task) { const summary=task.resultSummary || task.resultJson?.summary || task.matchedResultJson?.summary; if (!summary) return task.state === 'FAILED' ? '执行失败' : '暂无回调结果'; return `共 ${summary.total || 0} 条 / 已匹配 ${summary.matched || 0} 条 / 待处理 ${summary.unmatched || 0} 条`; }
async function confirmTaskDelete() { if (!taskPendingDelete.value) return; deletingTask.value=true; try { await api.deleteOcrTask(taskPendingDelete.value.taskId); taskPendingDelete.value=null; await loadPage(); showMessage('历史执行记录已删除。'); } catch(error) { showMessage(error.message,true); } finally { deletingTask.value=false; } }
function handleFileSelection(event) { selectedFiles.value.push(...Array.from(event.target.files || [])); event.target.value = ''; }
function handleDrop(event) { isDragging.value = false; if (!isExecuting.value) selectedFiles.value.push(...Array.from(event.dataTransfer?.files || [])); }
async function executeWorkflow() {
  submitting.value = true; clearMessage(); executionPhase.value = 'uploading'; progressPercent.value = 1;
  try {
    const form = new FormData(); form.append('workflowId', executionWorkflowId); form.append('taskName', taskName.value.trim()); selectedFiles.value.forEach((file) => form.append('files', file, file.name));
    activeTask.value = await api.uploadOcrTaskWithProgress(form, (percent) => { progressPercent.value = Math.max(progressPercent.value, percent * .58); });
    executionPhase.value = 'dispatching'; progressPercent.value = 62;
    await api.startOcrTask(activeTask.value.taskId, {
      taskId: activeTask.value.taskId,
      sessionId: activeTask.value.sessionId,
      fileCount: selectedFiles.value.length,
      fileNames: selectedFiles.value.map((file) => file.name),
      totalBytes: selectedFiles.value.reduce((sum, file) => sum + file.size, 0),
    });
    executionPhase.value = 'waiting'; progressPercent.value = 72;
    progressTimer = setInterval(() => { if (progressPercent.value < 92) progressPercent.value += 1; }, 1200);
    await pollExecution(activeTask.value.taskId);
  } catch (error) { clearTimers(); executionPhase.value = 'failed'; showMessage(error.message, true); }
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
async function loadDetailTask() { try { detailTask.value = await api.getOcrTask(detailTaskId); matchConfiguration.value = normalizeMatchConfiguration(detailTask.value?.resultJson?.matchConfig); } catch (error) { showMessage(error.message, true); } }
function cloneConfiguration(configuration) { return JSON.parse(JSON.stringify(configuration || { version:2, rules:[] })); }
function normalizeMatchConfiguration(configuration) {
  const legacy={partyName:['contract.payerName','counterparty'],summary:['contract.bankStatementSummary','contentSummary'],propertyName:['property.name','propertyName'],roomNumber:['room.roomNumber','roomNumber'],contractNumber:['contract.contractNumber','contractNumber'],amount:['contract.monthlyRent','statisticalAmount'],date:['contract.validDate','date']};
  const globalOperator=configuration?.logicalOperator === 'OR' ? 'OR' : 'AND';
  const rawRules=configuration?.rules || (configuration?.fields || []).map((field,index)=>({id:`legacy-${index}`,...(legacy[field] ? {systemField:legacy[field][0],sourceField:legacy[field][1]} : {})}));
  return { version:2, rules:rawRules.map((rule,index)=>({
    id:rule.id || `rule-${index + 1}`,
    systemFields:[...new Set((Array.isArray(rule.systemFields) ? rule.systemFields : [rule.systemField]).filter(Boolean))],
    sourceFields:[...new Set((Array.isArray(rule.sourceFields) ? rule.sourceFields : [rule.sourceField]).filter(Boolean))],
    operator:rule.operator || 'equals', minScore:Math.max(70,Math.min(100,Number(rule.minScore) || 80)), required:rule.required !== false,
    logicalOperator:index === 0 ? 'AND' : (rule.logicalOperator === 'OR' ? 'OR' : globalOperator),
  })).filter((rule)=>rule.systemFields.length || rule.sourceFields.length) };
}
async function openMatchConfig() { draftMatchConfiguration.value = normalizeMatchConfiguration(matchConfiguration.value); systemFieldSearch.value=''; sourceFieldSearch.value=''; selectedMatchTemplateId.value=''; matchTemplateName.value=''; if (!draftMatchConfiguration.value.rules.length) addMatchRule(); matchConfigOpen.value = true; try { matchRuleTemplates.value = await api.listOcrMatchRuleTemplates(); } catch (error) { showMessage(`已打开规则配置，但读取已保存规则失败：${error.message}`, true); } }
function addMatchRule() { draftMatchConfiguration.value.rules.push({ id:`rule-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, systemFields:[], sourceFields:[], operator:'equals', minScore:80, required:true, logicalOperator:'AND' }); }
function applyRecommendedRentRules() {
  const available = new Set(sourceMatchFields.value.map((field)=>field.key));
  const amountField = ['statisticalAmount','fileAmount','net_amount','document_amount','amount'].find((field)=>available.has(field)) || 'statisticalAmount';
  const kanaFields = ['counterpartyRaw','counterparty','contentSummary','inflow_party'].filter((field)=>available.has(field));
  draftMatchConfiguration.value = { version:2, rules:[
    { id:`rent-amount-${Date.now()}`, systemFields:['contract.monthlyPaymentTotal'], sourceFields:[amountField], operator:'equals', minScore:100, required:true, logicalOperator:'AND' },
    { id:`rent-kana-${Date.now()}`, systemFields:['contract.contractorNameKana','contract.bankStatementSummary'], sourceFields:kanaFields.length ? kanaFields : ['counterpartyRaw','contentSummary'], operator:'similar', minScore:80, required:true, logicalOperator:'AND' },
  ] };
}
function removeMatchRule(index) { draftMatchConfiguration.value.rules.splice(index, 1); }
function selectedSystemFieldSummary(fields) { const selected=systemMatchFields.filter((field)=>fields?.includes(field.key)); if (!selected.length) return '选择系统字段（可多选）'; return selected.length === 1 ? `${selected[0].group} · ${selected[0].label}` : `已选 ${selected.length} 个系统字段`; }
function selectedSourceFieldSummary(fields) { if (!fields?.length) return '选择 JSON 字段（可多选）'; return fields.length === 1 ? fields[0] : `已选 ${fields.length} 个 JSON 字段`; }
function currentDraftConfiguration() { return {version:2,rules:draftMatchConfiguration.value.rules.filter(isValidMatchRule).map((rule,index)=>({...rule,logicalOperator:index === 0 ? 'AND' : rule.logicalOperator}))}; }
function loadSelectedMatchTemplate() { const template=matchRuleTemplates.value.find((item)=>item.id===selectedMatchTemplateId.value); if (!template) return; draftMatchConfiguration.value=normalizeMatchConfiguration(template.configurationJson); matchTemplateName.value=template.name; showMessage(`已加载规则“${template.name}”，可直接保存并执行匹配。`); }
async function saveCurrentMatchTemplate() { const name=matchTemplateName.value.trim(); const configuration=currentDraftConfiguration(); if (!name || !configuration.rules.length) return; savingMatchTemplate.value=true; try { const saved=await api.saveOcrMatchRuleTemplate({name,configuration}); matchRuleTemplates.value=await api.listOcrMatchRuleTemplates(); selectedMatchTemplateId.value=saved.id; showMessage(`规则“${saved.name}”已保存，可在后续任务中选择使用。`); } catch(error) { showMessage(error.message,true); } finally { savingMatchTemplate.value=false; } }
async function deleteSelectedMatchTemplate() { const template=matchRuleTemplates.value.find((item)=>item.id===selectedMatchTemplateId.value); if (!template || !await requestConfirm(`删除后将无法再次加载规则“${template.name}”。`, { title:'确认删除匹配规则？', confirmText:'确认删除', danger:true })) return; try { await api.deleteOcrMatchRuleTemplate(template.id); matchRuleTemplates.value=matchRuleTemplates.value.filter((item)=>item.id!==template.id); selectedMatchTemplateId.value=''; matchTemplateName.value=''; showMessage('已删除保存的匹配规则。'); } catch(error) { showMessage(error.message,true); } }
async function saveMatchConfiguration(executeAfterSave=false) { const configuration=currentDraftConfiguration(); if (!configuration.rules.length) return; savingMatchConfig.value = true; try { detailTask.value = await api.saveOcrMatchConfig(detailTaskId, configuration); matchConfiguration.value = normalizeMatchConfiguration(detailTask.value?.resultJson?.matchConfig); matchConfigOpen.value = false; if (executeAfterSave) await runOcrMatching(); else showMessage('字段映射规则已保存到当前任务。'); } catch (error) { showMessage(error.message, true); } finally { savingMatchConfig.value = false; } }
async function runOcrMatching(recordIds) { if (!validMatchRuleCount.value || matchingRunning.value) return; matchingRunning.value = true; try { detailTask.value = await api.executeOcrMatching(detailTaskId, matchConfiguration.value, recordIds, { rematch:true }); matchConfiguration.value = normalizeMatchConfiguration(detailTask.value?.resultJson?.matchConfig); const summary=detailTask.value?.resultJson?.summary; const latest=detailTask.value?.resultJson?.matchHistory?.at(-1); showMessage(`已使用最新算法 ${latest?.algorithmVersion || ''} 重新计算 ${latest?.processed || 0} 条，更新 ${latest?.changed || 0} 条；当前已匹配 ${summary?.matched || 0} 条，待确认 ${summary?.unmatched || 0} 条。`); } catch (error) { showMessage(error.message, true); } finally { matchingRunning.value = false; } }
async function syncMatchedToDatabase() { if (!syncableMatchedCount.value || syncingMatched.value || !await requestConfirm(`将同步 ${syncableMatchedCount.value} 条已匹配项；未确认项会保留，之后仍可继续手工匹配。`, { title:'同步已匹配数据？', confirmText:`同步 ${syncableMatchedCount.value} 条`, danger:false })) return; syncingMatched.value=true; try { const result=await api.syncOcrMatchedRecords(detailTaskId); detailTask.value=result.task; showMessage(`已同步 ${result.syncedCount} 条到数据库；其余 ${unresolvedCount.value} 条未确认项已保留。`); } catch(error) { showMessage(error.message,true); } finally { syncingMatched.value=false; } }
function downloadRemainingJson() { const payload={ taskId:detailTask.value?.taskId, sessionId:detailTask.value?.sessionId, matchConfiguration:matchConfiguration.value, records:unresolvedRecords.value, matchHistory:matchHistory.value }; const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const link=document.createElement('a'); link.href=url; link.download=`${detailTask.value?.taskName || 'ocr'}-remaining.json`; link.click(); URL.revokeObjectURL(url); }
async function saveActualMonth(record, actualMonth) { if (!record?._recordId) return; savingActualMonthId.value=record._recordId; try { detailTask.value=await api.updateOcrRecord(detailTaskId,record._recordId,{actualMonth:actualMonth || null}); showMessage('实际月份已保存。'); } catch(error) { showMessage(error.message,true); } finally { savingActualMonthId.value=''; } }
async function openMatchDialog(record) { reviewingRecord.value = record; selectedContractIds.value = Array.isArray(record.systemMatch?.contractIds) ? [...record.systemMatch.contractIds] : record.systemMatch?.contractId ? [record.systemMatch.contractId] : []; candidateSearch.value = String(valueOf(record, 'contentSummary', 'counterpartyRaw', 'counterparty', 'contractorName', 'roomNumber', 'inflow_party', 'outflow_party', 'tenant_name', 'summary', 'room_number') || ''); matchCandidates.value = []; await loadMatchCandidates(); }
function closeMatchDialog() { reviewingRecord.value = null; matchCandidates.value = []; selectedContractIds.value = []; }
async function loadMatchCandidates() { if (!reviewingRecord.value) return; loadingCandidates.value = true; try { matchCandidates.value = await api.listOcrMatchCandidates(detailTaskId, candidateSearch.value); } catch (error) { showMessage(error.message, true); } finally { loadingCandidates.value = false; } }
async function confirmManualMatch() { if (!reviewingRecord.value || !canConfirmManualMatch.value) return; savingReview.value = true; try { detailTask.value = await api.reviewOcrRecord(detailTaskId, reviewingRecord.value._recordId, { action: 'MATCH', contractIds: selectedContractIds.value }); const count=selectedContractIds.value.length; closeMatchDialog(); showMessage(count > 1 ? `已将本笔入金分配匹配至 ${count} 个物件。` : '系统侧数据匹配成功，已标记为手工匹配。'); } catch (error) { showMessage(error.message, true); } finally { savingReview.value = false; } }
async function markManualSync(record) { if (!record || !await requestConfirm('该记录将不再参与系统自动匹配，并转入手工同步状态。', { title:'标记为手工同步？', confirmText:'确认标记', danger:true })) return; savingReview.value = true; try { detailTask.value = await api.reviewOcrRecord(detailTaskId, record._recordId, { action: 'MANUAL_SYNC' }); reviewingRecord.value = null; matchCandidates.value = []; selectedContractIds.value = []; showMessage('该记录已标记为手工同步。'); } catch (error) { showMessage(error.message, true); } finally { savingReview.value = false; } }
function clearTimers() { clearTimeout(pollTimer); clearInterval(progressTimer); pollTimer = undefined; progressTimer = undefined; }
function clearMessage() { clearTimeout(messageTimer); messageTimer = undefined; message.value = ''; messageIsError.value = false; }
function showMessage(text, error = false) { clearTimeout(messageTimer); message.value = text; messageIsError.value = error; messageTimer = setTimeout(clearMessage, error ? 6000 : 3500); }
function compactUrl(value) { return value?.length > 36 ? `${value.slice(0, 25)}…${value.slice(-8)}` : value || '—'; }
function formatDate(value) { return value ? new Date(value).toLocaleString() : '—'; }
function formatSize(bytes) { if (!bytes) return '0 B'; const units=['B','KB','MB','GB']; const index=Math.min(Math.floor(Math.log(bytes)/Math.log(1024)),3); return `${(bytes/1024**index).toFixed(index?1:0)} ${units[index]}`; }
function statusText(state) { return ({PENDING:'待处理',UPLOADING:'已上传',PROCESSING:'执行中',COMPLETED:'已完成',REVIEW_REQUIRED:'待人工确认',FAILED:'失败'})[state] || '未知'; }
function statusTone(state) { return state === 'COMPLETED' ? 'success' : state === 'FAILED' ? 'danger' : state === 'REVIEW_REQUIRED' ? 'warning' : 'processing'; }
function matchStatusText(record) { const status = record.systemMatch?.status; if (record.systemMatch?.syncedTransactionId) return '已同步数据库'; if (status === 'MATCHED') return record.systemMatch?.matchMode === 'MANUAL' ? '手工匹配' : '已匹配'; if (status === 'MANUAL_SYNC') return '手工同步'; if (status === 'NOT_APPLICABLE') return '不适用'; if (status === 'AMBIGUOUS') return '多个候选'; return '待确认'; }
function matchStatusTone(record) { return record.systemMatch?.status === 'MATCHED' ? 'success' : ['MANUAL_SYNC','NOT_APPLICABLE'].includes(record.systemMatch?.status) ? 'processing' : 'warning'; }
function matchScoreText(value) { const score=Number(value); return Number.isFinite(score)?`${Math.max(0,Math.min(100,Math.round(score)))}%`:'—'; }
function matchScoreTone(value) { const score=Number(value); return !Number.isFinite(score)?'score-muted':score===100?'score-perfect':score>=80?'score-high':score>=60?'score-medium':'score-low'; }
function sourceRecordSummary(record) { return valueOf(record,'contentSummary','counterpartyRaw','counterparty','summary','description','bankDescription') || '—'; }
function sourceRecordAmount(record) { return valueOf(record,'statisticalAmount','fileAmount','net_amount','document_amount','amount'); }
function candidateMatchFieldLabel(field) { return ({bankStatementSummary:'银行账单摘要',bankSummaryName:'银行摘要名义',payerName:'支付人',contractorName:'契约者',tenantName:'租客',contractNumber:'合同编号',roomNumber:'房间号',propertyName:'物件名称'})[field] || '综合候选'; }
function systemFieldLabel(field) { return systemMatchFields.find((item)=>item.key===field)?.label || field; }
function operatorLabel(operator) { return matchOperators.find((item)=>item.key===operator)?.label || operator; }
function displayRuleValue(record, field) { const value=field.split('.').reduce((current,key)=>current?.[key],record); return value===undefined||value===null||value==='' ? '' : String(value); }
function candidateRuleValue(candidate, rule) { const values=rule.systemFields.map((field)=>candidate.matchFieldValues?.[field]).filter((value)=>value!==undefined&&value!==null&&value!==''); return values.length ? values.map((value)=>typeof value==='number'?money(value):String(value)).join(' / ') : '—'; }
function summarizeRecords(records) { const autoMatched=records.filter((item)=>item.systemMatch?.status==='MATCHED'&&item.systemMatch?.matchMode!=='MANUAL').length; const manualMatched=records.filter((item)=>item.systemMatch?.status==='MATCHED'&&item.systemMatch?.matchMode==='MANUAL').length; const manualSync=records.filter((item)=>item.systemMatch?.status==='MANUAL_SYNC').length; const notApplicable=records.filter((item)=>item.systemMatch?.status==='NOT_APPLICABLE').length; return { total:records.length, matched:autoMatched+manualMatched, autoMatched, manualMatched, manualSync, notApplicable, unmatched:records.length-autoMatched-manualMatched-manualSync-notApplicable }; }
function valueOf(record,...keys) { return keys.map((key)=>record?.[key]).find((value)=>value!==undefined&&value!==null&&value!==''); }
function money(value) { if(value===undefined||value===null||value==='') return '—'; const number=Number(value); return Number.isFinite(number)?`¥${number.toLocaleString()}`:value; }

onMounted(async () => { try { if (pageMode === 'detail') await loadDetailTask(); else { await loadPage(); if (pageMode === 'execute' && !executionWorkflow.value) showMessage('工作流不存在或已删除。', true); if (pageMode === 'history' && !historyWorkflow.value) showMessage('工作流不存在或已删除，无法加载执行历史。', true); } } catch (error) { showMessage(error.message, true); } finally { loading.value = false; } });
onBeforeUnmount(() => { clearTimers(); clearMessage(); });
</script>

<style scoped>
.ocr-page{display:grid;gap:20px;color:#10223c}.panel-card,.toolbar-card,.metrics-grid>div{background:#fff;border:1px solid #d8e1eb;border-radius:16px;box-shadow:0 8px 26px rgba(20,42,72,.04)}.toolbar-card,.page-heading{padding:22px;display:flex;align-items:center;justify-content:space-between;gap:20px}.toolbar-card h3,.section-head h3,.page-heading h2{margin:3px 0 0}.muted{color:#687c96;margin:6px 0 0}.eyebrow{color:#087f78;font-size:12px;font-weight:800;letter-spacing:.08em;margin:0}.panel-card{padding:20px}.section-head,.modal-actions,.execute-bar,.progress-head,.result-toolbar,.detail-process{display:flex;align-items:center;justify-content:space-between;gap:14px}.table-scroll{overflow:auto;margin-top:14px}.workflow-table,.result-table{width:100%;min-width:1050px;border-collapse:collapse}.detail-result-table{min-width:1500px}.workflow-table th,.workflow-table td,.result-table th,.result-table td{padding:14px 11px;text-align:left;border-bottom:1px solid #e4eaf1;font-size:13px}.workflow-table th,.result-table th{color:#62768e;background:#f7f9fb;white-space:nowrap}.workflow-table code{display:block;max-width:220px;overflow:hidden;text-overflow:ellipsis}.operation-col{position:sticky;right:0;background:#fff;box-shadow:-8px 0 12px rgba(30,50,75,.035)}thead .operation-col{background:#f7f9fb}.row-actions{display:flex;gap:12px;white-space:nowrap}.row-actions button{border:0;background:transparent;color:#315b7b;cursor:pointer;padding:4px}.row-actions .execute-link{color:#087f78;font-weight:800}.row-actions .danger-link,.row-actions .manual-sync-link{color:#c23b48}.row-actions button:disabled{color:#aab4bf;cursor:not-allowed}.status-tag{display:inline-flex;padding:5px 9px;border-radius:999px;font-size:12px;white-space:nowrap}.status-tag.success{background:#e8f8ee;color:#177647}.status-tag.processing{background:#eaf3ff;color:#2764a8}.status-tag.warning{background:#fff4dc;color:#a45b05}.status-tag.danger{background:#ffe9eb;color:#b4232f}.status-tag.muted-tag{background:#eef1f4;color:#707d8b}.status-tag.large{padding:8px 12px}.empty-list{width:100%;min-height:180px;margin-top:14px;border:1px dashed #aebfd0;border-radius:13px;background:#f7fafc;display:grid;place-content:center;gap:8px;color:#5b7088;cursor:pointer}.empty-state,.empty-cell{text-align:center;color:#7c8ea3;padding:34px!important}.back-link{border:0;background:transparent;color:#087f78;padding:0;margin-bottom:14px;cursor:pointer}.workflow-info-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.workflow-info-grid>div{display:grid;gap:7px;background:#f6f8fb;padding:13px;border-radius:10px;overflow:hidden}.workflow-info-grid small{color:#6c7f96}.workflow-info-grid code{overflow:hidden;text-overflow:ellipsis}.task-name-field{max-width:650px;display:grid;gap:8px;margin:18px 0 12px;font-weight:700;font-size:13px}.task-name-field input,.form-grid input,.result-toolbar input,.candidate-search input{border:1px solid #ccd8e5;border-radius:10px;padding:11px 13px;font:inherit}.drop-zone{min-height:210px;border:1.5px dashed #b8c9dc;border-radius:14px;background:#f6f9fd;display:grid;place-items:center;align-content:center;gap:8px;text-align:center;padding:20px}.drop-zone.dragging{border-color:#0b948b;background:#ecfaf8}.drop-zone.disabled{opacity:.65}.drop-zone p{margin:0 0 8px;color:#718096}.upload-symbol{font-size:28px;color:#0b948b}.hidden-input{display:none}.selected-files{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}.file-row{display:flex;align-items:center;justify-content:space-between;background:#f5f8fb;border-radius:9px;padding:10px 12px}.file-row span{min-width:0;display:flex;gap:8px}.file-row strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.file-row small{color:#7b8da3;white-space:nowrap}.file-row button{border:0;background:transparent;font-size:18px}.progress-card{margin-top:16px;border:1px solid #cfe1e2;background:#f4fbfa;border-radius:12px;padding:15px}.progress-track{height:12px;background:#dfe8ec;border-radius:999px;overflow:hidden;margin:12px 0}.progress-fill{height:100%;background:linear-gradient(90deg,#16b9a7,#087f78);border-radius:999px;transition:width .35s}.progress-fill.failed{background:#c23b48}.progress-steps{display:flex;justify-content:space-between;color:#8b99a8;font-size:12px}.progress-steps span.active{color:#087f78;font-weight:800}.progress-card p{margin:12px 0 0;color:#536982}.execute-bar{margin-top:18px}.execute-actions{display:flex;gap:9px}.feedback{padding:11px 13px;border-radius:9px;background:#e9f8f5;color:#087f78}.feedback.error{background:#fff0f1;color:#b4232f}.modal-backdrop{position:fixed;inset:0;z-index:1000;background:rgba(16,34,60,.42);display:grid;place-items:center;padding:20px}.modal-card{width:min(680px,100%);background:#fff;border-radius:16px;padding:22px;box-shadow:0 24px 70px rgba(15,35,60,.25)}.match-dialog{width:min(820px,100%)}.record-preview{display:flex;gap:14px;align-items:center;margin:16px 0;padding:13px;background:#f5f8fb;border-radius:10px}.record-preview strong{flex:1}.candidate-search{display:flex;gap:10px}.candidate-search input{flex:1}.candidate-list{display:grid;gap:8px;max-height:360px;overflow:auto;margin:14px 0}.candidate-row{display:flex;align-items:flex-start;gap:10px;border:1px solid #dbe4ed;border-radius:10px;padding:12px;cursor:pointer}.candidate-row.selected{border-color:#0b948b;background:#effaf8}.candidate-row span{display:grid;gap:4px}.candidate-row small,.system-data-cell small{color:#718096}.system-data-cell{display:grid;gap:3px;min-width:150px}.manual-sync-button{margin-right:auto;color:#b4232f}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px}.form-grid label{display:grid;gap:7px;font-size:13px;font-weight:700}.form-grid .full-field{grid-column:1/-1}.contract-note{background:#f4f8fb;color:#61758c;border-radius:9px;padding:11px;font-size:12px}.switch-label{margin-right:auto}.icon-button{border:0;background:#f1f5f8;width:32px;height:32px;border-radius:8px;font-size:21px}.confirm-card{max-width:430px;text-align:center}.confirm-card p{color:#667a92;line-height:1.65}.warning-icon{display:grid;place-items:center;width:48px;height:48px;margin:0 auto;border-radius:50%;background:#fff0e2;color:#b55c0b;font-size:24px;font-weight:900}.confirm-actions{justify-content:center;margin-top:20px}.primary-button,.secondary-button,.ghost-button,.danger-button{border-radius:10px;padding:10px 16px;font-weight:700;cursor:pointer}.primary-button{border:1px solid #0b948b;background:#0b948b;color:#fff}.secondary-button{border:1px solid #cdd9e5;background:#fff;color:#17304f}.ghost-button{border:0;background:#eef3f6;color:#536982}.danger-button{border:1px solid #c23b48;background:#c23b48;color:#fff}.primary-button:disabled,.secondary-button:disabled,.danger-button:disabled{opacity:.5;cursor:not-allowed}.process-main{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.process-main span{background:#edf2f6;color:#718096;padding:9px 14px;border-radius:8px;font-weight:700}.process-main span.done{background:#dff4f0;color:#087f78}.process-main i{font-style:normal;color:#0b948b}.metrics-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}.metrics-grid>div{padding:18px;display:grid;gap:8px}.metrics-grid small{color:#667a92}.metrics-grid strong{font-size:25px}.metrics-grid .metric-text{font-size:15px}.detail-layout{display:grid;grid-template-columns:250px minmax(0,1fr);gap:14px}.history-card{align-self:start}.source-file{padding:11px 0;border-bottom:1px solid #e6ebf0;overflow:hidden;text-overflow:ellipsis}.tabs{display:flex;gap:8px;flex-wrap:wrap}.tabs button{border:0;background:transparent;color:#087f78;padding:8px 11px}.tabs button.active{font-weight:800;border-bottom:2px solid #0b948b}.result-toolbar input{width:280px}@media(max-width:1100px){.metrics-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:900px){.workflow-info-grid,.form-grid,.detail-layout{grid-template-columns:1fr}.form-grid .full-field{grid-column:auto}.metrics-grid{grid-template-columns:repeat(2,1fr)}.selected-files{grid-template-columns:1fr}.result-toolbar{align-items:flex-start;flex-direction:column}.result-toolbar input{width:100%}}@media(max-width:620px){.toolbar-card,.page-heading,.execute-bar,.detail-process,.record-preview,.candidate-search,.modal-actions{align-items:stretch;flex-direction:column}.metrics-grid{grid-template-columns:1fr}.progress-steps{gap:8px;flex-wrap:wrap}.manual-sync-button{margin-right:0}}
.match-workflow-bar{display:flex;align-items:center;justify-content:space-between;gap:16px;overflow:visible}.workflow-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.workflow-actions i{font-style:normal;color:#0b948b}.step-button{white-space:nowrap}.completed-step{display:inline-flex;align-items:center;padding:10px 14px;border-radius:10px;background:#dff4f0;color:#087f78;font-weight:700}.step-button small{margin-left:5px}.match-history-actions{display:flex;align-items:center;gap:10px;white-space:nowrap;color:#687c96}.match-config-dialog{width:min(760px,100%)}.match-field-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:18px 0}.match-field-option{display:flex;align-items:flex-start;gap:10px;padding:13px;border:1px solid #dbe4ed;border-radius:10px;cursor:pointer}.match-field-option:has(input:checked){border-color:#0b948b;background:#effaf8}.match-field-option span{display:grid;gap:4px}.match-field-option small{color:#718096;line-height:1.45}.configuration-warning{color:#b55c0b;background:#fff4dc;padding:10px 12px;border-radius:9px}@media(max-width:1000px){.match-workflow-bar{align-items:flex-start;flex-direction:column}}@media(max-width:620px){.workflow-actions,.match-history-actions{align-items:stretch;flex-direction:column;width:100%}.workflow-actions i{display:none}.match-field-grid{grid-template-columns:1fr}}
.match-config-dialog{width:min(1480px,calc(100vw - 40px));max-height:92vh;overflow:auto}.mapping-layout{display:grid;grid-template-columns:265px minmax(620px,1fr) 290px;border:1px solid #dbe4ed;border-radius:12px;overflow:visible;margin:18px 0;min-height:520px}.mapping-fields{padding:16px;background:#f8fafc;overflow:auto;max-height:62vh}.mapping-fields h4,.mapping-workspace h4{margin:0 0 12px}.mapping-fields h4 small{color:#718096;font-weight:500}.mapping-search{box-sizing:border-box;width:100%;margin-bottom:10px;padding:9px 10px;border:1px solid #ccd8e5;border-radius:8px;background:#fff}.mapping-field-card{display:grid;gap:4px;padding:11px;margin-bottom:8px;background:#fff;border:1px solid #dce5ed;border-radius:9px}.mapping-field-card small,.mapping-field-card code{color:#718096;overflow:hidden;text-overflow:ellipsis}.mapping-field-card span{display:flex;justify-content:space-between;gap:8px}.mapping-field-card em{font-style:normal;color:#087f78;font-size:11px}.mapping-workspace{padding:16px;border-left:1px solid #dbe4ed;border-right:1px solid #dbe4ed;min-width:0}.mapping-toolbar{display:flex;align-items:center;gap:12px;margin-bottom:14px}.mapping-toolbar>div{margin-right:auto}.mapping-toolbar h4{margin-bottom:3px}.mapping-toolbar small{color:#718096}.mapping-rule-wrap{position:relative;margin-bottom:12px}.rule-connector{height:34px;display:flex;align-items:center;padding-left:44px;color:#52677e;font-size:13px}.rule-connector label{display:flex;align-items:center;gap:7px}.rule-connector select,.mapping-rule select{border:1px solid #ccd8e5;border-radius:8px;padding:9px;background:#fff;min-width:0}.rule-connector select{padding:6px 28px 6px 9px;font-weight:700;color:#087f78}.mapping-rule{display:grid;grid-template-columns:32px minmax(190px,1fr) 130px minmax(190px,1fr) auto auto;align-items:center;gap:9px;padding:12px;border:1px solid #dbe4ed;border-radius:10px;background:#fff}.mapping-rule>b{display:grid;place-items:center;width:27px;height:27px;border-radius:50%;background:#dff4f0;color:#087f78}.multi-field-select{position:relative;min-width:0}.multi-field-select summary{box-sizing:border-box;display:block;width:100%;padding:10px 34px 10px 11px;border:1px solid #ccd8e5;border-radius:8px;background:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;list-style:none}.multi-field-select summary::-webkit-details-marker{display:none}.multi-field-select summary::after{content:'▾';position:absolute;right:12px;color:#64748b}.multi-field-select[open] summary{border-color:#0b948b;box-shadow:0 0 0 2px rgba(11,148,139,.1)}.multi-field-menu{position:absolute;z-index:20;top:calc(100% + 5px);left:0;width:max(100%,330px);max-height:330px;overflow:auto;padding:8px;border:1px solid #ccd8e5;border-radius:10px;background:#fff;box-shadow:0 14px 35px rgba(31,50,73,.18)}.multi-field-menu label{display:flex;align-items:flex-start;gap:9px;padding:8px;border-radius:7px;cursor:pointer}.multi-field-menu label:hover{background:#f1f8f7}.multi-field-menu label:has(input:checked){background:#e8f7f4}.multi-field-menu label>span{display:grid;min-width:0;gap:2px}.multi-field-menu code,.multi-field-menu small{color:#718096;overflow:hidden;text-overflow:ellipsis}.source-menu{right:0;left:auto}.required-rule{white-space:nowrap}.rule-delete{border:0;background:transparent;color:#c23b48;cursor:pointer}.empty-rule{width:100%;padding:24px;border:1px dashed #9fb6ca;background:#f8fbfd;color:#087f78;border-radius:10px}.actual-month-input{width:126px;border:1px solid #ccd8e5;border-radius:8px;padding:8px}.month-hint{display:block;color:#718096;margin-top:5px}.json-detail-dialog{width:min(900px,100%)}.json-detail-dialog pre{max-height:70vh;overflow:auto;padding:16px;border-radius:10px;background:#10223c;color:#e8f0f7;white-space:pre-wrap;word-break:break-word}@media(max-width:1100px){.mapping-layout{grid-template-columns:1fr}.mapping-workspace{border:0;border-top:1px solid #dbe4ed;border-bottom:1px solid #dbe4ed}.mapping-fields{max-height:240px}.mapping-rule{grid-template-columns:32px 1fr 1fr}.mapping-rule .required-rule,.mapping-rule .rule-delete{justify-self:start}.multi-field-menu{width:min(360px,80vw)}}@media(max-width:700px){.mapping-rule{grid-template-columns:1fr}.mapping-toolbar{align-items:stretch;flex-direction:column}.mapping-toolbar>div{margin-right:0}.rule-connector{padding-left:0}.source-menu{right:auto;left:0}}
.table-link{border:0;background:transparent;color:#087f78;cursor:pointer;padding:0;text-align:left}.strong-link{font-weight:800}.count-link{min-width:36px;padding:5px 10px;border-radius:8px;background:#e8f7f4;text-align:center}.table-link:hover{text-decoration:underline}.history-metrics{grid-template-columns:repeat(4,minmax(0,1fr))}.history-table{min-width:1250px}.block-muted,.block-error{display:block;max-width:260px;margin-top:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.block-muted{color:#718096}.block-error{color:#b4232f}.file-summary{max-width:220px}@media(max-width:900px){.history-metrics{grid-template-columns:repeat(2,1fr)}}
.match-score{display:inline-flex;align-items:center;justify-content:center;min-width:54px;padding:6px 10px;border-radius:999px;font-weight:800;font-variant-numeric:tabular-nums}.score-perfect{background:#dff7ed;color:#087f5b}.score-high{background:#e8f2ff;color:#2364aa}.score-medium{background:#fff3d8;color:#9b5b00}.score-low{background:#ffeaec;color:#b42336}.score-muted{background:#edf1f5;color:#718096}.match-dialog{width:min(980px,calc(100vw - 40px));max-height:90vh;overflow:auto}.record-preview{display:grid;grid-template-columns:minmax(260px,2fr) 1fr 1fr .7fr;align-items:stretch}.record-preview>div{display:grid;gap:5px;padding:4px 12px;border-right:1px solid #dfe7ef}.record-preview>div:last-child{border-right:0}.record-preview small,.candidate-summary small,.candidate-score small{color:#718096}.record-preview strong{word-break:break-word}.candidate-row{display:grid;grid-template-columns:auto minmax(0,1fr) 110px;align-items:center;padding:15px}.candidate-main{min-width:0}.candidate-summary{display:grid;grid-template-columns:100px minmax(0,1fr);align-items:center;gap:8px;margin-top:5px;padding:8px 10px;border-radius:8px;background:#f6f8fb}.candidate-summary b{overflow-wrap:anywhere}.candidate-score{display:grid;justify-items:center;gap:5px;padding-left:12px;border-left:1px solid #dfe7ef}.candidate-row.selected .candidate-summary{background:#fff}.candidate-row.selected{box-shadow:0 0 0 1px #0b948b}.candidate-list{max-height:430px}@media(max-width:760px){.record-preview{grid-template-columns:1fr 1fr}.record-preview>div{border-right:0;border-bottom:1px solid #dfe7ef}.candidate-row{grid-template-columns:auto 1fr}.candidate-score{grid-column:2;border-left:0;padding:8px 0 0;justify-items:start}}
.mapping-toolbar{flex-wrap:wrap}.mapping-rule{grid-template-columns:32px minmax(190px,1fr) 150px minmax(190px,1fr) auto auto}.rule-operator{display:grid;gap:5px}.rule-operator label{display:flex;align-items:center;gap:5px;color:#52677e;font-size:12px}.rule-operator input{width:54px;padding:5px;border:1px solid #ccd8e5;border-radius:6px}
.rule-template-bar{display:flex;justify-content:space-between;gap:16px;margin:16px 0;padding:14px;border:1px solid #cfe1e2;border-radius:12px;background:#f4fbfa}.template-picker,.template-save{display:flex;align-items:center;gap:8px;min-width:0}.template-picker label,.template-save label{font-size:13px;font-weight:800;white-space:nowrap}.template-picker select,.template-save input{min-width:210px;padding:10px;border:1px solid #ccd8e5;border-radius:8px;background:#fff;font:inherit}.danger-text{color:#b4232f}.sync-button{white-space:nowrap}@media(max-width:1050px){.rule-template-bar{align-items:stretch;flex-direction:column}.template-picker,.template-save{flex-wrap:wrap}}@media(max-width:620px){.template-picker,.template-save{align-items:stretch;flex-direction:column}.template-picker select,.template-save input{width:100%;box-sizing:border-box}}
.reconciliation-control{padding:0;overflow:hidden}.control-status-row,.control-action-row{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:16px 20px}.control-status-row{background:#fbfcfd;border-bottom:1px solid #e3eaf0}.control-action-row{min-height:52px}.control-label{margin:0 0 8px;color:#718096;font-size:12px;font-weight:800;letter-spacing:.04em}.control-action-row .control-label{margin-bottom:4px}.control-copy{min-width:205px}.control-copy>span,.history-count{color:#657a91;font-size:13px;white-space:nowrap}.control-buttons{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex:1}.control-buttons button{padding:9px 13px}.history-count{padding-left:14px;border-left:1px solid #dbe4ed}.process-main span{padding:7px 12px;font-size:13px}.active-rule-panel{margin:14px 0;border:1px solid #d8e5ea;border-radius:12px;background:#f8fbfc;overflow:hidden}.rule-panel-title{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border-bottom:1px solid #e1e9ee}.rule-panel-title small{color:#718096}.active-rule-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:#e4ebef}.active-rule-item{display:grid;grid-template-columns:28px minmax(0,1fr);gap:8px;padding:11px 13px;background:#fff}.active-rule-item>b{grid-row:1/3;display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:#dff4f0;color:#087f78}.active-rule-item>span{display:grid;gap:2px}.active-rule-item small{color:#718096}.active-rule-item em{grid-column:2;font-style:normal;color:#17304f;overflow-wrap:anywhere}.candidate-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.candidate-heading>b{color:#087f78;white-space:nowrap}.candidate-rule-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:8px}.candidate-rule-grid>span{display:grid;gap:3px;padding:8px 10px;border-radius:8px;background:#f5f8fb}.candidate-row.selected .candidate-rule-grid>span{background:#fff}.selection-summary{display:flex;align-items:center;gap:20px;margin-top:12px;padding:11px 14px;border-radius:10px;background:#f4f7fa;color:#536982}.selection-summary span{white-space:nowrap}.amount-balanced{color:#087f5b}.amount-unbalanced{color:#b4232f}.match-dialog .candidate-list{max-height:330px}.match-dialog .candidate-row{grid-template-columns:auto minmax(0,1fr) 100px}.match-dialog .modal-actions{margin-top:10px}@media(max-width:1000px){.control-action-row{align-items:flex-start;flex-wrap:wrap}.control-buttons{order:3;flex-basis:100%;justify-content:flex-start}.history-count{border-left:0;padding-left:0}}@media(max-width:700px){.control-status-row,.control-action-row{align-items:stretch;flex-direction:column}.control-buttons,.selection-summary{align-items:stretch;flex-direction:column}.control-buttons button{width:100%}.active-rule-list,.candidate-rule-grid{grid-template-columns:1fr}.history-count{align-self:flex-start}}
.task-name-field{max-width:760px}.task-name-field>span:first-child{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.task-name-field>span:first-child small{color:#718096;font-weight:500}.task-name-control{display:flex;gap:8px}.task-name-control input{flex:1;min-width:0;font-variant-numeric:tabular-nums;letter-spacing:.04em}.task-name-control button{white-space:nowrap}
.candidate-tools{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-top:16px;padding:14px;border:1px solid #d8e5ea;border-radius:12px;background:#f8fbfc}.candidate-tools>div:first-child{display:grid;gap:4px;min-width:190px}.candidate-tools>div:first-child small{color:#718096}.candidate-tools .candidate-search{width:min(560px,100%);margin:0}.candidate-tools .candidate-search input{background:#fff}.match-dialog .candidate-list{gap:10px;margin:10px 0 0;padding:2px 4px 8px 2px}.match-dialog .candidate-row{position:relative;grid-template-columns:30px minmax(0,1fr) 108px;gap:14px;border-color:#d8e2eb;border-radius:12px;padding:14px 16px;background:#fff;transition:border-color .15s,box-shadow .15s,background .15s}.match-dialog .candidate-row:hover{border-color:#8ebeb9;box-shadow:0 5px 16px rgba(20,61,72,.08)}.match-dialog .candidate-row.selected{border-color:#0b948b;background:#f2fbf9;box-shadow:0 0 0 2px rgba(11,148,139,.12)}.candidate-check{position:relative;display:block!important;width:22px;height:22px}.candidate-check input{position:absolute;inset:0;width:22px;height:22px;margin:0;opacity:0;cursor:pointer}.candidate-check i{display:grid;place-items:center;width:20px;height:20px;border:2px solid #b9c7d4;border-radius:6px;background:#fff;color:transparent;font-size:13px;font-style:normal;font-weight:900}.candidate-check input:checked+i{border-color:#0b948b;background:#0b948b;color:#fff}.candidate-heading strong{display:flex;align-items:center;gap:8px;font-size:15px}.candidate-heading strong em{padding:3px 7px;border-radius:6px;background:#edf3f6;color:#536982;font-size:12px;font-style:normal;font-weight:700}.candidate-heading>b{font-size:16px;font-variant-numeric:tabular-nums}.candidate-meta{display:flex!important;align-items:center;gap:8px;margin-top:3px}.candidate-meta i{width:3px;height:3px;border-radius:50%;background:#a4b2c0}.candidate-score{align-self:stretch;align-content:center;border-left-color:#e1e8ee}.candidate-score>.match-score{font-size:14px}.selection-summary{justify-content:space-between;border:1px solid #dce5eb;background:#f8fafb;font-variant-numeric:tabular-nums}.match-dialog .modal-actions{padding-top:12px;border-top:1px solid #e5ebf0}
@media(max-width:760px){.task-name-field>span:first-child,.task-name-control,.candidate-tools{align-items:stretch;flex-direction:column}.candidate-tools .candidate-search{width:100%}.candidate-meta{align-items:flex-start!important;flex-direction:column}.candidate-meta i{display:none}}
.detail-metrics{grid-template-columns:repeat(8,minmax(100px,1fr));gap:8px}.detail-metrics>div{min-height:54px;padding:10px 12px;gap:2px;border-radius:12px;box-shadow:none}.detail-metrics small{font-size:12px}.detail-metrics strong{font-size:20px;line-height:1.2}.detail-layout{display:block}.source-files-inline{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:-4px 0 12px;padding:0 0 12px;border-bottom:1px solid #e4eaf1}.source-files-inline>strong{margin-right:2px;font-size:13px}.source-file-count{display:grid;place-items:center;min-width:22px;height:22px;border-radius:999px;background:#e5f5f2;color:#087f78;font-size:12px;font-weight:800}.source-file-chip{max-width:360px;padding:6px 10px;border:1px solid #dbe4ed;border-radius:8px;background:#f7f9fb;color:#536982;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.selection-summary .amount-unbalanced{display:flex;align-items:baseline;gap:5px;flex-wrap:wrap}.selection-summary .amount-unbalanced small{color:#9b5b00;font-size:11px;font-weight:500}
@media(max-width:1400px){.detail-metrics{grid-template-columns:repeat(4,minmax(100px,1fr))}}@media(max-width:700px){.detail-metrics{grid-template-columns:repeat(2,minmax(100px,1fr))}.source-file-chip{max-width:100%}}
</style>
