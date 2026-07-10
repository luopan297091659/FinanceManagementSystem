<template>
  <section class="page-shell">
    <div class="page-title-row">
      <div>
        <p class="eyebrow">财务中心</p>
        <h2>收支流水与预算视图</h2>
      </div>
      <button class="primary-button" type="button" @click="resetForm">新增流水</button>
    </div>

    <div class="content-grid">
      <div class="panel-card">
        <FinanceForm v-model="form" @submit="saveFinance" @cancel="resetForm" />
      </div>
      <div class="panel-card">
        <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>
        <p v-if="loading" class="form-hint">正在同步后端数据…</p>
        <FinanceTable :items="items" @edit="editFinance" @delete="deleteFinance" />
      </div>
    </div>
  </section>
</template>

<script setup>
import { onMounted, ref } from "vue";
import FinanceForm from "../components/finance/FinanceForm.vue";
import FinanceTable from "../components/finance/FinanceTable.vue";
import { api } from "../services/api";

const blankForm = () => ({
  id: "",
  kind: "income",
  amount: 0,
  occurredAt: new Date().toISOString().slice(0, 10),
  description: "",
  roomName: "",
  customerName: "",
});

const form = ref(blankForm());
const items = ref([]);
const loading = ref(false);
const errorMessage = ref("");

const resetForm = () => {
  form.value = blankForm();
};

const loadFinance = async () => {
  loading.value = true;
  errorMessage.value = "";
  try {
    const payload = await api.bootstrap();
    items.value = (payload.transactions || []).map((transaction) => ({
      id: transaction.id,
      kind: transaction.type,
      amount: Number(transaction.details?.[0]?.value || 0),
      occurredAt: transaction.date,
      description: transaction.note || "",
      roomName: transaction.roomId || "",
      customerName: transaction.counterparty || "",
    }));
  } catch (error) {
    errorMessage.value = error.message || "加载流水失败";
  } finally {
    loading.value = false;
  }
};

const saveFinance = async () => {
  if (!form.value.description || !form.value.occurredAt) return;

  try {
    const feeItemPayload = {
      name: form.value.description,
      category: form.value.kind === "income" ? "income" : "expense",
      valueType: "Money",
      sortOrder: 0,
      enabled: true,
    };
    const feeResult = await api.createFeeItem(feeItemPayload);
    const payload = {
      type: form.value.kind,
      date: form.value.occurredAt,
      roomId: form.value.roomName || undefined,
      counterparty: form.value.customerName || undefined,
      note: form.value.description,
      details: [{ feeItemId: feeResult.id, value: String(form.value.amount) }],
    };
    await api.createTransaction(payload);
    await loadFinance();
    resetForm();
  } catch (error) {
    errorMessage.value = error.message || "保存流水失败";
  }
};

const editFinance = (item) => {
  form.value = { ...item };
};

const deleteFinance = async (id) => {
  try {
    // 当前后端未提供删除流水接口，先保持前端本地移除并提示
    items.value = items.value.filter((item) => item.id !== id);
  } catch (error) {
    errorMessage.value = error.message || "删除流水失败";
  }
};

onMounted(() => {
  loadFinance();
});
</script>
