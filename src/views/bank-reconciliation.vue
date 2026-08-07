<template>
  <section class="page-shell bank-reconciliation-page" @click="showTemplateChooser = false">
    <div class="bank-reconciliation-controls">
      <button class="secondary-button" type="button" @click="openProviderDialog">{{ scanUi.modelSettings }}</button>
      <button class="secondary-button" type="button" @click="loadBatches">{{ t.action.refresh }}</button>
    </div>

    <div class="panel-card">
      <div class="input-choice-bar">
        <div>
          <p class="eyebrow">{{ scanUi.inputTitle }}</p>
          <strong>{{ scanUi.inputHelp }}</strong>
        </div>
        <div class="input-choice-actions">
          <label class="secondary-button file-button">
            {{ scanUi.excelOption }}
            <input type="file" multiple accept=".csv,.tsv,.txt,.html,.xls,.xlsx" @change="selectFiles" />
          </label>
          <label class="secondary-button file-button pdf-file-button">
            {{ scanUi.pdfOption }}
            <input type="file" accept=".pdf,application/pdf" @change="selectPdf" />
          </label>
        </div>
      </div>

      <div v-if="selectedPdf || activeScanTask" class="pdf-scan-panel">
        <div class="pdf-scan-summary">
          <div>
            <strong>{{ selectedPdf?.name || activeScanTask?.originalFilename }}</strong>
            <small v-if="selectedPdf">{{ formatFileSize(selectedPdf.size) }}</small>
            <small v-if="activeScanTask">{{ activeScanTask.scanNo }} · {{ scanStatusLabel(activeScanTask.status) }}</small>
            <small v-if="activeScanTask?.providerModel">{{ scanUi.currentModel }}：{{ activeScanTask.providerModel }}</small>
          </div>
          <div class="pdf-scan-actions">
            <button class="secondary-button" type="button" :disabled="!selectedPdf || pdfLoading" @click="uploadPdf">
              {{ pdfLoading ? scanUi.uploading : scanUi.uploadPdf }}
            </button>
            <button class="primary-button" type="button" :disabled="!['READY', 'FAILED'].includes(activeScanTask?.status) || pdfLoading" @click="startPdfScan">
              {{ activeScanTask?.status === 'FAILED' ? scanUi.retryScan : scanUi.aiScan }}
            </button>
          </div>
        </div>
        <p v-if="activeScanTask?.generatedFilename" class="generated-file-result">
          {{ scanUi.generatedFile }}：<strong>{{ activeScanTask.generatedFilename }}</strong>
        </p>
        <div class="scan-progress-track"><span :style="{ width: `${activeScanTask?.progress || 0}%` }"></span></div>
        <p class="scan-hint">{{ scanStageMessage }}</p>
      </div>

      <div class="toolbar">
        <div class="workflow-actions">
          <span class="step-button file-step-status">{{ selectedFiles.length ? `${selectedFiles.length} ${t.action.addFiles}` : scanUi.excelOption }}</span>
          <span class="step-arrow" aria-hidden="true">→</span>
          <button class="primary-button step-button" type="button" :disabled="!selectedFiles.length || loading" @click="uploadRows">{{ t.action.createBatch }}</button>
          <span class="step-arrow" aria-hidden="true">→</span>
          <div class="matching-entry" @click.stop>
            <button class="primary-button step-button" type="button" :disabled="!activeBatchId || loading" @click="toggleTemplateChooser">{{ ui.selectFields }} <span class="button-caret">▾</span></button>
            <div v-if="showTemplateChooser" class="template-chooser" role="menu">
              <div class="template-chooser-title">{{ ui.chooseTemplate }}</div>
              <button class="template-choice new-choice" type="button" @click="createNewTemplate"><span>＋</span><div><strong>{{ ui.newTemplate }}</strong><small>{{ ui.newTemplateHelp }}</small></div></button>
              <button v-if="hasValidConfiguration" class="template-choice" type="button" @click="editCurrentConfiguration"><span>●</span><div><strong>{{ ui.currentConfiguration }}</strong><small>{{ enabledRuleCount }} {{ ui.rulesConfigured }}</small></div></button>
              <button v-for="template in templates" :key="template.id" class="template-choice" type="button" @click="openSavedTemplate(template)"><span>◇</span><div><strong>{{ template.name }}</strong><small>v{{ template.version }}</small></div></button>
              <div v-if="chooserLoading" class="template-chooser-state">{{ ui.loadingTemplates }}</div>
              <div v-else-if="chooserError" class="template-chooser-error">{{ chooserError }}</div>
              <div v-else-if="!templates.length" class="template-chooser-state">{{ ui.noTemplatesHint }}</div>
            </div>
          </div>
          <span class="step-arrow" aria-hidden="true">→</span>
          <button class="primary-button step-button" type="button" :disabled="!activeBatchId || !hasValidConfiguration || loading" @click="runMatch">{{ t.action.match }}</button>
          <span class="step-arrow" aria-hidden="true">→</span>
          <button class="primary-button step-button" type="button" :disabled="!activeBatchId || loading" @click="submitBatch">{{ t.action.submit }}</button>
        </div>
        <div class="toolbar-exports">
          <button class="secondary-button" type="button" :disabled="!activeBatchId || loading" @click="exportFinalResult">{{ t.action.exportExcel }}</button>
          <button class="secondary-button" type="button" :disabled="!activeBatchId || loading" @click="exportUnmatchedJson">{{ t.action.exportJson }}</button>
        </div>
      </div>

      <div class="rule-panel rule-summary-panel">
        <strong>{{ t.matching.title }}</strong>
        <span v-if="hasValidConfiguration" class="configuration-ok">{{ enabledRuleCount }} {{ ui.rulesConfigured }} · {{ matchingConfiguration.groups.length }} {{ ui.groups }}</span>
        <span v-else class="configuration-warning">{{ ui.ruleRequired }}</span>
      </div>

      <div v-if="selectedFiles.length" class="file-list">
        <span v-for="file in selectedFiles" :key="file.name">{{ file.name }}</span>
      </div>
      <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>
    </div>

    <div class="stats-grid">
      <article v-for="stat in stats" :key="stat.key" class="stat-card">
        <span>{{ stat.label }}</span>
        <strong>{{ stat.value }}</strong>
      </article>
    </div>

    <div class="content-grid">
      <aside class="panel-card batch-panel">
        <div class="table-head">
          <strong>{{ t.history.title }}</strong>
          <span>{{ batches.length }}</span>
        </div>
        <div
          v-for="batch in batches"
          :key="batch.id"
          class="batch-row"
          :class="{ active: activeBatchId === batch.id }"
        >
          <button class="batch-select" type="button" @click="selectBatch(batch.id)">
            <strong>{{ batch.batchNo }}</strong>
            <span>{{ statusLabel(batch.status) }}</span>
            <small>{{ batch.sourceFiles?.[0]?.fileName || t.history.noFile }}</small>
            <small v-if="batch.template">{{ batch.template.name }} · v{{ batch.template.version }}</small>
          </button>
          <button class="danger-button mini batch-delete" type="button" :disabled="loading" @click="deleteBatch(batch.id)">
            {{ t.action.delete }}
          </button>
        </div>
      </aside>

      <section class="panel-card records-panel">
        <div class="table-head">
          <div class="tabs">
            <button v-for="tab in tabs" :key="tab.key" type="button" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">
              {{ tab.label }}
            </button>
          </div>
          <div class="records-table-tools">
            <input v-model="searchQuery" class="search-input" type="search" :placeholder="t.action.search" />
            <div class="column-panel-container">
              <button class="secondary-button" type="button" @click="showColumnPanel = !showColumnPanel">{{ t.action.showColumns }} ▾</button>
              <div v-if="showColumnPanel" class="column-panel" role="dialog" :aria-label="t.action.showColumns">
                <div class="column-panel-header">
                  <strong>{{ t.action.showColumns }}</strong>
                  <button class="column-reset-button" type="button" @click="resetBankColumns">{{ t.action.resetColumns }}</button>
                </div>
                <div class="panel-body">
                  <label v-for="column in bankColumns" :key="column.key" class="panel-item">
                    <input v-model="column.visible" type="checkbox" />
                    {{ bankColumnLabel(column.key) }}
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DualScrollTable wrapper-class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th v-if="isBankColumnVisible('source')">{{ t.table.source }}</th>
                <th v-if="isBankColumnVisible('date')">{{ t.table.date }}</th>
                <th v-if="isBankColumnVisible('category')">{{ t.table.category }}</th>
                <th v-if="isBankColumnVisible('summary')">{{ t.table.summary }}</th>
                <th v-if="isBankColumnVisible('amount')">{{ t.table.amount }}</th>
                <th v-if="isBankColumnVisible('transactionCategory')">{{ t.table.transactionCategory }}</th>
                <th v-if="isBankColumnVisible('bank')">{{ t.table.financialInstitutionBranch }}</th>
                <th v-if="isBankColumnVisible('room')">{{ roomColumnLabel }}</th>
                <th v-if="isBankColumnVisible('contract')">{{ contractColumnLabel }}</th>
                <th v-if="isBankColumnVisible('status')">{{ t.table.status }}</th>
                <th v-if="isBankColumnVisible('remark')">{{ t.table.remark }}</th>
                <th>{{ t.table.actions }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="record in paginatedRecords" :key="record.id">
                <td v-if="isBankColumnVisible('source')"><span v-if="record.sourceFileName">{{ record.sourceFileName }}</span><small v-if="sourcePosition(record)">{{ sourcePosition(record) }}</small></td>
                <td v-if="isBankColumnVisible('date')"><input v-model="record.transactionDate" type="date" @change="saveRecord(record)" /></td>
                <td v-if="isBankColumnVisible('category')"><select :value="record.withdrawalAmount ? 'expense' : 'income'" @change="changeRecordDirection(record, $event.target.value)"><option value="income">{{ t.table.deposit }}</option><option value="expense">{{ t.table.withdrawal }}</option></select></td>
                <td v-if="isBankColumnVisible('summary')">
                  <small v-if="record.originalBankSummary">{{ record.originalBankSummary }}</small>
                  <input v-model="record.normalizedBankSummary" @change="saveRecord(record)" />
                </td>
                <td v-if="isBankColumnVisible('amount')"><input :value="record.withdrawalAmount || record.depositAmount || ''" inputmode="decimal" @input="setRecordAmount(record, $event.target.value)" @change="saveRecord(record)" /></td>
                <td v-if="isBankColumnVisible('transactionCategory')"><input v-model="record.transactionCategory" @change="saveRecord(record)" /></td>
                <td v-if="isBankColumnVisible('bank')"><input v-model="record.financialInstitutionName" :placeholder="t.table.financialInstitution" @change="saveRecord(record)" /><input v-model="record.bankBranchName" :placeholder="t.table.branch" @change="saveRecord(record)" /></td>
                <td v-if="isBankColumnVisible('room')">
                  <select v-model="record.roomId" @change="loadContracts(record)">
                    <option value="">{{ t.common.select }}</option>
                    <option v-for="room in rooms" :key="room.id" :value="room.id">{{ roomOptionLabel(room) }}</option>
                  </select>
                </td>
                <td v-if="isBankColumnVisible('contract')">
                  <select v-model="record.contractId" @change="manualMatch(record)">
                    <option value="">{{ t.common.select }}</option>
                    <option v-for="contract in contractsByRecord[record.id] || []" :key="contract.id" :value="contract.id">
                      {{ contractOptionLabel(contract) }}
                    </option>
                  </select>
                </td>
                <td v-if="isBankColumnVisible('status')">
                  <span class="status-badge" :class="record.matchStatus">{{ matchStatusLabel(record) }}</span>
                  <small v-if="record.matchReason">{{ record.matchReason }}</small>
                </td>
                <td v-if="isBankColumnVisible('remark')"><textarea v-model="record.remark" rows="2" @change="saveRecord(record)" /></td>
                <td class="row-actions">
                  <button class="primary-button mini" type="button" @click="saveRecord(record)">{{ scanUi.saveRecord }}</button>
                  <button class="secondary-button mini" type="button" @click="manualMatch(record)">{{ t.action.manualMatch }}</button>
                  <button class="ghost-button mini" type="button" @click="unmatch(record)">{{ t.action.unmatch }}</button>
                  <button class="danger-button mini" type="button" :disabled="record.matchStatus === 'SUBMITTED'" @click="deleteRecord(record)">{{ scanUi.deleteRecord }}</button>
                </td>
              </tr>
              <tr v-if="!paginatedRecords.length">
                <td :colspan="visibleBankColumns.length + 1" class="empty-state">{{ t.common.noData }}</td>
              </tr>
            </tbody>
          </table>
        </DualScrollTable>
        <DataPagination
          v-model:page="recordPage"
          v-model:page-size="recordPageSize"
          :total="filteredRecords.length"
          :labels="t.pagination"
        />
      </section>
    </div>

    <div v-if="showProviderDialog" class="matching-modal-backdrop" @click.self="showProviderDialog = false">
      <section class="provider-modal" role="dialog" aria-modal="true" :aria-label="scanUi.modelSettings">
        <header class="matching-modal-header">
          <div><p class="eyebrow">AI Provider</p><h3>{{ scanUi.modelSettings }}</h3><p class="subtle">{{ scanUi.modelSettingsHelp }}</p></div>
          <button class="modal-close" type="button" @click="showProviderDialog = false">×</button>
        </header>
        <div class="provider-modal-body">
          <aside class="provider-list">
            <button type="button" class="secondary-button" @click="newProvider">{{ scanUi.newProvider }}</button>
            <button v-for="provider in aiProviders" :key="provider.id" type="button" class="provider-list-item" :class="{ active: providerForm.id === provider.id }" @click="editProvider(provider)">
              <strong>{{ provider.displayName }}</strong><small>{{ provider.providerType }} · {{ provider.modelName }}</small><span>{{ provider.enabled ? scanUi.enabled : scanUi.disabled }}<template v-if="provider.isDefault"> · {{ scanUi.defaultProvider }}</template></span>
            </button>
          </aside>
          <form class="provider-form" @submit.prevent="saveProvider">
            <label>{{ scanUi.displayName }}<input v-model.trim="providerForm.displayName" required maxlength="80" /></label>
            <label>{{ scanUi.providerType }}<select v-model="providerForm.providerType" @change="applyProviderTypeDefaults"><option value="OPENAI">OpenAI</option><option value="QWEN">Qwen / Alibaba</option><option value="DEEPSEEK">DeepSeek</option><option value="OPENAI_COMPATIBLE">OpenAI-compatible</option></select></label>
            <label>{{ scanUi.baseUrl }}<input v-model.trim="providerForm.baseUrl" required placeholder="https://api.openai.com" /></label>
            <label>{{ scanUi.apiPath }}<input v-model.trim="providerForm.apiPath" required :placeholder="providerForm.transport === 'OPENAI_CHAT_COMPLETIONS' ? '/chat/completions' : '/v1/responses'" /></label>
            <label>{{ providerForm.providerType === 'QWEN' ? scanUi.visionModelName : scanUi.modelName }}<input v-model.trim="providerForm.modelName" required :placeholder="providerForm.providerType === 'QWEN' ? 'qwen3-vl-plus' : (providerForm.providerType === 'DEEPSEEK' ? 'deepseek-v4-flash' : 'gpt-5.6-terra')" /></label>
            <label>{{ scanUi.apiKey }}<input v-model="providerForm.apiKey" type="password" :required="!providerForm.id" :placeholder="providerForm.apiKeyMasked || 'sk-…'" autocomplete="new-password" /></label>
            <div class="provider-capabilities">
              <label><input v-model="providerForm.supportsPdfInput" type="checkbox" :disabled="providerForm.providerType === 'DEEPSEEK'" />{{ scanUi.pdfCapability }}</label>
              <label><input v-model="providerForm.supportsStructuredJson" type="checkbox" :disabled="providerForm.providerType === 'QWEN'" />{{ scanUi.jsonCapability }}</label>
              <label><input v-model="providerForm.supportsJapanese" type="checkbox" />{{ scanUi.japaneseCapability }}</label>
              <label><input v-model="providerForm.enabled" type="checkbox" />{{ scanUi.enabled }}</label>
              <label><input v-model="providerForm.isDefault" type="checkbox" />{{ scanUi.defaultProvider }}</label>
            </div>
            <p v-if="providerForm.providerType === 'DEEPSEEK'" class="scan-hint">{{ scanUi.deepseekPdfNotice }}</p>
            <p v-if="providerForm.providerType === 'QWEN'" class="scan-hint">{{ scanUi.qwenPipelineNotice }}</p>
            <p v-if="providerMessage" class="scan-hint">{{ providerMessage }}</p>
            <footer class="provider-form-actions">
              <button v-if="providerForm.id" class="danger-button" type="button" @click="removeProvider">{{ scanUi.deleteProvider }}</button>
              <button v-if="providerForm.id" class="secondary-button" type="button" @click="testProvider">{{ scanUi.testConnection }}</button>
              <button class="primary-button" type="submit" :disabled="providerLoading">{{ scanUi.saveProvider }}</button>
            </footer>
          </form>
        </div>
      </section>
    </div>

    <div v-if="showMatchingDialog" class="matching-modal-backdrop" @click.self="closeMatchingDialog">
      <section class="matching-modal" role="dialog" aria-modal="true" :aria-label="ui.dialogTitle">
        <header class="matching-modal-header">
          <div><p class="eyebrow">{{ ui.dialogEyebrow }}</p><h3>{{ ui.dialogTitle }}</h3><p class="subtle">{{ ui.dialogHelp }}</p></div>
          <button class="modal-close" type="button" :aria-label="ui.cancel" @click="closeMatchingDialog">×</button>
        </header>

        <div class="template-toolbar">
          <label class="template-name-field"><span>{{ ui.templateNameLabel }}</span><input v-model.trim="templateName" type="text" maxlength="80" :placeholder="ui.templateNamePlaceholder" /></label>
          <label class="template-load-field"><span>{{ ui.loadTemplate }}</span><select v-model="selectedTemplateId" @change="loadSelectedTemplate">
            <option value="">{{ templates.length ? ui.noTemplateSelected : ui.noTemplates }}</option>
            <option v-for="template in templates" :key="template.id" :value="template.id">{{ template.name }} · v{{ template.version }}</option>
          </select></label>
          <button class="secondary-button" type="button" :disabled="!draftValid || !templateName || templateSaving" @click="saveAsTemplate">{{ templateSaving ? ui.savingTemplate : ui.saveTemplate }}</button>
          <button class="ghost-button" type="button" @click="resetConfiguration">{{ ui.reset }}</button>
          <span v-if="templateValidationMessage" class="configuration-warning">{{ templateValidationMessage }}</span>
        </div>

        <div class="matching-workspace">
          <aside class="field-library">
            <h4>{{ ui.internalFields }}</h4>
            <input v-model="fieldSearch" type="search" :placeholder="ui.searchInternal" />
            <details v-for="source in filteredFieldMetadata" :key="source.key" :open="Boolean(fieldSearch)">
              <summary><span class="source-title">{{ source.label }}</span><span class="source-count">{{ source.fields.length }}</span></summary>
              <button v-for="field in source.fields" :key="field.key" class="field-card" type="button" draggable="true" @dragstart="startFieldDrag('internal', field.key)" @click="assignSelectedField('internal', field.key)">
                <strong>{{ field.label }}</strong><code>{{ field.key }}</code>
                <small>{{ field.dataType }} · {{ field.normalizable ? ui.normalizable : ui.exactOnly }}<span v-if="field.aggregatable"> · Σ</span></small>
              </button>
            </details>
          </aside>

          <main class="rule-workspace">
            <div class="rule-workspace-title">
              <div><h4>{{ ui.ruleWorkspace }}</h4><small>{{ ui.ruleWorkspaceHelp }}</small></div>
              <button class="primary-button" type="button" @click="addRuleGroup">＋ {{ ui.addGroup }}</button>
            </div>
            <article v-for="(group, groupIndex) in draftConfiguration.groups" :key="group.id" class="rule-group-card">
              <header class="rule-group-header">
                <div class="group-identity"><span class="group-index">{{ groupIndex + 1 }}</span><input v-model="group.name" :aria-label="ui.groupName" /><span class="rule-count-badge">{{ group.rules.length }}</span></div>
                <div class="group-controls">
                  <select v-model="group.logicalOperator" :aria-label="ui.logic"><option value="AND">AND</option><option value="OR">OR</option></select>
                  <label>{{ ui.priority }} <input v-model.number="group.priority" type="number" min="1" /></label>
                  <button class="icon-text-button" type="button" @click="duplicateRuleGroup(groupIndex)">{{ ui.duplicate }}</button>
                  <button class="icon-text-button danger-text" type="button" @click="removeRuleGroup(groupIndex)">{{ t.action.delete }}</button>
                </div>
              </header>
              <div v-for="(rule, ruleIndex) in group.rules" :key="rule.id" class="mapping-rule" @click="activeRule = { groupIndex, ruleIndex }">
                <div class="rule-main-row">
                  <div class="mapping-field compact-field" @dragover.prevent @drop="dropField(groupIndex, ruleIndex, 'internal')">
                    <span>{{ ui.systemSide }}</span>
                    <div class="field-chip-box" :class="{ empty: !rule.leftFields.length }">
                      <span v-for="key in rule.leftFields" :key="key" class="mapping-chip">{{ internalFieldLabel(key) }}<button type="button" @click.stop="removeMappedField(rule, 'leftFields', key)">×</button></span>
                      <span v-if="!rule.leftFields.length" class="field-placeholder">{{ ui.noField }}</span>
                    </div>
                    <select class="field-add-select" value="" @change="appendMappedField(rule, 'leftFields', $event)"><option value="">＋ {{ ui.addInternal }}</option><option v-for="field in allInternalFields" :key="field.key" :value="field.key" :disabled="rule.leftFields.includes(field.key)">{{ field.label }} · {{ field.key }}</option></select>
                  </div>
                  <div class="mapping-comparator">
                    <select v-model="rule.operator"><option v-for="operator in operators" :key="operator.value" :value="operator.value">{{ operator.label }}</option></select>
                  </div>
                  <div class="mapping-field compact-field" @dragover.prevent @drop="dropField(groupIndex, ruleIndex, 'excel')">
                    <span>{{ ui.excelSide }}</span>
                    <div class="field-chip-box" :class="{ empty: !rule.rightFields.length }">
                      <span v-for="key in rule.rightFields" :key="key" class="mapping-chip excel-chip">{{ key }}<button type="button" @click.stop="removeMappedField(rule, 'rightFields', key)">×</button></span>
                      <span v-if="!rule.rightFields.length" class="field-placeholder">{{ ui.noField }}</span>
                    </div>
                    <select class="field-add-select" value="" @change="appendMappedField(rule, 'rightFields', $event)"><option value="">＋ {{ ui.addExcel }}</option><option v-for="header in excelHeaders" :key="header.name" :value="header.name" :disabled="rule.rightFields.includes(header.name)">{{ header.name }} · {{ header.dataType }}</option></select>
                  </div>
                  <label class="required-toggle"><input v-model="rule.required" type="checkbox" /><span></span>{{ ui.required }}</label>
                  <button class="rule-remove-button" type="button" :aria-label="t.action.delete" @click.stop="removeRule(groupIndex, ruleIndex)">×</button>
                </div>
                <details class="advanced-settings">
                  <summary>{{ ui.advanced }}<span>{{ ui.weight }} {{ rule.weight }} · {{ rule.transformations.length }} {{ ui.transformsSelected }}</span></summary>
                  <div class="advanced-content">
                    <label class="weight-control">{{ ui.weight }}<input v-model.number="rule.weight" type="range" min="0" max="100" /><output>{{ rule.weight }}</output></label>
                    <div class="transformation-options"><label v-for="transform in transformations" :key="transform.value"><input v-model="rule.transformations" type="checkbox" :value="transform.value" />{{ transform.label }}</label></div>
                  </div>
                </details>
              </div>
              <button class="add-rule-button" type="button" @click="addRule(groupIndex)">＋ {{ ui.addRule }}</button>
            </article>
            <div v-if="!draftConfiguration.groups.length" class="empty-rule-state">{{ ui.noGroups }}</div>
          </main>

          <aside class="field-library excel-library">
            <h4>{{ ui.excelFields }}</h4>
            <input v-model="excelSearch" type="search" :placeholder="ui.searchExcel" />
            <div v-for="header in filteredExcelHeaders" :key="header.name" class="field-card excel-field-card" role="button" tabindex="0" draggable="true" @dragstart="startFieldDrag('excel', header.name)" @click="assignSelectedField('excel', header.name)" @keydown.enter="assignSelectedField('excel', header.name)">
              <strong>{{ header.name }}</strong>
              <select v-model="header.dataType" @click.stop><option v-for="type in dataTypes" :key="type" :value="type">{{ type }}</option></select>
              <small>{{ ui.nonEmpty }} {{ header.nonEmptyCount }} · {{ header.examples.join(' / ') || '—' }}</small>
            </div>
          </aside>
        </div>

        <footer class="matching-modal-footer">
          <div><button class="secondary-button" type="button" :disabled="!draftValid" @click="previewRules">{{ ui.testRules }}</button><span v-if="previewResult" :class="previewResult.valid ? 'configuration-ok' : 'configuration-warning'">{{ previewResult.valid ? ui.previewPassed : `${ui.missingHeaders}: ${previewResult.missingHeaders.join(', ')}` }}</span></div>
          <div><span v-if="dialogError" class="configuration-warning">{{ dialogError }}</span><button class="ghost-button" type="button" :disabled="configurationSaving" @click="closeMatchingDialog">{{ ui.cancel }}</button><button class="primary-button" type="button" :disabled="!draftValid || configurationSaving || (templateMode === 'new' && !templateName)" @click="confirmConfiguration">{{ configurationSaving ? ui.savingConfiguration : ui.confirm }}</button></div>
        </footer>
      </section>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import DataPagination from "../components/DataPagination.vue";
import DualScrollTable from "../components/DualScrollTable.vue";
import { locale, messages } from "../i18n";
import { api } from "../services/api";
import { requestConfirm } from "../services/confirm";
import { exportTableXls, parseTableFile } from "../utils/tableFiles";

const t = computed(() => messages[locale.value].bankReconciliation);
const selectedFiles = ref([]);
const selectedPdf = ref(null);
const activeScanTask = ref(null);
const scanTasks = ref([]);
const pdfLoading = ref(false);
const showProviderDialog = ref(false);
const aiProviders = ref([]);
const providerLoading = ref(false);
const providerMessage = ref("");
let providerMessageTimer;
const emptyProviderForm = () => ({ id: "", displayName: "", providerType: "OPENAI", transport: "OPENAI_RESPONSES", baseUrl: "https://api.openai.com", apiPath: "/v1/responses", modelName: "", structuringModelName: "", structuringApiPath: "", apiKey: "", apiKeyMasked: "", supportsPdfInput: true, supportsStructuredJson: true, supportsJapanese: true, enabled: true, isDefault: false, timeoutMs: 120000, maxRetries: 2 });
const providerForm = ref(emptyProviderForm());
const batches = ref([]);
const records = ref([]);
const rooms = ref([]);
const contractsByRecord = ref({});
const activeBatchId = ref("");
const activeTab = ref("ALL");
const searchQuery = ref("");
const recordPage = ref(1);
const recordPageSize = ref(20);
const errorMessage = ref("");
const loading = ref(false);
const showColumnPanel = ref(false);
const showMatchingDialog = ref(false);
const showTemplateChooser = ref(false);
const chooserLoading = ref(false);
const chooserError = ref("");
const templateMode = ref("new");
const fieldMetadata = ref([]);
const excelHeaders = ref([]);
const templates = ref([]);
const selectedTemplateId = ref("");
const templateName = ref("");
const templateSaving = ref(false);
const configurationSaving = ref(false);
const dialogError = ref("");
const fieldSearch = ref("");
const excelSearch = ref("");
const previewResult = ref(null);
const templateValidationMessage = ref("");
let templateMessageTimer;
const activeRule = ref({ groupIndex: 0, ruleIndex: 0 });
const draggedField = ref(null);
const emptyConfiguration = () => ({ groups: [] });
const clonePlain = (value) => JSON.parse(JSON.stringify(value));
const normalizeConfigurationFields = (configuration) => {
  let source = configuration;
  if (typeof source === "string") {
    try { source = JSON.parse(source); } catch { source = emptyConfiguration(); }
  }
  const normalized = clonePlain(source || emptyConfiguration());
  normalized.groups?.forEach((group) => group.rules?.forEach((rule) => {
    rule.leftFields = (rule.leftFields || []).map((key) => key === "contract.bankTransferDescription" ? "contract.bankSummaryName" : key);
  }));
  return normalized;
};
const matchingConfiguration = ref(emptyConfiguration());
const draftConfiguration = ref(emptyConfiguration());
const bankColumns = ref([
  { key: "source", visible: true },
  { key: "date", visible: true },
  { key: "category", visible: true },
  { key: "summary", visible: true },
  { key: "amount", visible: true },
  { key: "transactionCategory", visible: true },
  { key: "bank", visible: true },
  { key: "room", visible: true },
  { key: "contract", visible: true },
  { key: "status", visible: true },
  { key: "remark", visible: true },
]);
const uploadDefaults = ["normalizedBankSummary", "depositAmount"];
const scanUi = computed(() => locale.value === "zh" ? {
  inputTitle: "银行账单来源",
  inputHelp: "选择现有 Excel/CSV，或上传银行账单 PDF 进行 AI 扫描",
  excelOption: "选择 Excel / CSV",
  pdfOption: "上传银行账单 PDF",
  uploadPdf: "校验并上传 PDF",
  uploading: "上传中…",
  aiScan: "开始 AI 扫描", retryScan: "重新扫描",
  ready: "PDF 校验完成，可以开始 AI 扫描。",
  queued: "任务已进入后台队列，可离开当前页面后再返回查看进度。",
  pendingWorker: "扫描任务基础流程已建立，正在等待银行账单 AI Provider 处理器。",
  processingPdf: "视觉模型正在读取银行账单页面并生成交易 JSON。", structuringJson: "视觉模型正在生成交易 JSON。", generatingExcel: "正在生成本地 Excel 并创建对账批次。", batchCreated: "Excel 已生成，对账批次已自动创建。",
  modelSettings: "AI 模型配置 / API Key", modelSettingsHelp: "配置银行账单 PDF 专用模型。API Key 加密后仅在后端使用。", newProvider: "新建模型", displayName: "配置名称", providerType: "Provider 类型", baseUrl: "Base URL", apiPath: "API 路径", modelName: "模型 ID", visionModelName: "视觉模型 ID", currentModel: "当前模型", apiKey: "API Key", pdfCapability: "支持 PDF 输入", jsonCapability: "支持结构化 JSON", japaneseCapability: "支持日文", qwenPipelineNotice: "千问单模型流程：后端将 PDF 页面渲染为图片，Qwen3-VL-Plus 直接读取页面并输出交易 JSON，不再调用 OCR 模型或第二个 JSON 模型。", deepseekPdfNotice: "DeepSeek 官方 Chat API 当前不支持 PDF 或图片输入，可保存并测试文本/JSON 能力，但不会被选作银行账单视觉识别模型。", enabled: "启用", disabled: "停用", defaultProvider: "默认模型", saveProvider: "保存配置", deleteProvider: "删除配置", testConnection: "测试连接", generatedFile: "已生成本地 Excel", saveRecord: "保存", deleteRecord: "删除",
} : {
  inputTitle: "銀行明細の入力元",
  inputHelp: "既存の Excel/CSV、または AI スキャン用の銀行明細 PDF を選択します",
  excelOption: "Excel / CSV を選択",
  pdfOption: "銀行明細 PDF をアップロード",
  uploadPdf: "PDF を検証してアップロード",
  uploading: "アップロード中…",
  aiScan: "AI スキャンを開始", retryScan: "再スキャン",
  ready: "PDF の検証が完了しました。AI スキャンを開始できます。",
  queued: "バックグラウンドキューに登録しました。後から進捗を確認できます。",
  pendingWorker: "銀行明細 AI Provider の処理待ちです。",
  processingPdf: "ビジョンモデルが銀行明細ページを読み取り、取引 JSON を生成しています。", structuringJson: "ビジョンモデルが取引 JSON を生成しています。", generatingExcel: "ローカル Excel を生成し、照合バッチを作成しています。", batchCreated: "Excel と照合バッチを作成しました。",
  modelSettings: "AI モデル設定", modelSettingsHelp: "銀行明細 PDF 用モデルを設定します。API Key は暗号化され、バックエンドのみで使用されます。", newProvider: "新規モデル", displayName: "設定名", providerType: "Provider 種別", baseUrl: "Base URL", apiPath: "API パス", modelName: "モデル ID", visionModelName: "ビジョンモデル ID", currentModel: "現在のモデル", apiKey: "API Key", pdfCapability: "PDF 入力対応", jsonCapability: "構造化 JSON 対応", japaneseCapability: "日本語対応", qwenPipelineNotice: "Qwen 単一モデル：バックエンドで PDF ページを画像化し、Qwen3-VL-Plus が直接読み取って取引 JSON を出力します。OCR モデルや二つ目の JSON モデルは使用しません。", deepseekPdfNotice: "DeepSeek 公式 Chat API は現在 PDF・画像入力に対応していません。テキスト/JSON 接続の保存とテストはできますが、銀行明細の画像認識モデルには選択されません。", enabled: "有効", disabled: "無効", defaultProvider: "既定モデル", saveProvider: "設定を保存", deleteProvider: "設定を削除", testConnection: "接続テスト", generatedFile: "生成済みローカル Excel", saveRecord: "保存", deleteRecord: "削除",
});
const ui = computed(() => locale.value === "zh" ? {
  selectFields: "选择匹配字段", chooseTemplate: "选择匹配模板", newTemplate: "新建模板", newTemplateHelp: "从空白规则开始并保存到数据库", currentConfiguration: "当前批次配置", loadingTemplates: "正在加载模板…", noTemplatesHint: "尚无模板，请选择“新建模板”。", ruleRequired: "执行对账前，请至少配置一个有效的匹配条件。", rulesConfigured: "条规则已配置", groups: "个规则组",
  dialogEyebrow: "AI 对账规则", dialogTitle: "选择匹配字段", dialogHelp: "将内部系统字段与上传的 Excel 列建立映射。支持一对一、一对多和多对一。",
  loadTemplate: "加载模板", noTemplateSelected: "不加载模板（使用当前配置）", noTemplates: "暂无已保存模板", templateNameLabel: "模板名称", templateNamePlaceholder: "例如：月度租金对账", saveTemplate: "保存模板", savingTemplate: "保存中…", reset: "重置配置", internalFields: "内部系统字段", excelFields: "上传的 Excel 字段", ruleWorkspace: "匹配规则工作区", ruleWorkspaceHelp: "点击字段或拖放到规则中；多选即可组合字段。",
  searchInternal: "搜索内部字段", searchExcel: "搜索 Excel 列", normalizable: "可标准化", exactOnly: "精确值", addGroup: "添加规则组", addRule: "添加规则", noGroups: "请添加一个规则组开始配置。",
  groupName: "规则组名称", logic: "组内逻辑", priority: "优先级", duplicate: "复制", systemSide: "内部字段", excelSide: "Excel 字段", weight: "权重", required: "必需", transformations: "转换规则", nonEmpty: "非空", noField: "尚未选择", addInternal: "添加内部字段", addExcel: "添加 Excel 字段", advanced: "高级设置", transformsSelected: "项转换",
  testRules: "测试匹配规则", previewPassed: "字段校验通过", missingHeaders: "缺少列", cancel: "取消", confirm: "确认配置", savingConfiguration: "保存中…", templateSaved: "模板已保存并应用到当前批次", templateUpdated: "模板已更新并应用到当前批次", templateLoadFailed: "模板列表加载失败，可继续配置并稍后重试。", configurationSaveFailed: "配置保存失败", invalidTemplate: "模板中的部分 Excel 列不存在，请重新映射。",
} : {
  selectFields: "照合フィールド選択", chooseTemplate: "照合テンプレート選択", newTemplate: "新規テンプレート", newTemplateHelp: "空のルールから作成してデータベースへ保存", currentConfiguration: "現在のバッチ設定", loadingTemplates: "テンプレート読込中…", noTemplatesHint: "テンプレートがありません。「新規テンプレート」を選択してください。", ruleRequired: "照合を実行する前に、少なくとも1つの有効な照合条件を設定してください。", rulesConfigured: "件のルール設定済み", groups: "ルールグループ",
  dialogEyebrow: "AI 照合ルール", dialogTitle: "照合フィールド選択", dialogHelp: "内部システム項目とアップロードした Excel 列を関連付けます。1対1、1対多、多対1に対応します。",
  loadTemplate: "テンプレート読込", noTemplateSelected: "テンプレートなし（現在の設定）", noTemplates: "保存済みテンプレートなし", templateNameLabel: "テンプレート名", templateNamePlaceholder: "例：月次賃料照合", saveTemplate: "テンプレート保存", savingTemplate: "保存中…", reset: "リセット", internalFields: "内部システム項目", excelFields: "Excel 項目", ruleWorkspace: "照合ルール", ruleWorkspaceHelp: "項目をクリック、またはルールへドラッグします。複数選択で項目を結合できます。",
  searchInternal: "内部項目を検索", searchExcel: "Excel 列を検索", normalizable: "正規化可", exactOnly: "完全一致", addGroup: "グループ追加", addRule: "ルール追加", noGroups: "ルールグループを追加してください。",
  groupName: "グループ名", logic: "グループ内論理", priority: "優先度", duplicate: "複製", systemSide: "内部項目", excelSide: "Excel 項目", weight: "重み", required: "必須", transformations: "変換", nonEmpty: "非空", noField: "未選択", addInternal: "内部項目を追加", addExcel: "Excel 項目を追加", advanced: "詳細設定", transformsSelected: "件の変換",
  testRules: "ルールをテスト", previewPassed: "項目検証に成功", missingHeaders: "不足列", cancel: "キャンセル", confirm: "確定", savingConfiguration: "保存中…", templateSaved: "テンプレートを保存し、このバッチに適用しました", templateUpdated: "テンプレートを更新し、このバッチに適用しました", templateLoadFailed: "テンプレート一覧を読み込めませんでした。設定は続行できます。", configurationSaveFailed: "設定の保存に失敗しました", invalidTemplate: "テンプレート内の Excel 列が不足しています。再設定してください。",
});
const roomColumnLabel = computed(() => t.value.table.room);
const contractColumnLabel = computed(() => t.value.table.contract);
const contractPartyLabel = computed(() => t.value.matching.contractParty);
const contractorLabel = computed(() => t.value.matching.contractor);
const payerLabel = computed(() => t.value.matching.payer);
const visibleBankColumns = computed(() => bankColumns.value.filter((column) => column.visible));
const isBankColumnVisible = (key) => bankColumns.value.find((column) => column.key === key)?.visible;
const bankColumnLabel = (key) => ({ source: t.value.table.source, date: t.value.table.date, category: t.value.table.category, summary: t.value.table.summary, amount: t.value.table.amount, transactionCategory: t.value.table.transactionCategory, bank: t.value.table.financialInstitutionBranch, room: roomColumnLabel.value, contract: contractColumnLabel.value, status: t.value.table.status, remark: t.value.table.remark })[key] || key;
const resetBankColumns = () => bankColumns.value.forEach((column) => { column.visible = true; });
const compactJoin = (values, separator = " / ") => values.filter((value) => value !== null && value !== undefined && value !== "").join(separator);
const sourcePosition = (record) => compactJoin([record.sourcePage, record.sourceRow]);
const roomOptionLabel = (room) => compactJoin([room.property?.name || room.propertyName, room.roomNumber]);
const contractOptionLabel = (contract) => compactJoin([
  contract.contractNo || contract.id,
  contract.contractorName ? `${contractorLabel.value}: ${contract.contractorName}` : "",
  contract.payerName ? `${payerLabel.value}: ${contract.payerName}` : "",
]);

const dataTypes = ["string", "number", "date", "month", "currency", "boolean", "unknown"];
const operators = ["equals", "not_equals", "contains", "starts_with", "ends_with", "normalized_equals", "fuzzy_equals", "regex", "greater_than", "less_than", "within_tolerance", "same_date", "same_month", "within_date_range", "matches_any", "matches_all", "first_non_empty", "concatenate", "sum_equals"].map((value) => ({ value, label: value.replaceAll("_", " ") }));
const transformations = ["trim", "remove_spaces", "full_to_half_width", "half_to_full_width", "hiragana_to_katakana", "katakana_to_hiragana", "uppercase", "lowercase", "remove_punctuation", "normalize_legal_entity", "remove_currency", "remove_commas", "to_number", "round", "absolute"].map((value) => ({ value, label: value.replaceAll("_", " ") }));
const allInternalFields = computed(() => fieldMetadata.value.flatMap((source) => source.fields));
const filteredFieldMetadata = computed(() => {
  const query = fieldSearch.value.trim().toLowerCase();
  return fieldMetadata.value.map((source) => ({ ...source, fields: source.fields.filter((field) => !query || `${field.label} ${field.key} ${field.dataType}`.toLowerCase().includes(query)) })).filter((source) => source.fields.length);
});
const filteredExcelHeaders = computed(() => {
  const query = excelSearch.value.trim().toLowerCase();
  return excelHeaders.value.filter((header) => !query || `${header.name} ${header.dataType} ${header.examples.join(" ")}`.toLowerCase().includes(query));
});
const configurationRuleCount = (configuration) => configuration.groups?.filter((group) => group.enabled !== false).flatMap((group) => group.rules || []).filter((rule) => rule.enabled !== false && rule.leftFields?.length && rule.rightFields?.length).length || 0;
const enabledRuleCount = computed(() => configurationRuleCount(matchingConfiguration.value));
const hasValidConfiguration = computed(() => enabledRuleCount.value > 0);
const draftValid = computed(() => configurationRuleCount(draftConfiguration.value) > 0);

const tabs = computed(() => [
  { key: "ALL", label: t.value.status.ALL },
  { key: "AUTO_MATCHED", label: t.value.status.AUTO_MATCHED },
  { key: "MANUAL_REVIEW", label: t.value.status.MANUAL_REVIEW },
  { key: "UNMATCHED", label: t.value.status.UNMATCHED },
  { key: "SUBMITTED", label: t.value.status.SUBMITTED },
]);

const activeBatch = computed(() => batches.value.find((batch) => batch.id === activeBatchId.value));
const stats = computed(() => [
  { key: "total", label: t.value.status.total, value: activeBatch.value?.totalRecords || 0 },
  { key: "auto", label: t.value.status.AUTO_MATCHED, value: activeBatch.value?.autoMatchedCount || 0 },
  { key: "manual", label: t.value.status.MANUAL_MATCHED, value: activeBatch.value?.manualMatchedCount || 0 },
  { key: "unmatched", label: t.value.status.UNMATCHED, value: activeBatch.value?.unmatchedCount || 0 },
  { key: "submitted", label: t.value.status.SUBMITTED, value: activeBatch.value?.submittedCount || 0 },
]);
const filteredRecords = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return records.value.filter((record) => {
    const statusMatch = activeTab.value === "ALL" || record.matchStatus === activeTab.value;
    const textMatch = !query || [record.originalBankSummary, record.normalizedBankSummary, record.contractNo, record.roomNumber, record.payerName]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
    return statusMatch && textMatch;
  });
});
const paginatedRecords = computed(() => {
  const start = (recordPage.value - 1) * recordPageSize.value;
  return filteredRecords.value.slice(start, start + recordPageSize.value);
});
const scanStageMessage = computed(() => {
  if (!activeScanTask.value) return selectedPdf.value ? scanUi.value.uploadPdf : "";
  if (activeScanTask.value.status === "READY") return scanUi.value.ready;
  if (activeScanTask.value.currentStage === "WAITING_FOR_PROVIDER_WORKER") return scanUi.value.pendingWorker;
  if (activeScanTask.value.status === "QUEUED") return scanUi.value.queued;
  if (activeScanTask.value.currentStage === "AI_VISUAL_EXTRACTION") return scanUi.value.processingPdf;
  if (activeScanTask.value.status === "OCR_RUNNING") return scanUi.value.processingPdf;
  if (activeScanTask.value.status === "GENERATING_EXCEL") return scanUi.value.generatingExcel;
  if (activeScanTask.value.status === "COMPLETED") return scanUi.value.batchCreated;
  if (activeScanTask.value.status === "FAILED") return activeScanTask.value.errorMessage || scanStatusLabel("FAILED");
  return activeScanTask.value.currentStage || scanStatusLabel(activeScanTask.value.status);
});

watch([searchQuery, activeTab, activeBatchId], () => {
  recordPage.value = 1;
});
watch(() => filteredRecords.value.length, (total) => {
  recordPage.value = Math.min(recordPage.value, Math.max(1, Math.ceil(total / recordPageSize.value)));
});

const selectFiles = (event) => {
  const files = Array.from(event.target.files || []);
  if (files.length) {
    selectedPdf.value = null;
    activeScanTask.value = null;
    selectedFiles.value.push(...files);
  }
  event.target.value = "";
};

const selectPdf = (event) => {
  const [file] = Array.from(event.target.files || []);
  event.target.value = "";
  if (!file) return;
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    errorMessage.value = locale.value === "zh" ? "请选择 PDF 文件。" : "PDF ファイルを選択してください。";
    return;
  }
  selectedFiles.value = [];
  selectedPdf.value = file;
  activeScanTask.value = null;
  errorMessage.value = "";
};

const formatFileSize = (bytes) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** unitIndex)).toFixed(unitIndex ? 1 : 0)} ${units[unitIndex]}`;
};

const scanStatusLabel = (status) => ({
  VALIDATING: locale.value === "zh" ? "校验中" : "検証中",
  READY: locale.value === "zh" ? "待扫描" : "スキャン待ち",
  DUPLICATE: locale.value === "zh" ? "重复文件" : "重複ファイル",
  QUEUED: locale.value === "zh" ? "已排队" : "キュー済み",
  PREPROCESSING: locale.value === "zh" ? "预处理中" : "前処理中",
  OCR_RUNNING: locale.value === "zh" ? "AI 扫描中" : "AI スキャン中",
  REVIEW_REQUIRED: locale.value === "zh" ? "需要复核" : "確認が必要",
  COMPLETED: locale.value === "zh" ? "已完成" : "完了",
  FAILED: locale.value === "zh" ? "失败" : "失敗",
  CANCELLED: locale.value === "zh" ? "已取消" : "キャンセル済み",
})[status] || status;

const uploadPdf = async () => {
  if (!selectedPdf.value || pdfLoading.value) return;
  pdfLoading.value = true;
  errorMessage.value = "";
  try {
    activeScanTask.value = await api.uploadBankStatementPdf(selectedPdf.value);
    selectedPdf.value = null;
    scanTasks.value = [activeScanTask.value, ...scanTasks.value.filter((item) => item.id !== activeScanTask.value.id)];
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    pdfLoading.value = false;
  }
};

const startPdfScan = async () => {
  if (!activeScanTask.value || pdfLoading.value) return;
  pdfLoading.value = true;
  errorMessage.value = "";
  try {
    activeScanTask.value = await api.startBankStatementScan(activeScanTask.value.id);
    scanTasks.value = scanTasks.value.map((item) => item.id === activeScanTask.value.id ? activeScanTask.value : item);
    void pollScanTask(activeScanTask.value.id);
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    pdfLoading.value = false;
  }
};

const loadScanTasks = async () => {
  scanTasks.value = await api.listBankStatementScans();
};

const pollScanTask = async (scanId) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1500));
    const task = await api.getBankStatementScan(scanId);
    activeScanTask.value = task;
    scanTasks.value = scanTasks.value.map((item) => item.id === scanId ? task : item);
    if (task.status === "COMPLETED") {
      await loadBatches();
      if (task.reconciliationBatchId) await selectBatch(task.reconciliationBatchId);
      return;
    }
    if (["FAILED", "CANCELLED"].includes(task.status)) {
      return;
    }
  }
};

const clearProviderMessage = () => {
  clearTimeout(providerMessageTimer);
  providerMessageTimer = undefined;
  providerMessage.value = "";
};

const showProviderMessage = (message, isError = false) => {
  clearTimeout(providerMessageTimer);
  providerMessage.value = message;
  providerMessageTimer = setTimeout(clearProviderMessage, isError ? 6000 : 3500);
};

const openProviderDialog = async () => {
  showProviderDialog.value = true;
  clearProviderMessage();
  try {
    aiProviders.value = await api.listBankStatementAiProviders();
    if (aiProviders.value[0]) editProvider(aiProviders.value[0]); else newProvider();
  } catch (error) {
    showProviderMessage(error.message, true);
  }
};

const newProvider = () => {
  providerForm.value = emptyProviderForm();
  clearProviderMessage();
};

const applyProviderTypeDefaults = () => {
  const verifiedOpenAi = providerForm.value.providerType === "OPENAI";
  const qwen = providerForm.value.providerType === "QWEN";
  const deepseek = providerForm.value.providerType === "DEEPSEEK";
  if (verifiedOpenAi) {
    providerForm.value.transport = "OPENAI_RESPONSES";
    providerForm.value.baseUrl = "https://api.openai.com";
    providerForm.value.apiPath = "/v1/responses";
    providerForm.value.modelName ||= "gpt-5.6-terra";
  }
  if (qwen) {
    providerForm.value.transport = "OPENAI_CHAT_COMPLETIONS";
    providerForm.value.apiPath = "/compatible-mode/v1/chat/completions";
    providerForm.value.modelName = "qwen3-vl-plus";
    providerForm.value.structuringModelName = "";
    providerForm.value.structuringApiPath = "";
  }
  if (deepseek) {
    providerForm.value.transport = "OPENAI_CHAT_COMPLETIONS";
    providerForm.value.baseUrl = "https://api.deepseek.com";
    providerForm.value.apiPath = "/chat/completions";
    providerForm.value.modelName = "deepseek-v4-flash";
  }
  providerForm.value.supportsPdfInput = verifiedOpenAi || qwen;
  providerForm.value.supportsStructuredJson = verifiedOpenAi || qwen || deepseek;
  providerForm.value.supportsJapanese = true;
};

const editProvider = (provider) => {
  providerForm.value = { ...emptyProviderForm(), ...provider, apiKey: "" };
  clearProviderMessage();
};

const saveProvider = async () => {
  providerLoading.value = true;
  clearProviderMessage();
  try {
    const saved = await api.saveBankStatementAiProvider(providerForm.value, providerForm.value.id);
    aiProviders.value = await api.listBankStatementAiProviders();
    editProvider(saved);
    showProviderMessage(locale.value === "zh" ? "AI 模型配置已保存。" : "AI モデル設定を保存しました。");
  } catch (error) {
    showProviderMessage(error.message, true);
  } finally {
    providerLoading.value = false;
  }
};

const testProvider = async () => {
  if (!providerForm.value.id) return;
  providerLoading.value = true;
  try {
    const result = await api.testBankStatementAiProvider(providerForm.value.id);
    showProviderMessage(`${locale.value === "zh" ? "连接成功" : "接続成功"} · ${result.latencyMs} ms · ${result.model}`);
  } catch (error) {
    showProviderMessage(error.message, true);
  } finally {
    providerLoading.value = false;
  }
};

const removeProvider = async () => {
  if (!providerForm.value.id || !await requestConfirm(locale.value === "zh" ? "确定删除该 AI 模型配置吗？" : "この AI モデル設定を削除しますか？")) return;
  providerLoading.value = true;
  try {
    await api.deleteBankStatementAiProvider(providerForm.value.id);
    aiProviders.value = await api.listBankStatementAiProviders();
    if (aiProviders.value[0]) editProvider(aiProviders.value[0]); else newProvider();
  } finally {
    providerLoading.value = false;
  }
};

const uploadRows = async () => {
  loading.value = true;
  errorMessage.value = "";
  try {
    const files = [];
    for (const file of selectedFiles.value) {
      const table = await parseTableFile(file);
      const [header = [], ...dataRows] = table;
      files.push({
        fileName: file.name,
        fileType: file.name.split(".").pop(),
        fileSize: file.size,
        rows: dataRows.map((row) => Object.fromEntries(header.map((key, index) => [key, row[index] ?? ""]))),
      });
    }
    const batch = await api.uploadBankReconciliation({ files, matchingRules: uploadDefaults });
    selectedFiles.value = [];
    await loadBatches();
    await selectBatch(batch.id);
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
};

const loadBatches = async () => {
  batches.value = await api.listReconciliationBatches();
  if (!activeBatchId.value && batches.value[0]) await selectBatch(batches.value[0].id);
};

const selectBatch = async (batchId) => {
  activeBatchId.value = batchId;
  const [batchRecords, headers] = await Promise.all([api.listReconciliationRecords(batchId), api.reconciliationBatchHeaders(batchId)]);
  records.value = batchRecords;
  excelHeaders.value = headers;
  const batch = batches.value.find((item) => item.id === batchId);
  matchingConfiguration.value = batch?.matchingRulesJson?.groups ? normalizeConfigurationFields(batch.matchingRulesJson) : emptyConfiguration();
};

const runMatch = async () => {
  if (!activeBatchId.value || !hasValidConfiguration.value) {
    errorMessage.value = ui.value.ruleRequired;
    return;
  }
  loading.value = true;
  try {
    await api.matchReconciliationBatch(activeBatchId.value, matchingConfiguration.value);
    await loadBatches();
    await selectBatch(activeBatchId.value);
  } finally {
    loading.value = false;
  }
};

const newRule = () => ({ id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, leftFields: [], operator: "equals", rightFields: [], transformations: [], weight: 50, required: true, enabled: true });
const newRuleGroup = (index = 0) => ({ id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: `Rule Group ${index + 1}`, priority: index + 1, logicalOperator: "AND", minimumScore: 80, enabled: true, rules: [newRule()] });

const loadTemplateChoices = async () => {
  chooserLoading.value = true;
  chooserError.value = "";
  try {
    const result = await api.listReconciliationTemplates();
    templates.value = Array.isArray(result) ? result : [];
  } catch (error) {
    templates.value = [];
    chooserError.value = error.message;
  } finally {
    chooserLoading.value = false;
  }
};
const toggleTemplateChooser = async () => {
  showTemplateChooser.value = !showTemplateChooser.value;
  if (showTemplateChooser.value) await loadTemplateChoices();
};
const createNewTemplate = () => {
  showTemplateChooser.value = false;
  templateMode.value = "new";
  selectedTemplateId.value = "";
  templateName.value = "";
  openMatchingDialog({ groups: [newRuleGroup()] });
};
const editCurrentConfiguration = () => {
  showTemplateChooser.value = false;
  templateMode.value = "current";
  const batch = batches.value.find((item) => item.id === activeBatchId.value);
  selectedTemplateId.value = batch?.templateId || "";
  templateName.value = batch?.template?.name || templates.value.find((item) => item.id === selectedTemplateId.value)?.name || "";
  openMatchingDialog(matchingConfiguration.value);
};
const openSavedTemplate = (template) => {
  showTemplateChooser.value = false;
  templateMode.value = "existing";
  selectedTemplateId.value = template.id;
  templateName.value = template.name;
  openMatchingDialog(template.configurationJson);
};
const clearTemplateMessage = () => {
  clearTimeout(templateMessageTimer);
  templateMessageTimer = undefined;
  templateValidationMessage.value = "";
};
const showTemplateMessage = (message, autoDismiss = false) => {
  clearTimeout(templateMessageTimer);
  templateValidationMessage.value = message;
  if (autoDismiss) templateMessageTimer = setTimeout(clearTemplateMessage, 3500);
};
const openMatchingDialog = async (initialConfiguration) => {
  if (!activeBatchId.value) return;
  loading.value = true;
  errorMessage.value = "";
  dialogError.value = "";
  try {
    const [metadataResult, headersResult] = await Promise.allSettled([
      fieldMetadata.value.length ? fieldMetadata.value : api.reconciliationFieldMetadata(),
      api.reconciliationBatchHeaders(activeBatchId.value),
    ]);
    if (metadataResult.status === "rejected") throw metadataResult.reason;
    if (headersResult.status === "rejected") throw headersResult.reason;
    fieldMetadata.value = metadataResult.value;
    excelHeaders.value = headersResult.value;
    draftConfiguration.value = normalizeConfigurationFields(initialConfiguration || { groups: [newRuleGroup()] });
    activeRule.value = { groupIndex: 0, ruleIndex: 0 };
    previewResult.value = null;
    clearTemplateMessage();
    showMatchingDialog.value = true;
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
};
const closeMatchingDialog = () => { showMatchingDialog.value = false; };
const addRuleGroup = () => { draftConfiguration.value.groups.push(newRuleGroup(draftConfiguration.value.groups.length)); activeRule.value = { groupIndex: draftConfiguration.value.groups.length - 1, ruleIndex: 0 }; };
const removeRuleGroup = (index) => { draftConfiguration.value.groups.splice(index, 1); };
const duplicateRuleGroup = (index) => {
  const copy = clonePlain(draftConfiguration.value.groups[index]);
  copy.id = `group-${Date.now()}`;
  copy.name = `${copy.name} Copy`;
  copy.priority = draftConfiguration.value.groups.length + 1;
  copy.rules.forEach((rule) => { rule.id = `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; });
  draftConfiguration.value.groups.push(copy);
};
const addRule = (groupIndex) => { draftConfiguration.value.groups[groupIndex].rules.push(newRule()); activeRule.value = { groupIndex, ruleIndex: draftConfiguration.value.groups[groupIndex].rules.length - 1 }; };
const removeRule = (groupIndex, ruleIndex) => { draftConfiguration.value.groups[groupIndex].rules.splice(ruleIndex, 1); };
const resetConfiguration = () => { draftConfiguration.value = { groups: [newRuleGroup()] }; selectedTemplateId.value = ""; templateName.value = ""; previewResult.value = null; clearTemplateMessage(); dialogError.value = ""; };
const startFieldDrag = (side, key) => { draggedField.value = { side, key }; };
const dropField = (groupIndex, ruleIndex, side) => {
  if (!draggedField.value || draggedField.value.side !== side) return;
  const target = draftConfiguration.value.groups[groupIndex].rules[ruleIndex][side === "internal" ? "leftFields" : "rightFields"];
  if (!target.includes(draggedField.value.key)) target.push(draggedField.value.key);
  activeRule.value = { groupIndex, ruleIndex };
  draggedField.value = null;
};
const assignSelectedField = (side, key) => {
  const group = draftConfiguration.value.groups[activeRule.value.groupIndex];
  const rule = group?.rules?.[activeRule.value.ruleIndex];
  if (!rule) return;
  const target = rule[side === "internal" ? "leftFields" : "rightFields"];
  if (!target.includes(key)) target.push(key);
};
const internalFieldLabel = (key) => {
  if (key === "contract.bankStatementSummary") return locale.value === "zh" ? "银行账单摘要" : "銀行明細摘要";
  return allInternalFields.value.find((field) => field.key === key)?.label || (key === "contract.bankTransferDescription" ? (locale.value === "zh" ? "银行摘要名义" : "銀行摘要名義") : key);
};
const appendMappedField = (rule, targetKey, event) => {
  const value = event.target.value;
  if (value && !rule[targetKey].includes(value)) rule[targetKey].push(value);
  event.target.value = "";
};
const removeMappedField = (rule, targetKey, value) => {
  rule[targetKey] = rule[targetKey].filter((item) => item !== value);
};
const previewRules = async () => {
  dialogError.value = "";
  try {
    previewResult.value = await api.previewReconciliationConfiguration(activeBatchId.value, draftConfiguration.value);
  } catch (error) {
    dialogError.value = error.message;
  }
};
const missingDraftHeaders = () => {
  const available = new Set(excelHeaders.value.map((header) => header.name));
  return [...new Set(draftConfiguration.value.groups.flatMap((group) => group.rules || []).flatMap((rule) => rule.rightFields || []).filter((name) => !available.has(name)))];
};
const updateCurrentBatchTemplate = (template) => {
  const batch = batches.value.find((item) => item.id === activeBatchId.value);
  if (!batch) return;
  batch.matchingRulesJson = clonePlain(draftConfiguration.value);
  batch.templateId = template?.id || null;
  batch.template = template ? { id: template.id, name: template.name, version: template.version } : null;
};
const confirmConfiguration = async () => {
  if (!draftValid.value) return;
  dialogError.value = "";
  const missingHeaders = missingDraftHeaders();
  if (missingHeaders.length) {
    previewResult.value = { valid: false, missingHeaders };
    return;
  }
  configurationSaving.value = true;
  try {
    let selectedTemplate = templates.value.find((item) => item.id === selectedTemplateId.value);
    if (templateMode.value === "new") {
      selectedTemplate = await api.createReconciliationTemplate({ name: templateName.value.trim(), configuration: draftConfiguration.value });
      templates.value.unshift(selectedTemplate);
      selectedTemplateId.value = selectedTemplate.id;
      templateMode.value = "existing";
    }
    await api.saveReconciliationConfiguration(activeBatchId.value, draftConfiguration.value, selectedTemplateId.value);
    matchingConfiguration.value = clonePlain(draftConfiguration.value);
    updateCurrentBatchTemplate(selectedTemplate);
    showMatchingDialog.value = false;
    await loadBatches();
  } catch (error) {
    dialogError.value = `${ui.value.configurationSaveFailed}: ${error.message}`;
  } finally {
    configurationSaving.value = false;
  }
};
const saveAsTemplate = async () => {
  const name = templateName.value.trim();
  if (!name || !draftValid.value) return;
  templateSaving.value = true;
  dialogError.value = "";
  clearTemplateMessage();
  try {
    const selected = templates.value.find((item) => item.id === selectedTemplateId.value);
    const isUpdate = selected?.name === name;
    const template = isUpdate
      ? await api.updateReconciliationTemplate(selected.id, { name, configuration: draftConfiguration.value })
      : await api.createReconciliationTemplate({ name, configuration: draftConfiguration.value });
    if (isUpdate) templates.value.splice(templates.value.findIndex((item) => item.id === template.id), 1, template);
    else templates.value.unshift(template);
    selectedTemplateId.value = template.id;
    templateName.value = template.name;
    templateMode.value = "existing";
    await api.saveReconciliationConfiguration(activeBatchId.value, draftConfiguration.value, template.id);
    matchingConfiguration.value = clonePlain(draftConfiguration.value);
    updateCurrentBatchTemplate(template);
    showTemplateMessage(isUpdate ? ui.value.templateUpdated : ui.value.templateSaved, true);
  } catch (error) {
    dialogError.value = error.message;
  } finally {
    templateSaving.value = false;
  }
};
const loadSelectedTemplate = async () => {
  clearTemplateMessage();
  dialogError.value = "";
  const template = templates.value.find((item) => item.id === selectedTemplateId.value);
  if (!template) {
    templateName.value = "";
    templateMode.value = "new";
    return;
  }
  templateMode.value = "existing";
  templateName.value = template.name;
  draftConfiguration.value = normalizeConfigurationFields(template.configurationJson);
  if (!draftConfiguration.value.groups?.length) {
    dialogError.value = ui.value.templateLoadFailed;
    return;
  }
  const available = new Set(excelHeaders.value.map((header) => header.name));
  const missing = draftConfiguration.value.groups.flatMap((group) => group.rules || []).flatMap((rule) => rule.rightFields || []).filter((name) => !available.has(name));
  if (missing.length) showTemplateMessage(`${ui.value.invalidTemplate} ${[...new Set(missing)].join(", ")}`);
};

const submitBatch = async () => {
  if (!activeBatchId.value) return;
  loading.value = true;
  try {
    await api.submitReconciliationBatch(activeBatchId.value);
    await loadBatches();
    await selectBatch(activeBatchId.value);
  } finally {
    loading.value = false;
  }
};

const deleteBatch = async (batchId) => {
  if (!batchId || !await requestConfirm(t.value.history.deleteConfirm)) return;
  loading.value = true;
  try {
    await api.deleteReconciliationBatch(batchId);
    if (activeBatchId.value === batchId) {
      activeBatchId.value = "";
      records.value = [];
    }
    await loadBatches();
  } finally {
    loading.value = false;
  }
};

const exportFinalResult = async () => {
  const rows = await api.exportReconciliationExcel(activeBatchId.value);
  exportTableXls(`bank-reconciliation-${activeBatch.value?.batchNo || activeBatchId.value}.xls`, [
    { key: "propertyName", label: t.value.table.property || "Property Name" },
    { key: "roomNumber", label: t.value.matching.room },
    { key: "contractId", label: t.value.matching.contract },
    { key: "contractorName", label: contractorLabel.value },
    { key: "payerName", label: payerLabel.value },
    { key: "originalBankSummary", label: t.value.table.summary },
    { key: "withdrawalAmount", label: t.value.table.withdrawal },
    { key: "depositAmount", label: t.value.table.deposit },
    { key: "transactionCategory", label: t.value.table.transactionCategory },
    { key: "financialInstitutionName", label: t.value.table.financialInstitution },
    { key: "bankBranchName", label: t.value.table.branch },
    { key: "paymentMonth", label: t.value.matching.month },
    { key: "transactionDate", label: t.value.table.date },
    { key: "matchStatus", label: t.value.table.status },
    { key: "matchMode", label: "Match Method" },
    { key: "bankTransactionId", label: "Bank Transaction ID" },
    { key: "targetRecordId", label: "Linked Database Record ID" },
    { key: "feeType", label: "Fee Type" },
    { key: "remark", label: t.value.table.remark },
  ], rows);
};

const exportUnmatchedJson = async () => {
  const rows = await api.exportReconciliationUnmatchedJson(activeBatchId.value);
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `bank-reconciliation-unmatched-${activeBatch.value?.batchNo || activeBatchId.value}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const saveRecord = async (record) => {
  errorMessage.value = "";
  try {
    await api.updateReconciliationRecord(record.id, {
      transactionDate: record.transactionDate,
      depositAmount: record.depositAmount,
      withdrawalAmount: record.withdrawalAmount,
      normalizedBankSummary: record.normalizedBankSummary,
      transactionCategory: record.transactionCategory,
      financialInstitutionName: record.financialInstitutionName,
      bankBranchName: record.bankBranchName,
      paymentMonth: record.paymentMonth,
      remark: record.remark,
    });
  } catch (error) {
    errorMessage.value = error.message;
  }
};

const setRecordAmount = (record, value) => {
  if (record.withdrawalAmount !== null && record.withdrawalAmount !== undefined && record.withdrawalAmount !== "") record.withdrawalAmount = value;
  else record.depositAmount = value;
};
const changeRecordDirection = (record, direction) => {
  const amount = record.withdrawalAmount || record.depositAmount || "";
  record.withdrawalAmount = direction === "expense" ? amount : "";
  record.depositAmount = direction === "income" ? amount : "";
  saveRecord(record);
};

const deleteRecord = async (record) => {
  const message = locale.value === "zh" ? "确定删除这条银行账单记录吗？" : "この銀行明細レコードを削除しますか？";
  if (!await requestConfirm(message)) return;
  try {
    await api.deleteReconciliationRecord(record.id);
    await Promise.all([selectBatch(activeBatchId.value), loadBatches()]);
  } catch (error) {
    errorMessage.value = error.message;
  }
};

const loadContracts = async (record) => {
  if (!record.roomId) return;
  contractsByRecord.value[record.id] = await api.reconciliationContracts(record.roomId, record.transactionDate);
};

const manualMatch = async (record) => {
  if (!record.contractId) return;
  const contracts = contractsByRecord.value[record.id] || await api.reconciliationContracts(record.roomId, record.transactionDate);
  const contract = contracts.find((item) => item.id === record.contractId);
  await api.manualMatchReconciliationRecord(record.id, {
    contractId: record.contractId,
    roomId: record.roomId || contract?.roomId,
    propertyId: contract?.propertyId,
    contractorId: contract?.contractorId,
    contractorName: contract?.contractorName,
    payerId: contract?.payerId,
    payerName: contract?.payerName,
    normalizedBankSummary: record.normalizedBankSummary,
    depositAmount: record.depositAmount,
    withdrawalAmount: record.withdrawalAmount,
    transactionDate: record.transactionDate,
    transactionCategory: record.transactionCategory,
    financialInstitutionName: record.financialInstitutionName,
    bankBranchName: record.bankBranchName,
    paymentMonth: record.paymentMonth,
    remark: record.remark,
  });
  await selectBatch(activeBatchId.value);
};

const unmatch = async (record) => {
  await api.unmatchReconciliationRecord(record.id);
  await selectBatch(activeBatchId.value);
};

const statusLabel = (status) => t.value.status[status] || status;
const matchStatusLabel = (record) => record.matchStatus === "AUTO_MATCHED" ? "100%" : statusLabel(record.matchStatus);

onMounted(async () => {
  await Promise.all([
    api.reconciliationRooms().then((items) => { rooms.value = items; }),
    loadBatches(),
    loadScanTasks(),
  ]);
});
onBeforeUnmount(() => {
  clearProviderMessage();
  clearTemplateMessage();
});
</script>

<style scoped>
.bank-reconciliation-page {
  display: grid;
  gap: 18px;
}

.input-choice-bar,
.input-choice-actions,
.pdf-scan-summary,
.pdf-scan-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.input-choice-bar {
  justify-content: space-between;
  margin-bottom: 14px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line);
}

.input-choice-bar .eyebrow { margin: 0 0 4px; }
.input-choice-actions .file-button { margin: 0; }
.pdf-file-button { border-color: #99c9c3; color: #0f766e; }

.pdf-scan-panel {
  margin-bottom: 14px;
  padding: 14px;
  border: 1px solid #b9ded9;
  border-radius: 10px;
  background: #f0fdfa;
}

.pdf-scan-summary { justify-content: space-between; }
.pdf-scan-summary small { display: block; margin-top: 4px; color: #64748b; }
.scan-hint { margin: 8px 0 0; color: #475569; font-size: 12px; }
.scan-progress-track { height: 5px; margin-top: 12px; overflow: hidden; border-radius: 99px; background: #dcebea; }
.scan-progress-track span { display: block; height: 100%; border-radius: inherit; background: var(--primary); transition: width .2s ease; }
.file-step-status { display: inline-flex; align-items: center; color: #475569; background: #f8fafc; }
.generated-file-result { margin: 10px 0 0; color: #0f766e; }

.provider-modal { width: min(980px, 94vw); max-height: 90vh; overflow: hidden; border-radius: 12px; background: #fff; box-shadow: 0 28px 80px rgba(15, 23, 42, .28); }
.provider-modal-body { display: grid; grid-template-columns: 280px minmax(0, 1fr); min-height: 520px; max-height: calc(90vh - 86px); }
.provider-list { display: grid; align-content: start; gap: 8px; overflow: auto; padding: 16px; border-right: 1px solid var(--line); background: #f8fafc; }
.provider-list-item { display: grid; gap: 4px; padding: 11px; border: 1px solid #dce5ed; border-radius: 8px; background: #fff; color: #334155; text-align: left; cursor: pointer; }
.provider-list-item.active { border-color: var(--primary); box-shadow: 0 0 0 2px rgba(13, 128, 119, .1); }
.provider-list-item small, .provider-list-item span { color: #64748b; }
.provider-form { display: grid; align-content: start; grid-template-columns: 1fr 1fr; gap: 14px; overflow: auto; padding: 20px; }
.provider-form > label { display: grid; gap: 6px; color: #475569; font-size: 12px; font-weight: 700; }
.provider-form > label:nth-of-type(1), .provider-form > label:nth-of-type(3), .provider-form > label:nth-of-type(6), .provider-capabilities, .provider-form > .scan-hint, .provider-form-actions { grid-column: 1 / -1; }
.provider-capabilities, .provider-form-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.provider-capabilities label { display: flex; align-items: center; gap: 5px; color: #475569; font-size: 12px; }
.provider-capabilities input { width: auto; }
.provider-form-actions { justify-content: flex-end; padding-top: 8px; }

.page-title-row,
.toolbar,
.table-head,
.tabs,
.row-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.page-title-row {
  align-items: flex-end;
}

.records-table-tools {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: min(100%, 420px);
}

.records-table-tools .search-input {
  min-width: 220px;
}

.records-table-tools .column-panel-container {
  flex: 0 0 auto;
}

.table-wrapper td > small {
  display: block;
  margin-top: 4px;
  color: var(--muted);
}

.subtle {
  color: var(--muted);
}

.panel-card,
.stat-card {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 18px;
  box-shadow: 0 8px 30px rgba(25, 37, 70, 0.04);
}

.toolbar,
.file-list {
  flex-wrap: wrap;
}

.toolbar {
  align-items: flex-start;
}

.workflow-actions,
.toolbar-exports {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.matching-entry { position: relative; }
.button-caret { margin-left: 5px; font-size: 10px; }
.template-chooser {
  position: absolute;
  top: calc(100% + 7px);
  left: 0;
  z-index: 50;
  width: 310px;
  max-height: 360px;
  overflow-y: auto;
  padding: 7px;
  border: 1px solid #d8e1ea;
  border-radius: 9px;
  background: #fff;
  box-shadow: 0 16px 38px rgba(15, 23, 42, .16);
}
.template-chooser-title { padding: 7px 9px; color: #64748b; font-size: 11px; font-weight: 750; }
.template-choice { display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 7px; width: 100%; padding: 9px; border: 0; border-radius: 6px; background: transparent; color: #1e293b; text-align: left; cursor: pointer; }
.template-choice:hover { background: #f0fdfa; }
.template-choice > span { display: grid; width: 24px; height: 24px; place-items: center; border-radius: 6px; background: #edf5f4; color: #0f766e; font-weight: 800; }
.template-choice div { display: grid; gap: 2px; min-width: 0; }
.template-choice strong { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.template-choice small { color: #94a3b8; font-size: 10px; }
.new-choice { margin-bottom: 4px; border-bottom: 1px solid #edf1f5; border-radius: 6px 6px 0 0; }
.template-chooser-state, .template-chooser-error { padding: 9px; color: #94a3b8; font-size: 11px; }
.template-chooser-error { color: #b45309; }

.toolbar-exports {
  margin-left: auto;
}

.step-button {
  min-width: 86px;
  justify-content: center;
}

.step-arrow {
  color: var(--primary);
  font-size: 22px;
  font-weight: 900;
  line-height: 1;
}

.file-button {
  position: relative;
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  padding: 0 14px;
  border-radius: 8px;
  background: var(--primary);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.file-button input {
  display: none;
}

.primary-button,
.secondary-button,
.ghost-button {
  min-height: 36px;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0 12px;
  font-weight: 700;
  cursor: pointer;
}

.primary-button {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.secondary-button,
.ghost-button {
  background: #fff;
  color: #1f2937;
}

.mini {
  min-height: 30px;
  font-size: 12px;
}

.file-list {
  display: flex;
  gap: 12px;
  margin-top: 14px;
}

.rule-panel {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px 16px;
  align-items: center;
  margin-top: 16px;
}

.rule-panel > strong {
  white-space: nowrap;
}

.rule-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  gap: 10px;
  min-width: 0;
}

.rule-option {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid #d8e1ea;
  border-radius: 8px;
  background: #f8fafc;
  color: #475569;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease, color 0.18s ease;
}

.rule-option:hover {
  border-color: color-mix(in srgb, var(--primary) 45%, #d8e1ea);
  background: #f2fbf9;
}

.rule-option.checked {
  border-color: var(--primary);
  background: #eefaf8;
  color: #0f766e;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary) 22%, transparent);
}

.rule-option input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.rule-check {
  position: relative;
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
  border: 1.5px solid #b8c5d4;
  border-radius: 5px;
  background: #fff;
  transition: border-color 0.18s ease, background 0.18s ease;
}

.rule-option.checked .rule-check {
  border-color: var(--primary);
  background: var(--primary);
}

.rule-option.checked .rule-check::after {
  content: "";
  position: absolute;
  left: 5px;
  top: 2px;
  width: 5px;
  height: 9px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.rule-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-list span,
.status-badge {
  border-radius: 999px;
  padding: 4px 9px;
  background: #f1f5f9;
  font-size: 12px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}

.stat-card span {
  color: var(--muted);
  font-size: 12px;
}

.stat-card strong {
  display: block;
  margin-top: 6px;
  font-size: 24px;
}

.content-grid {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 16px;
}

.batch-panel {
  align-self: start;
}

.batch-row {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: stretch;
  margin-top: 8px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  text-align: left;
}

.batch-row.active {
  border-color: var(--primary);
  background: #eefaf8;
}

.batch-select {
  display: grid;
  gap: 5px;
  min-width: 0;
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}

.batch-delete {
  align-self: center;
  white-space: nowrap;
}

.tabs {
  justify-content: flex-start;
}

.tabs button {
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  padding: 8px 4px;
  cursor: pointer;
}

.tabs button.active {
  border-bottom-color: var(--primary);
  color: var(--primary);
  font-weight: 800;
}

.search-input,
input,
select,
textarea {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 8px;
}

.table-wrapper {
  overflow: auto;
}

table {
  width: 100%;
  min-width: 1240px;
  border-collapse: collapse;
}

th,
td {
  border-bottom: 1px solid var(--line);
  padding: 10px;
  text-align: left;
  vertical-align: top;
}

th {
  position: sticky;
  top: 0;
  background: #fff;
  color: var(--muted);
  font-size: 12px;
}

td small {
  display: block;
  color: var(--muted);
  margin-top: 4px;
}

.AUTO_MATCHED,
.SUBMITTED {
  background: #e8f9ee;
  color: #177b3f;
}

.MANUAL_REVIEW,
.UNMATCHED {
  background: #fff4d6;
  color: #996400;
}

.FAILED {
  background: #ffe9e9;
  color: #c63a3a;
}

.empty-state {
  color: var(--muted);
  text-align: center;
}

.form-error {
  color: #c63a3a;
}

.rule-summary-panel {
  grid-template-columns: auto minmax(0, 1fr);
  min-height: 46px;
}

.configuration-ok { color: #0f766e; font-weight: 700; }
.configuration-warning { color: #b45309; font-weight: 700; }

.matching-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.52);
}

.matching-modal {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  width: min(1540px, 96vw);
  height: min(900px, 94vh);
  overflow: hidden;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.28);
}

.matching-modal-header,
.matching-modal-footer,
.template-toolbar,
.rule-workspace-title,
.rule-group-card > header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.matching-modal-header {
  justify-content: space-between;
  padding: 16px 20px 14px;
  border-bottom: 1px solid var(--line);
  background: #fff;
}

.matching-modal-header h3,
.matching-workspace h4 { margin: 0; }
.matching-modal-header .subtle { margin: 4px 0 0; }
.modal-close { border: 0; background: transparent; color: #64748b; font-size: 30px; cursor: pointer; }

.template-toolbar {
  display: grid;
  grid-template-columns: minmax(190px, 280px) minmax(220px, 340px) auto auto minmax(0, 1fr);
  padding: 10px 16px;
  border-bottom: 1px solid var(--line);
  background: #fff;
}

.template-name-field,
.template-load-field { display: grid; gap: 4px; min-width: 0; }
.template-name-field > span,
.template-load-field > span { color: #64748b; font-size: 10px; font-weight: 700; }
.template-toolbar input,
.template-toolbar select { width: 100%; min-height: 36px; }
.template-toolbar .configuration-warning { align-self: end; padding-bottom: 7px; font-size: 12px; }

.matching-workspace {
  display: grid;
  grid-template-columns: 260px minmax(600px, 1fr) 280px;
  min-height: 0;
  overflow: hidden;
}

.field-library,
.rule-workspace {
  min-width: 0;
  overflow: auto;
  padding: 14px;
}

.field-library { background: #fff; }
.field-library:first-child { border-right: 1px solid var(--line); }
.excel-library { border-left: 1px solid var(--line); }
.field-library > input { margin: 10px 0 12px; }
.field-library details { margin-bottom: 4px; }
.field-library summary {
  display: flex;
  align-items: center;
  min-height: 38px;
  padding: 0 8px;
  border-radius: 6px;
  color: #334155;
  font-size: 13px;
  font-weight: 750;
  cursor: pointer;
  list-style: none;
}
.field-library summary::-webkit-details-marker { display: none; }
.field-library summary::before { content: "›"; margin-right: 8px; color: #94a3b8; font-size: 18px; transition: transform .16s ease; }
.field-library details[open] summary::before { transform: rotate(90deg); }
.field-library summary:hover { background: #f1f5f9; }
.source-title { flex: 1; }
.source-count { min-width: 22px; color: #94a3b8; font-size: 11px; text-align: right; }
.field-library details[open] { margin-bottom: 8px; }
.field-library details[open] > .field-card { margin-left: 14px; width: calc(100% - 14px); }

.field-card {
  display: grid;
  gap: 3px;
  width: 100%;
  margin-bottom: 3px;
  padding: 7px 9px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: #fff;
  color: #1e293b;
  text-align: left;
  cursor: grab;
}
.field-card:hover { border-color: #b9ded9; background: #f0fdfa; }
.field-card code { overflow: hidden; color: #0f766e; font-size: 11px; text-overflow: ellipsis; }
.field-card small { color: var(--muted); }
.excel-field-card { grid-template-columns: minmax(0, 1fr) 82px; align-items: center; margin-bottom: 5px; border-color: #e2e8f0; }
.excel-field-card small { grid-column: 1 / -1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.excel-field-card select { padding: 5px; font-size: 11px; }

.rule-workspace { background: #f8fafc; }
.rule-workspace-title { justify-content: space-between; margin-bottom: 10px; }
.rule-group-card { margin-bottom: 10px; overflow: hidden; border: 1px solid #dce5ed; border-radius: 8px; background: #fff; }
.rule-group-header { justify-content: space-between; min-height: 48px; padding: 7px 10px; border-bottom: 1px solid #edf1f5; }
.group-identity, .group-controls { display: flex; align-items: center; gap: 8px; }
.group-identity { min-width: 0; flex: 1; }
.group-index { display: grid; flex: 0 0 24px; height: 24px; place-items: center; border-radius: 50%; background: #e8f6f4; color: #0f766e; font-size: 12px; font-weight: 800; }
.group-identity input { min-width: 110px; max-width: 300px; border-color: transparent; background: transparent; font-weight: 750; }
.group-identity input:hover, .group-identity input:focus { border-color: #cbd5e1; background: #fff; }
.rule-count-badge { padding: 2px 7px; border-radius: 999px; background: #f1f5f9; color: #64748b; font-size: 11px; }
.group-controls select { width: 72px; padding: 6px; }
.group-controls label { display: flex; align-items: center; gap: 5px; color: var(--muted); font-size: 11px; }
.group-controls label input { width: 48px; padding: 6px; }
.icon-text-button { border: 0; padding: 6px; background: transparent; color: #475569; font-size: 12px; cursor: pointer; }
.icon-text-button:hover { color: var(--primary); }
.danger-text, .icon-text-button.danger-text:hover { color: #c2413a; }

.mapping-rule {
  margin: 8px 10px;
  border: 1px solid #e5ebf0;
  border-radius: 7px;
  background: #fff;
}
.mapping-rule:focus-within { border-color: var(--primary); box-shadow: 0 0 0 2px rgba(13, 128, 119, 0.1); }
.rule-main-row { display: grid; grid-template-columns: minmax(180px, 1fr) 126px minmax(180px, 1fr) auto 28px; gap: 8px; align-items: end; padding: 9px; }
.mapping-field > span { display: block; margin-bottom: 5px; color: var(--muted); font-size: 11px; font-weight: 700; }
.field-chip-box { display: flex; min-height: 34px; align-items: center; gap: 4px; overflow-x: auto; padding: 4px; border: 1px solid #d9e2ea; border-radius: 6px 6px 0 0; background: #fff; }
.field-chip-box.empty { color: #94a3b8; }
.mapping-chip { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 4px; max-width: 180px; padding: 3px 6px; border-radius: 4px; background: #eaf7f5; color: #0f766e; font-size: 11px; white-space: nowrap; }
.mapping-chip.excel-chip { background: #eef4fb; color: #315d87; }
.mapping-chip button { border: 0; padding: 0; background: transparent; color: inherit; cursor: pointer; }
.field-placeholder { padding-left: 4px; font-size: 11px; }
.field-add-select { border-top: 0; border-radius: 0 0 6px 6px; padding: 5px 7px; color: #64748b; font-size: 11px; }
.mapping-comparator { align-self: center; padding-top: 16px; }
.mapping-comparator select { font-size: 12px; }
.required-toggle { display: flex; align-items: center; gap: 5px; height: 34px; color: #475569; font-size: 11px; white-space: nowrap; }
.required-toggle input { position: absolute; opacity: 0; pointer-events: none; }
.required-toggle span { position: relative; width: 28px; height: 16px; border-radius: 999px; background: #cbd5e1; transition: .16s ease; }
.required-toggle span::after { content: ""; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: #fff; transition: .16s ease; }
.required-toggle input:checked + span { background: var(--primary); }
.required-toggle input:checked + span::after { transform: translateX(12px); }
.rule-remove-button { align-self: end; width: 28px; height: 34px; border: 0; background: transparent; color: #94a3b8; font-size: 18px; cursor: pointer; }
.rule-remove-button:hover { color: #c2413a; }
.advanced-settings { border-top: 1px solid #f0f3f6; }
.advanced-settings > summary { display: flex; justify-content: space-between; padding: 7px 10px; color: #64748b; font-size: 11px; cursor: pointer; list-style: none; }
.advanced-settings > summary::-webkit-details-marker { display: none; }
.advanced-settings > summary::before { content: "›"; margin-right: 6px; }
.advanced-settings[open] > summary::before { transform: rotate(90deg); }
.advanced-settings > summary > span { margin-left: auto; color: #94a3b8; }
.advanced-content { display: grid; grid-template-columns: 190px 1fr; gap: 12px; padding: 4px 10px 10px; }
.weight-control { display: grid; grid-template-columns: auto 1fr 30px; align-items: center; gap: 7px; color: #64748b; font-size: 11px; }
.weight-control input { padding: 0; }
.transformation-options { display: flex; flex-wrap: wrap; gap: 5px 10px; }
.transformation-options label { display: flex; align-items: center; gap: 4px; color: #475569; font-size: 10px; }
.transformation-options input { width: auto; }
.add-rule-button { width: calc(100% - 20px); margin: 0 10px 10px; border: 1px dashed #b7c5d1; border-radius: 6px; padding: 7px; background: transparent; color: #0f766e; cursor: pointer; }
.empty-rule-state { display: grid; min-height: 220px; place-items: center; border: 1px dashed #cbd5e1; border-radius: 10px; color: var(--muted); }

.matching-modal-footer {
  justify-content: space-between;
  padding: 14px 20px;
  border-top: 1px solid var(--line);
  background: #fff;
}
.matching-modal-footer > div { display: flex; align-items: center; gap: 10px; }
.matching-modal-footer .primary-button { margin-left: 8px; }

button:disabled { cursor: not-allowed; opacity: 0.5; }

@media (max-width: 960px) {
  .input-choice-bar,
  .pdf-scan-summary { align-items: stretch; flex-direction: column; }
  .input-choice-actions,
  .pdf-scan-actions { flex-wrap: wrap; }
  .provider-modal-body { grid-template-columns: 1fr; overflow: auto; }
  .provider-list { max-height: 180px; border-right: 0; border-bottom: 1px solid var(--line); }
  .provider-form { grid-template-columns: 1fr; overflow: visible; }
  .provider-form > * { grid-column: 1 !important; }
  .stats-grid,
  .content-grid {
    grid-template-columns: 1fr;
  }

  .toolbar,
  .toolbar-exports {
    align-items: stretch;
    width: 100%;
  }

  .toolbar-exports {
    margin-left: 0;
  }

  .records-table-tools {
    width: 100%;
    min-width: 0;
  }

  .matching-modal-backdrop { padding: 8px; }
  .template-toolbar { grid-template-columns: 1fr 1fr auto; }
  .template-toolbar .configuration-warning { grid-column: 1 / -1; }
  .matching-workspace { grid-template-columns: 230px minmax(480px, 1fr) 240px; overflow: auto; }
  .rule-main-row { grid-template-columns: 1fr; }
  .mapping-comparator { padding-top: 0; }
  .advanced-content { grid-template-columns: 1fr; }
}
</style>
