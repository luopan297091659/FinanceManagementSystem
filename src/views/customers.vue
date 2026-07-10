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
        <div class="section-heading">
          <div>
            <!-- <span>房间绑定</span> -->
            <strong>房间绑定</strong>
          </div>
        </div>

        <div class="field-grid">
          <label>
            房间
            <select v-model="bindingForm.roomId">
              <option value="">请选择</option>
              <option v-for="room in rooms" :key="room.id" :value="room.id">{{ room.projectName }} / {{ room.buildingName }} / {{ room.roomNumber }}</option>
            </select>
          </label>
          <label>
            客户
            <select v-model="bindingForm.customerId">
              <option value="">请选择</option>
              <option v-for="customer in customers" :key="customer.id" :value="customer.id">{{ customer.name }} ({{ customer.kind === 'owner' ? '业主' : '租客' }})</option>
            </select>
          </label>
          <label>
            客户类型
            <select v-model="bindingForm.kind">
              <option value="tenant">租客</option>
              <option value="owner">业主</option>
            </select>
          </label>
          <label>
            开始日期
            <input type="date" v-model="bindingForm.startDate" />
          </label>
          <label>
            结束日期
            <input type="date" v-model="bindingForm.endDate" />
          </label>
          <label>
            状态
            <select v-model="bindingForm.status">
              <option value="ACTIVE">有效</option>
              <option value="PENDING">待生效</option>
              <option value="ENDED">已结束</option>
            </select>
          </label>
        </div>

        <div class="form-actions" style="margin-top: 12px;">
          <button class="primary-button" type="button" @click="saveBinding">保存绑定</button>
          <button class="ghost-button" type="button" @click="resetBinding">重置</button>
        </div>

        <div class="table-head" style="margin-top: 22px;">
          <strong>当前绑定</strong>
          <span>{{ bindings.length }} 条</span>
        </div>
        <div v-if="bindings.length" class="table-list">
          <div class="table-row binding-row header">
            <div>房间</div>
            <div>类型 / 客户</div>
            <div>起止日期</div>
            <div>状态</div>
            <div>操作</div>
          </div>
          <div v-for="item in bindings" :key="item.id" class="table-row binding-row">
            <div>{{ getRoomLabel(item.roomId) }}</div>
            <div>{{ item.kind === 'owner' ? '业主' : '租客' }} / {{ getCustomerName(item.customerId) }}</div>
            <div>{{ item.startDate || '—' }} — {{ item.endDate || '—' }}</div>
            <div>{{ item.status }}</div>
            <div class="row-actions">
              <button class="danger-button mini" type="button" @click="deleteBinding(item.id)">删除</button>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">暂无绑定记录。</div>
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
  ownerType: "PERSON",
  customerCode: "",
  name: "",
  kana: "",
  nationality: "",
  phone: "",
  email: "",
  birthDate: "",
  occupation: "",
  annualIncome: "",
  address: "",
  attachments: "",
  note: "",
});

const blankBinding = () => ({
  roomId: "",
  customerId: "",
  kind: "tenant",
  startDate: "",
  endDate: "",
  status: "ACTIVE",
});

const form = ref(blankForm());
const bindingForm = ref(blankBinding());
const customers = ref([]);
const rooms = ref([]);
const bindings = ref([]);
const loading = ref(false);
const errorMessage = ref("");

const resetForm = () => {
  form.value = blankForm();
};

const resetBinding = () => {
  bindingForm.value = blankBinding();
};

const getRoomLabel = (roomId) => {
  const room = rooms.value.find((item) => item.id === roomId);
  return room ? `${room.projectName} / ${room.buildingName} / ${room.roomNumber}` : "未指定房间";
};

const getCustomerName = (customerId) => {
  const customer = customers.value.find((item) => item.id === customerId);
  return customer ? customer.name : "未指定客户";
};

const loadCustomers = async () => {
  loading.value = true;
  errorMessage.value = "";
  try {
    const payload = await api.bootstrap();
    rooms.value = (payload.rooms || []).map((room) => ({
      id: room.id,
      projectName: payload.projects.find((project) => project.id === room.projectId)?.name || "",
      buildingName: payload.buildings.find((building) => building.id === room.buildingId)?.name || "",
      roomNumber: room.number,
    }));

    const tenants = (payload.tenants || []).map((tenant) => ({
      id: tenant.id,
      kind: "tenant",
      ownerType: "PERSON",
      customerCode: tenant.customerCode,
      name: tenant.name,
      kana: tenant.kana,
      nationality: tenant.nationality,
      phone: tenant.phone,
      email: tenant.email,
      birthDate: tenant.birthDate || "",
      occupation: tenant.occupation || "",
      annualIncome: tenant.annualIncome || "",
      address: tenant.address,
      attachments: tenant.attachments,
      note: tenant.attachments,
    }));
    const owners = (payload.owners || []).map((owner) => ({
      id: owner.id,
      kind: "owner",
      ownerType: owner.ownerType || "PERSON",
      customerCode: owner.customerCode,
      name: owner.name,
      kana: owner.kana,
      nationality: owner.nationality || "",
      phone: owner.phone,
      email: owner.email,
      birthDate: "",
      occupation: "",
      annualIncome: "",
      address: owner.address,
      attachments: owner.attachments,
      note: owner.attachments,
    }));
    customers.value = [...tenants, ...owners];

    const tenantBindings = (payload.roomTenants || []).map((link) => ({
      id: link.id,
      roomId: link.roomId,
      customerId: link.tenantId,
      kind: "tenant",
      startDate: link.startDate || "",
      endDate: link.endDate || "",
      status: link.status,
    }));
    const ownerBindings = (payload.roomOwners || []).map((link) => ({
      id: link.id,
      roomId: link.roomId,
      customerId: link.ownerId,
      kind: "owner",
      startDate: link.startDate || "",
      endDate: link.endDate || "",
      status: link.status,
    }));
    bindings.value = [...tenantBindings, ...ownerBindings];
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
      ownerType: form.value.ownerType,
      customerCode: form.value.customerCode,
      name: form.value.name,
      kana: form.value.kana,
      nationality: form.value.nationality,
      phone: form.value.phone,
      email: form.value.email,
      birthDate: form.value.birthDate,
      occupation: form.value.occupation,
      annualIncome: form.value.annualIncome,
      address: form.value.address,
      attachments: form.value.attachments,
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

const saveBinding = async () => {
  if (!bindingForm.value.roomId || !bindingForm.value.customerId) return;
  try {
    await api.createBinding({
      roomId: bindingForm.value.roomId,
      customerId: bindingForm.value.customerId,
      kind: bindingForm.value.kind,
      startDate: bindingForm.value.startDate || undefined,
      endDate: bindingForm.value.endDate || undefined,
      status: bindingForm.value.status,
    });
    await loadCustomers();
    resetBinding();
  } catch (error) {
    errorMessage.value = error.message || "保存绑定失败";
  }
};

const deleteBinding = async (id) => {
  try {
    await api.deleteBinding(id);
    await loadCustomers();
  } catch (error) {
    errorMessage.value = error.message || "删除绑定失败";
  }
};

onMounted(() => {
  loadCustomers();
});
</script>
