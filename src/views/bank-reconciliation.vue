<template>
  <section class="page-shell bank-reconciliation-page">
    <div class="page-title-row">
      <div>
        <p class="eyebrow">{{ t.menu.aiReconciliation }}</p>
        <h2>{{ t.menu.bankReconciliation }}</h2>
        <p class="subtle">{{ t.help.subtitle }}</p>
      </div>
      <button class="secondary-button" type="button" @click="loadBatches">{{ t.action.refresh }}</button>
    </div>

    <div class="panel-card">
      <div class="toolbar">
        <div class="workflow-actions">
          <label class="file-button step-button">
            {{ selectedFiles.length ? t.action.addFiles : t.action.upload }}
            <input ref="fileInput" type="file" multiple accept=".csv,.tsv,.txt,.html,.xls,.xlsx" @change="selectFiles" />
          </label>
          <span class="step-arrow" aria-hidden="true">→</span>
          <button class="primary-button step-button" type="button" :disabled="!selectedFiles.length || loading" @click="uploadRows">{{ t.action.createBatch }}</button>
          <span class="step-arrow" aria-hidden="true">→</span>
          <button class="primary-button step-button" type="button" :disabled="!activeBatchId || loading" @click="openMatchingDialog">{{ ui.selectFields }}</button>
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
        <button class="secondary-button" type="button" :disabled="!activeBatchId" @click="openMatchingDialog">{{ ui.configure }}</button>
      </div>

      <div v-if="selectedFiles.length" class="file-list">
        <span v-for="file in selectedFiles" :key="file.name">{{ file.name }}</span>
      </div>
      <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>
      <p v-if="loading" class="form-hint">{{ t.common.loading }}</p>
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
                <th v-if="isBankColumnVisible('summary')">{{ t.table.summary }}</th>
                <th v-if="isBankColumnVisible('amount')">{{ t.table.amount }}</th>
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
                <td v-if="isBankColumnVisible('summary')">
                  <small v-if="record.originalBankSummary">{{ record.originalBankSummary }}</small>
                  <input v-model="record.normalizedBankSummary" @change="saveRecord(record)" />
                </td>
                <td v-if="isBankColumnVisible('amount')"><input v-model="record.depositAmount" inputmode="decimal" @change="saveRecord(record)" /></td>
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
                  <button class="secondary-button mini" type="button" @click="manualMatch(record)">{{ t.action.manualMatch }}</button>
                  <button class="ghost-button mini" type="button" @click="unmatch(record)">{{ t.action.unmatch }}</button>
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

    <div v-if="showMatchingDialog" class="matching-modal-backdrop" @click.self="closeMatchingDialog">
      <section class="matching-modal" role="dialog" aria-modal="true" :aria-label="ui.dialogTitle">
        <header class="matching-modal-header">
          <div><p class="eyebrow">{{ ui.dialogEyebrow }}</p><h3>{{ ui.dialogTitle }}</h3><p class="subtle">{{ ui.dialogHelp }}</p></div>
          <button class="modal-close" type="button" :aria-label="ui.cancel" @click="closeMatchingDialog">×</button>
        </header>

        <div class="template-toolbar">
          <select v-model="selectedTemplateId" @change="loadSelectedTemplate">
            <option value="">{{ ui.loadTemplate }}</option>
            <option v-for="template in templates" :key="template.id" :value="template.id">{{ template.name }} · v{{ template.version }}</option>
          </select>
          <button class="secondary-button" type="button" :disabled="!draftValid" @click="saveAsTemplate">{{ ui.saveTemplate }}</button>
          <button class="ghost-button" type="button" @click="resetConfiguration">{{ ui.reset }}</button>
          <span v-if="templateValidationMessage" class="configuration-warning">{{ templateValidationMessage }}</span>
        </div>

        <div class="matching-workspace">
          <aside class="field-library">
            <h4>{{ ui.internalFields }}</h4>
            <input v-model="fieldSearch" type="search" :placeholder="ui.searchInternal" />
            <details v-for="source in filteredFieldMetadata" :key="source.key" open>
              <summary>{{ source.label }} <span>{{ source.fields.length }}</span></summary>
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
              <header>
                <input v-model="group.name" :aria-label="ui.groupName" />
                <select v-model="group.logicalOperator"><option value="AND">AND</option><option value="OR">OR</option></select>
                <label>{{ ui.priority }} <input v-model.number="group.priority" type="number" min="1" /></label>
                <button class="ghost-button mini" type="button" @click="duplicateRuleGroup(groupIndex)">{{ ui.duplicate }}</button>
                <button class="danger-button mini" type="button" @click="removeRuleGroup(groupIndex)">{{ t.action.delete }}</button>
              </header>
              <div v-for="(rule, ruleIndex) in group.rules" :key="rule.id" class="mapping-rule" @click="activeRule = { groupIndex, ruleIndex }">
                <div class="mapping-field" @dragover.prevent @drop="dropField(groupIndex, ruleIndex, 'internal')">
                  <span>{{ ui.systemSide }}</span>
                  <select v-model="rule.leftFields" multiple><option v-for="field in allInternalFields" :key="field.key" :value="field.key">{{ field.label }} ({{ field.key }})</option></select>
                </div>
                <div class="mapping-operator">
                  <select v-model="rule.operator"><option v-for="operator in operators" :key="operator.value" :value="operator.value">{{ operator.label }}</option></select>
                  <label>{{ ui.weight }} <input v-model.number="rule.weight" type="number" min="0" max="100" /></label>
                </div>
                <div class="mapping-field" @dragover.prevent @drop="dropField(groupIndex, ruleIndex, 'excel')">
                  <span>{{ ui.excelSide }}</span>
                  <select v-model="rule.rightFields" multiple><option v-for="header in excelHeaders" :key="header.name" :value="header.name">{{ header.name }} ({{ header.dataType }})</option></select>
                </div>
                <div class="rule-settings">
                  <label><input v-model="rule.required" type="checkbox" /> {{ ui.required }}</label>
                  <select v-model="rule.transformations" multiple :title="ui.transformations"><option v-for="transform in transformations" :key="transform.value" :value="transform.value">{{ transform.label }}</option></select>
                  <button class="ghost-button mini" type="button" @click.stop="removeRule(groupIndex, ruleIndex)">×</button>
                </div>
              </div>
              <button class="add-rule-button" type="button" @click="addRule(groupIndex)">＋ {{ ui.addRule }}</button>
            </article>
            <div v-if="!draftConfiguration.groups.length" class="empty-rule-state">{{ ui.noGroups }}</div>
          </main>

          <aside class="field-library excel-library">
            <h4>{{ ui.excelFields }}</h4>
            <input v-model="excelSearch" type="search" :placeholder="ui.searchExcel" />
            <button v-for="header in filteredExcelHeaders" :key="header.name" class="field-card excel-field-card" type="button" draggable="true" @dragstart="startFieldDrag('excel', header.name)" @click="assignSelectedField('excel', header.name)">
              <strong>{{ header.name }}</strong>
              <select v-model="header.dataType" @click.stop><option v-for="type in dataTypes" :key="type" :value="type">{{ type }}</option></select>
              <small>{{ ui.nonEmpty }} {{ header.nonEmptyCount }} · {{ header.examples.join(' / ') || '—' }}</small>
            </button>
          </aside>
        </div>

        <footer class="matching-modal-footer">
          <div><button class="secondary-button" type="button" :disabled="!draftValid" @click="previewRules">{{ ui.testRules }}</button><span v-if="previewResult" :class="previewResult.valid ? 'configuration-ok' : 'configuration-warning'">{{ previewResult.valid ? ui.previewPassed : `${ui.missingHeaders}: ${previewResult.missingHeaders.join(', ')}` }}</span></div>
          <div><button class="ghost-button" type="button" @click="closeMatchingDialog">{{ ui.cancel }}</button><button class="primary-button" type="button" :disabled="!draftValid" @click="confirmConfiguration">{{ ui.confirm }}</button></div>
        </footer>
      </section>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import DataPagination from "../components/DataPagination.vue";
import DualScrollTable from "../components/DualScrollTable.vue";
import { locale, messages } from "../i18n";
import { api } from "../services/api";
import { requestConfirm } from "../services/confirm";
import { exportTableXls, parseTableFile } from "../utils/tableFiles";

const t = computed(() => messages[locale.value].bankReconciliation);
const selectedFiles = ref([]);
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
const fieldMetadata = ref([]);
const excelHeaders = ref([]);
const templates = ref([]);
const selectedTemplateId = ref("");
const fieldSearch = ref("");
const excelSearch = ref("");
const previewResult = ref(null);
const templateValidationMessage = ref("");
const activeRule = ref({ groupIndex: 0, ruleIndex: 0 });
const draggedField = ref(null);
const emptyConfiguration = () => ({ groups: [] });
const matchingConfiguration = ref(emptyConfiguration());
const draftConfiguration = ref(emptyConfiguration());
const bankColumns = ref([
  { key: "source", visible: true },
  { key: "date", visible: true },
  { key: "summary", visible: true },
  { key: "amount", visible: true },
  { key: "room", visible: true },
  { key: "contract", visible: true },
  { key: "status", visible: true },
  { key: "remark", visible: true },
]);
const uploadDefaults = ["normalizedBankSummary", "depositAmount"];
const ui = computed(() => locale.value === "zh" ? {
  selectFields: "选择匹配字段", configure: "配置规则", ruleRequired: "执行对账前，请至少配置一个有效的匹配条件。", rulesConfigured: "条规则已配置", groups: "个规则组",
  dialogEyebrow: "AI 对账规则", dialogTitle: "选择匹配字段", dialogHelp: "将内部系统字段与上传的 Excel 列建立映射。支持一对一、一对多和多对一。",
  loadTemplate: "加载模板", saveTemplate: "另存为模板", reset: "重置配置", internalFields: "内部系统字段", excelFields: "上传的 Excel 字段", ruleWorkspace: "匹配规则工作区", ruleWorkspaceHelp: "点击字段或拖放到规则中；多选即可组合字段。",
  searchInternal: "搜索内部字段", searchExcel: "搜索 Excel 列", normalizable: "可标准化", exactOnly: "精确值", addGroup: "添加规则组", addRule: "添加规则", noGroups: "请添加一个规则组开始配置。",
  groupName: "规则组名称", priority: "优先级", duplicate: "复制", systemSide: "内部字段 / 字段组", excelSide: "Excel 字段 / 字段组", weight: "权重", required: "必需", transformations: "转换规则", nonEmpty: "非空",
  testRules: "测试匹配规则", previewPassed: "字段校验通过", missingHeaders: "缺少列", cancel: "取消", confirm: "确认配置", templateName: "请输入模板名称", templateSaved: "模板已保存", invalidTemplate: "模板中的部分 Excel 列不存在，请重新映射。",
} : {
  selectFields: "照合フィールド選択", configure: "ルール設定", ruleRequired: "照合を実行する前に、少なくとも1つの有効な照合条件を設定してください。", rulesConfigured: "件のルール設定済み", groups: "ルールグループ",
  dialogEyebrow: "AI 照合ルール", dialogTitle: "照合フィールド選択", dialogHelp: "内部システム項目とアップロードした Excel 列を関連付けます。1対1、1対多、多対1に対応します。",
  loadTemplate: "テンプレート読込", saveTemplate: "テンプレート保存", reset: "リセット", internalFields: "内部システム項目", excelFields: "Excel 項目", ruleWorkspace: "照合ルール", ruleWorkspaceHelp: "項目をクリック、またはルールへドラッグします。複数選択で項目を結合できます。",
  searchInternal: "内部項目を検索", searchExcel: "Excel 列を検索", normalizable: "正規化可", exactOnly: "完全一致", addGroup: "グループ追加", addRule: "ルール追加", noGroups: "ルールグループを追加してください。",
  groupName: "グループ名", priority: "優先度", duplicate: "複製", systemSide: "内部項目 / 項目グループ", excelSide: "Excel 項目 / 項目グループ", weight: "重み", required: "必須", transformations: "変換", nonEmpty: "非空",
  testRules: "ルールをテスト", previewPassed: "項目検証に成功", missingHeaders: "不足列", cancel: "キャンセル", confirm: "確定", templateName: "テンプレート名を入力", templateSaved: "保存しました", invalidTemplate: "テンプレート内の Excel 列が不足しています。再設定してください。",
});
const roomColumnLabel = computed(() => t.value.table.room);
const contractColumnLabel = computed(() => t.value.table.contract);
const contractPartyLabel = computed(() => t.value.matching.contractParty);
const contractorLabel = computed(() => t.value.matching.contractor);
const payerLabel = computed(() => t.value.matching.payer);
const visibleBankColumns = computed(() => bankColumns.value.filter((column) => column.visible));
const isBankColumnVisible = (key) => bankColumns.value.find((column) => column.key === key)?.visible;
const bankColumnLabel = (key) => ({ source: t.value.table.source, date: t.value.table.date, summary: t.value.table.summary, amount: t.value.table.amount, room: roomColumnLabel.value, contract: contractColumnLabel.value, status: t.value.table.status, remark: t.value.table.remark })[key] || key;
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

watch([searchQuery, activeTab, activeBatchId], () => {
  recordPage.value = 1;
});
watch(() => filteredRecords.value.length, (total) => {
  recordPage.value = Math.min(recordPage.value, Math.max(1, Math.ceil(total / recordPageSize.value)));
});

const selectFiles = (event) => {
  selectedFiles.value.push(...Array.from(event.target.files || []));
  event.target.value = "";
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
  matchingConfiguration.value = batch?.matchingRulesJson?.groups ? structuredClone(batch.matchingRulesJson) : emptyConfiguration();
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

const openMatchingDialog = async () => {
  if (!activeBatchId.value) return;
  loading.value = true;
  errorMessage.value = "";
  try {
    const [metadata, headers, ownedTemplates] = await Promise.all([
      fieldMetadata.value.length ? fieldMetadata.value : api.reconciliationFieldMetadata(),
      api.reconciliationBatchHeaders(activeBatchId.value),
      api.listReconciliationTemplates(),
    ]);
    fieldMetadata.value = metadata;
    excelHeaders.value = headers;
    templates.value = ownedTemplates;
    selectedTemplateId.value = batches.value.find((item) => item.id === activeBatchId.value)?.templateId || "";
    draftConfiguration.value = structuredClone(hasValidConfiguration.value ? matchingConfiguration.value : { groups: [newRuleGroup()] });
    activeRule.value = { groupIndex: 0, ruleIndex: 0 };
    previewResult.value = null;
    templateValidationMessage.value = "";
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
  const copy = structuredClone(draftConfiguration.value.groups[index]);
  copy.id = `group-${Date.now()}`;
  copy.name = `${copy.name} Copy`;
  copy.priority = draftConfiguration.value.groups.length + 1;
  copy.rules.forEach((rule) => { rule.id = `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; });
  draftConfiguration.value.groups.push(copy);
};
const addRule = (groupIndex) => { draftConfiguration.value.groups[groupIndex].rules.push(newRule()); activeRule.value = { groupIndex, ruleIndex: draftConfiguration.value.groups[groupIndex].rules.length - 1 }; };
const removeRule = (groupIndex, ruleIndex) => { draftConfiguration.value.groups[groupIndex].rules.splice(ruleIndex, 1); };
const resetConfiguration = () => { draftConfiguration.value = { groups: [newRuleGroup()] }; selectedTemplateId.value = ""; previewResult.value = null; templateValidationMessage.value = ""; };
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
const previewRules = async () => {
  previewResult.value = await api.previewReconciliationConfiguration(activeBatchId.value, draftConfiguration.value);
};
const confirmConfiguration = async () => {
  if (!draftValid.value) return;
  const result = await api.previewReconciliationConfiguration(activeBatchId.value, draftConfiguration.value);
  previewResult.value = result;
  if (!result.valid) return;
  await api.saveReconciliationConfiguration(activeBatchId.value, draftConfiguration.value, selectedTemplateId.value);
  matchingConfiguration.value = structuredClone(draftConfiguration.value);
  await loadBatches();
  showMatchingDialog.value = false;
};
const saveAsTemplate = async () => {
  const name = window.prompt(ui.value.templateName);
  if (!name?.trim()) return;
  const template = await api.createReconciliationTemplate({ name: name.trim(), configuration: draftConfiguration.value });
  templates.value.unshift(template);
  selectedTemplateId.value = template.id;
  templateValidationMessage.value = ui.value.templateSaved;
};
const loadSelectedTemplate = async () => {
  templateValidationMessage.value = "";
  const template = templates.value.find((item) => item.id === selectedTemplateId.value);
  if (!template) return;
  draftConfiguration.value = structuredClone(template.configurationJson);
  const available = new Set(excelHeaders.value.map((header) => header.name));
  const missing = draftConfiguration.value.groups.flatMap((group) => group.rules || []).flatMap((rule) => rule.rightFields || []).filter((name) => !available.has(name));
  if (missing.length) templateValidationMessage.value = `${ui.value.invalidTemplate} ${[...new Set(missing)].join(", ")}`;
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
    { key: "depositAmount", label: t.value.table.amount },
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
  await api.updateReconciliationRecord(record.id, {
    transactionDate: record.transactionDate,
    depositAmount: record.depositAmount,
    normalizedBankSummary: record.normalizedBankSummary,
    paymentMonth: record.paymentMonth,
    remark: record.remark,
  });
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
    transactionDate: record.transactionDate,
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
  rooms.value = await api.reconciliationRooms();
  await loadBatches();
});
</script>

<style scoped>
.bank-reconciliation-page {
  display: grid;
  gap: 18px;
}

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
  grid-template-columns: auto minmax(0, 1fr) auto;
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
  border-radius: 14px;
  background: #f8fafc;
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
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--line);
  background: #fff;
}

.matching-modal-header h3,
.matching-workspace h4 { margin: 0; }
.matching-modal-header .subtle { margin: 4px 0 0; }
.modal-close { border: 0; background: transparent; color: #64748b; font-size: 30px; cursor: pointer; }

.template-toolbar {
  padding: 12px 20px;
  border-bottom: 1px solid var(--line);
  background: #fff;
}

.template-toolbar select { width: min(360px, 35vw); }

.matching-workspace {
  display: grid;
  grid-template-columns: 290px minmax(520px, 1fr) 300px;
  min-height: 0;
  overflow: hidden;
}

.field-library,
.rule-workspace {
  min-width: 0;
  overflow: auto;
  padding: 18px;
}

.field-library { background: #fff; }
.field-library:first-child { border-right: 1px solid var(--line); }
.excel-library { border-left: 1px solid var(--line); }
.field-library > input { margin: 12px 0; }
.field-library details { margin-bottom: 10px; }
.field-library summary { display: flex; justify-content: space-between; padding: 8px 2px; color: #334155; font-weight: 800; cursor: pointer; }
.field-library summary span { color: var(--muted); font-size: 12px; }

.field-card {
  display: grid;
  gap: 3px;
  width: 100%;
  margin-bottom: 7px;
  padding: 9px 10px;
  border: 1px solid #dbe4ec;
  border-radius: 8px;
  background: #fff;
  color: #1e293b;
  text-align: left;
  cursor: grab;
}
.field-card:hover { border-color: var(--primary); background: #f0fdfa; }
.field-card code { overflow: hidden; color: #0f766e; font-size: 11px; text-overflow: ellipsis; }
.field-card small { color: var(--muted); }
.excel-field-card { grid-template-columns: minmax(0, 1fr) 90px; align-items: center; }
.excel-field-card small { grid-column: 1 / -1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.excel-field-card select { padding: 5px; font-size: 11px; }

.rule-workspace { background: #f5f8fb; }
.rule-workspace-title { justify-content: space-between; margin-bottom: 14px; }
.rule-group-card { margin-bottom: 14px; padding: 14px; border: 1px solid #d8e1ea; border-radius: 10px; background: #fff; }
.rule-group-card > header { display: grid; grid-template-columns: minmax(150px, 1fr) 80px 120px auto auto; margin-bottom: 12px; }
.rule-group-card > header label { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }
.rule-group-card > header label input { width: 55px; }

.mapping-rule {
  display: grid;
  grid-template-columns: minmax(155px, 1fr) 130px minmax(155px, 1fr) 120px;
  gap: 9px;
  margin-bottom: 9px;
  padding: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fbfdff;
}
.mapping-rule:focus-within { border-color: var(--primary); box-shadow: 0 0 0 2px rgba(13, 128, 119, 0.1); }
.mapping-field > span { display: block; margin-bottom: 5px; color: var(--muted); font-size: 11px; font-weight: 700; }
.mapping-field select { min-height: 72px; font-size: 12px; }
.mapping-operator { display: grid; align-content: center; gap: 6px; }
.mapping-operator label { color: var(--muted); font-size: 11px; }
.mapping-operator input { margin-top: 3px; }
.rule-settings { display: grid; align-content: center; gap: 6px; }
.rule-settings label { display: flex; align-items: center; gap: 5px; font-size: 12px; }
.rule-settings label input { width: auto; }
.rule-settings select { min-height: 54px; font-size: 11px; }
.add-rule-button { width: 100%; border: 1px dashed #94a3b8; border-radius: 7px; padding: 8px; background: transparent; color: #0f766e; cursor: pointer; }
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
  .matching-workspace { grid-template-columns: 230px minmax(480px, 1fr) 240px; overflow: auto; }
  .mapping-rule { grid-template-columns: 1fr; }
}
</style>
