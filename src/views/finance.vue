<template>
  <section class="page-shell data-page">
    <div class="page-title-row">
      <div>
        <p class="eyebrow">{{ labels.eyebrow }}</p>
        <h2>{{ labels.heading }}</h2>
      </div>
    </div>

    <div class="content-grid data-content-grid">
      <div class="panel-card full-panel">
        <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>
        <p v-if="loading" class="form-hint">{{ labels.loading }}</p>
        <div class="table-controls data-toolbar">
          <div class="toolbar-actions">
            <input v-model="searchQuery" class="search-input" type="text" placeholder="搜索描述、金额、房间、客户、状态..." />
            <button class="primary-button" type="button" @click="openFinanceModal">{{ labels.newTransaction }}</button>
            <button class="secondary-button" type="button" @click="triggerImport">导入</button>
            <button class="secondary-button" type="button" @click="exportFinance">导出</button>
            <button class="danger-button" type="button" :disabled="!selectedIds.length" @click="batchDelete">批量删除</button>
            <input ref="fileInput" class="hidden-file-input" type="file" accept=".xls,.csv,.tsv,.html,.txt" @change="importFinance" />
          </div>
          <div class="column-panel-container">
            <button class="secondary-button" type="button" @click="showColumnPanel = !showColumnPanel">显示字段 ▾</button>
            <div v-if="showColumnPanel" class="column-panel">
              <div class="panel-body">
                <label v-for="column in financeColumns" :key="column.key" class="panel-item">
                  <input type="checkbox" v-model="column.visible" />
                  {{ column.label }}
                </label>
              </div>
            </div>
          </div>
        </div>
        <FinanceTable
          v-model:selected-ids="selectedIds"
          :items="filteredItems"
          :columns="financeColumns"
          :labels="labels"
          @edit="editFinance"
          @delete="deleteFinance"
        />
      </div>
    </div>
    <div v-if="showFinanceModal" class="modal-overlay" @click.self="closeFinanceModal">
      <div class="modal-card">
        <div class="modal-header">
          <h3>{{ financeModalTitle }}</h3>
          <button class="modal-close-button" type="button" @click="closeFinanceModal">×</button>
        </div>
        <FinanceForm v-model="form" :rooms="rooms" :fee-items="feeItems" :labels="labels" @submit="saveFinance" @cancel="closeFinanceModal" />
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import FinanceForm from "../components/finance/FinanceForm.vue";
import FinanceTable from "../components/finance/FinanceTable.vue";
import { useI18n } from "../i18n";
import { api } from "../services/api";
import { exportTableXls, parseTableFile } from "../utils/tableFiles";

const blankForm = () => ({
  id: "",
  kind: "income",
  amount: 0,
  occurredAt: new Date().toISOString().slice(0, 10),
  description: "",
  roomId: "",
  customerName: "",
  feeItemId: "",
  processingStatus: "INCLUDED",
  confirmationStatus: "PENDING",
});

const { dictionary } = useI18n();
const labels = computed(() => dictionary.value.financeLabels);
const form = ref(blankForm());
const items = ref([]);
const rooms = ref([]);
const feeItems = ref([]);
const selectedIds = ref([]);
const fileInput = ref(null);
const loading = ref(false);
const errorMessage = ref("");
const searchQuery = ref("");
const showFinanceModal = ref(false);
const financeModalTitle = ref("新增财务记录");
const financeColumns = ref([
  { key: "description", label: "描述 / 日期", visible: true },
  { key: "amount", label: "类型 / 金额", visible: true },
  { key: "room", label: "房间", visible: true },
  { key: "status", label: "处理 / 确认", visible: true },
  { key: "customer", label: "客户", visible: true },
]);

const showColumnPanel = ref(false);
const visibleFinanceColumns = computed(() => financeColumns.value.filter((column) => column.visible));
const filteredItems = computed(() => items.value.filter(matchesFinanceSearch));

const resetForm = () => {
  form.value = blankForm();
};

const openFinanceModal = () => {
  resetForm();
  financeModalTitle.value = "新增财务记录";
  showFinanceModal.value = true;
};

const closeFinanceModal = () => {
  showFinanceModal.value = false;
  resetForm();
};

const loadFinance = async () => {
  loading.value = true;
  errorMessage.value = "";
  try {
    const payload = await api.bootstrap();
    rooms.value = payload.rooms || [];
    feeItems.value = payload.feeItems || [];
    const roomLabels = new Map(rooms.value.map((room) => [room.id, `${room.houseNumber || room.number || "-"} / ${room.number || "-"}`]));
    items.value = (payload.transactions || []).map((transaction) => ({
      id: transaction.id,
      kind: transaction.type,
      amount: Number(transaction.totalAmount || transaction.statisticalAmount || transaction.details?.[0]?.value || 0),
      occurredAt: transaction.date,
      description: transaction.note || transaction.contentSummary || "",
      roomId: transaction.roomId || "",
      roomLabel: roomLabels.get(transaction.roomId) || "",
      customerName: transaction.counterparty || "",
      feeItemId: transaction.details?.[0]?.feeItemId || feeItems.value[0]?.id || "",
      processingStatus: transaction.processingStatus || "INCLUDED",
      confirmationStatus: transaction.confirmationStatus || "PENDING",
    }));
    selectedIds.value = selectedIds.value.filter((id) => items.value.some((item) => item.id === id));
  } catch (error) {
    errorMessage.value = error.message || labels.value.loadFailed;
  } finally {
    loading.value = false;
  }
};

const saveFinance = async () => {
  if (!form.value.description || !form.value.occurredAt || !form.value.feeItemId) return;

  try {
    const payload = {
      type: form.value.kind,
      date: form.value.occurredAt,
      roomId: form.value.roomId || undefined,
      counterparty: form.value.customerName || undefined,
      note: form.value.description,
      processingStatus: form.value.processingStatus,
      confirmationStatus: form.value.confirmationStatus,
      details: [{ feeItemId: form.value.feeItemId, value: String(form.value.amount) }],
    };
    if (form.value.id) await api.updateTransaction(form.value.id, payload);
    else await api.createTransaction(payload);
    await loadFinance();
    closeFinanceModal();
  } catch (error) {
    errorMessage.value = error.message || labels.value.saveFailed;
  }
};

function matchesFinanceSearch(item) {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return true;
  return visibleFinanceColumns.value.some((column) => String(getExportValue(item, column.key)).toLowerCase().includes(query));
}

const getExportValue = (item, key) =>
  ({
    description: `${item.description || ""} / ${item.occurredAt || ""}`,
    amount: `${item.kind === "income" ? labels.value.income : labels.value.expense} / ${item.amount || 0}`,
    room: item.roomLabel || "",
    status: `${processingLabel(item.processingStatus)} / ${confirmationLabel(item.confirmationStatus)}`,
    customer: item.customerName || "",
  })[key] || "";

const processingLabel = (status) =>
  ({
    INCLUDED: labels.value.included,
    DETAIL_ONLY: labels.value.detailOnly,
    DUPLICATE_EXCLUDED: labels.value.duplicateExcluded,
  })[status] || status;

const confirmationLabel = (status) =>
  ({
    PENDING: labels.value.pending,
    CONFIRMED: labels.value.confirmed,
    REJECTED: labels.value.rejected,
  })[status] || status;

const editFinance = (item) => {
  form.value = { ...item };
  financeModalTitle.value = "编辑财务记录";
  showFinanceModal.value = true;
};

const deleteFinance = async (id) => {
  try {
    await api.deleteTransaction(id);
    await loadFinance();
  } catch (error) {
    errorMessage.value = error.message || labels.value.deleteFailed;
  }
};

const batchDelete = async () => {
  if (!selectedIds.value.length) return;
  try {
    await Promise.all(selectedIds.value.map((id) => api.deleteTransaction(id)));
    selectedIds.value = [];
    await loadFinance();
  } catch (error) {
    errorMessage.value = error.message || "批量删除财务记录失败";
  }
};

const exportFinance = () => {
  exportTableXls(
    "财务中心.xls",
    visibleFinanceColumns.value,
    filteredItems.value.map((item) =>
      Object.fromEntries(visibleFinanceColumns.value.map((column) => [column.key, getExportValue(item, column.key)])),
    ),
  );
};

const triggerImport = () => {
  fileInput.value?.click();
};

const importFinance = async (event) => {
  const [file] = event.target.files || [];
  if (!file) return;
  try {
    const rows = await parseTableFile(file);
    const header = rows[0] || [];
    const dataRows = rows.slice(1);
    const labelIndex = (label) => header.findIndex((item) => item === label);
    const defaultFeeItemId = feeItems.value[0]?.id;
    if (!defaultFeeItemId) throw new Error("请先维护费用项后再导入财务记录");
    await Promise.all(
      dataRows.map((row) => {
        const descriptionParts = String(row[labelIndex("描述 / 日期")] || "").split("/");
        const amountParts = String(row[labelIndex("类型 / 金额")] || "").split("/");
        const statusParts = String(row[labelIndex("处理 / 确认")] || "").split("/");
        return api.createTransaction({
          type: amountParts[0]?.includes(labels.value.expense) ? "expense" : "income",
          date: descriptionParts[1]?.trim() || new Date().toISOString().slice(0, 10),
          counterparty: row[labelIndex("客户")] || undefined,
          note: descriptionParts[0]?.trim() || "",
          processingStatus: statusParts[0]?.trim() || "INCLUDED",
          confirmationStatus: statusParts[1]?.trim() || "PENDING",
          details: [{ feeItemId: defaultFeeItemId, value: String(Number(amountParts[1] || 0)) }],
        });
      }),
    );
    await loadFinance();
  } catch (error) {
    errorMessage.value = error.message || "导入财务记录失败";
  } finally {
    event.target.value = "";
  }
};

onMounted(() => {
  loadFinance();
});
</script>
