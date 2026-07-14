<template>
  <section class="page-shell">
    <div class="page-title-row">
      <div>
        <p class="eyebrow">{{ labels.eyebrow }}</p>
        <h2>{{ labels.heading }}</h2>
      </div>
      <button class="primary-button" type="button" @click="resetForm">{{ labels.newTransaction }}</button>
    </div>

    <div class="content-grid">
      <div class="panel-card">
        <FinanceForm v-model="form" :rooms="rooms" :fee-items="feeItems" :labels="labels" @submit="saveFinance" @cancel="resetForm" />
      </div>
      <div class="panel-card">
        <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>
        <p v-if="loading" class="form-hint">{{ labels.loading }}</p>
        <FinanceTable :items="items" :labels="labels" @edit="editFinance" @delete="deleteFinance" />
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
      feeItemId: transaction.details?.[0]?.feeItemId || "",
      processingStatus: transaction.processingStatus || "INCLUDED",
      confirmationStatus: transaction.confirmationStatus || "PENDING",
    }));
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
    if (form.value.id) {
      await api.updateTransaction(form.value.id, payload);
    } else {
      await api.createTransaction(payload);
    }
    await loadFinance();
    resetForm();
  } catch (error) {
    errorMessage.value = error.message || labels.value.saveFailed;
  }
};

const editFinance = (item) => {
  form.value = { ...item };
};

const deleteFinance = async (id) => {
  try {
    await api.deleteTransaction(id);
    await loadFinance();
  } catch (error) {
    errorMessage.value = error.message || labels.value.deleteFailed;
  }
};

onMounted(() => {
  loadFinance();
});
</script>
