<template>
  <section class="page-shell">
    <div class="page-title-row">
      <div>
        <p class="eyebrow">客户管理</p>
        <h2>租客与业主统一视图</h2>
      </div>
      <button class="primary-button" type="button" @click="resetForm">新增客户</button>
    </div>

    <div class="content-grid">
      <div class="panel-card">
        <CustomerForm v-model="form" @submit="saveCustomer" @cancel="resetForm" />
      </div>
      <div class="panel-card">
        <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>
        <p v-if="loading" class="form-hint">正在同步后端数据…</p>
        <CustomerTable :items="customers" @edit="editCustomer" @delete="deleteCustomer" />
      </div>
    </div>
  </section>
</template>

<script setup>
import { onMounted, ref } from "vue";
import CustomerForm from "../components/customers/CustomerForm.vue";
import CustomerTable from "../components/customers/CustomerTable.vue";
import { api } from "../services/api";

const blankForm = () => ({
  id: "",
  kind: "tenant",
  customerCode: "",
  name: "",
  phone: "",
  email: "",
  note: "",
});

const form = ref(blankForm());
const customers = ref([]);
const loading = ref(false);
const errorMessage = ref("");

const resetForm = () => {
  form.value = blankForm();
};

const loadCustomers = async () => {
  loading.value = true;
  errorMessage.value = "";
  try {
    const payload = await api.bootstrap();
    const tenants = (payload.tenants || []).map((tenant) => ({
      id: tenant.id,
      kind: "tenant",
      customerCode: tenant.customerCode,
      name: tenant.name,
      phone: tenant.phone,
      email: tenant.email,
      note: tenant.attachments,
    }));
    const owners = (payload.owners || []).map((owner) => ({
      id: owner.id,
      kind: "owner",
      customerCode: owner.customerCode,
      name: owner.name,
      phone: owner.phone,
      email: owner.email,
      note: owner.attachments,
    }));
    customers.value = [...tenants, ...owners];
  } catch (error) {
    errorMessage.value = error.message || "加载客户失败";
  } finally {
    loading.value = false;
  }
};

const saveCustomer = async () => {
  if (!form.value.name || !form.value.customerCode) return;

  try {
    const payload = {
      kind: form.value.kind,
      customerCode: form.value.customerCode,
      name: form.value.name,
      phone: form.value.phone,
      email: form.value.email,
      attachments: form.value.note,
      address: "",
    };

    if (form.value.id) {
      await api.updateCustomer(form.value.id, payload);
    } else {
      await api.createCustomer(payload);
    }
    await loadCustomers();
    resetForm();
  } catch (error) {
    errorMessage.value = error.message || "保存客户失败";
  }
};

const editCustomer = (item) => {
  form.value = { ...item };
};

const deleteCustomer = async (id) => {
  try {
    await api.deleteCustomer(id);
    await loadCustomers();
  } catch (error) {
    errorMessage.value = error.message || "删除客户失败";
  }
};

onMounted(() => {
  loadCustomers();
});
</script>
