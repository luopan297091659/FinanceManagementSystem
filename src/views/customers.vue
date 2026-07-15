<template>
  <section class="page-shell data-page">
    <div class="page-title-row">
      <div>
        <p class="eyebrow">客户管理</p>
        <h2>租客与业主统一视图</h2>
      </div>
    </div>

    <div class="content-grid data-content-grid">
      <div class="panel-card full-panel">
        <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>
        <p v-if="loading" class="form-hint">正在同步后端数据...</p>

        <div class="section-heading">
          <div><strong>房间绑定</strong></div>
          <div><small>点击客户行的“绑定”按钮来添加房间绑定</small></div>
        </div>
        <div v-if="bindings.length" class="table-list compact-binding-list">
          <div class="table-row binding-row header">
            <div>房间</div>
            <div>类型 / 客户</div>
            <div>起止日期</div>
            <div>状态</div>
            <div>操作</div>
          </div>
          <div v-for="item in bindings" :key="item.id" class="table-row binding-row">
            <div>{{ getRoomLabel(item.roomId) }}</div>
            <div>{{ item.kind === "owner" ? "业主" : "租客" }} / {{ getCustomerName(item.customerId) }}</div>
            <div>{{ item.startDate || "-" }} - {{ item.endDate || "-" }}</div>
            <div>{{ item.status }}</div>
            <div class="row-actions">
              <button class="danger-button mini" type="button" @click="deleteBinding(item.id)">删除</button>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">暂无绑定记录。</div>

        <div class="table-controls data-toolbar customer-toolbar">
          <div class="toolbar-actions">
            <input v-model="searchQuery" class="search-input" type="text" placeholder="搜索客户、电话、地址、类型..." />
            <button class="primary-button" type="button" @click="openCustomerModal">新增客户</button>
            <button class="secondary-button" type="button" @click="triggerImport">导入</button>
            <button class="secondary-button" type="button" @click="exportCustomers">导出</button>
            <button class="danger-button" type="button" :disabled="!selectedIds.length" @click="batchDelete">批量删除</button>
            <input ref="fileInput" class="hidden-file-input" type="file" accept=".xls,.csv,.tsv,.html,.txt" @change="importCustomers" />
          </div>
          <div class="column-panel-container">
            <button class="secondary-button" type="button" @click="showColumnPanel = !showColumnPanel">显示字段 ▾</button>
            <div v-if="showColumnPanel" class="column-panel">
              <div class="panel-body">
                <label v-for="column in customerColumns" :key="column.key" class="panel-item">
                  <input type="checkbox" v-model="column.visible" />
                  {{ column.label }}
                </label>
              </div>
            </div>
          </div>
        </div>
        <CustomerTable
          v-model:selected-ids="selectedIds"
          :items="filteredCustomers"
          :columns="customerColumns"
          @edit="editCustomer"
          @delete="deleteCustomer"
          @bind="openBindingModal"
        />
      </div>
    </div>

    <div v-if="showCustomerModal" class="modal-overlay" @click.self="closeCustomerModal">
      <div class="modal-card">
        <div class="modal-header">
          <h3>{{ customerModalTitle }}</h3>
          <button class="modal-close-button" type="button" @click="closeCustomerModal">×</button>
        </div>
        <CustomerForm v-model="form" @submit="saveCustomer" @cancel="closeCustomerModal" />
      </div>
    </div>
    <div v-if="showBindingModal" class="modal-overlay" @click.self="closeBindingModal">
      <div class="modal-card">
        <div class="modal-header">
          <h3>{{ bindingModalTitle }}</h3>
          <button class="modal-close-button" type="button" @click="closeBindingModal">×</button>
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
              <option v-for="customer in customers" :key="customer.id" :value="customer.id">{{ customer.name }} ({{ customer.kind === "owner" ? "业主" : "租客" }})</option>
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
          <button class="ghost-button" type="button" @click="closeBindingModal">取消</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import CustomerForm from "../components/customers/CustomerForm.vue";
import CustomerTable from "../components/customers/CustomerTable.vue";
import { api } from "../services/api";
import { exportTableXls, parseTableFile } from "../utils/tableFiles";

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
const selectedIds = ref([]);
const fileInput = ref(null);
const loading = ref(false);
const errorMessage = ref("");
const searchQuery = ref("");
const showCustomerModal = ref(false);
const customerModalTitle = ref("新增客户");
const showBindingModal = ref(false);
const bindingModalTitle = ref("新增绑定");
const customerColumns = ref([
  { key: "name", label: "客户 / 编号", visible: true },
  { key: "contact", label: "联系方式", visible: true },
  { key: "address", label: "地址 / 附件", visible: true },
  { key: "type", label: "客户类型", visible: true },
  { key: "dates", label: "出生 / 年收入", visible: true },
  { key: "extra", label: "假名 / 国籍", visible: true },
]);

const showColumnPanel = ref(false);
const visibleCustomerColumns = computed(() => customerColumns.value.filter((column) => column.visible));
const filteredCustomers = computed(() => customers.value.filter(matchesCustomerSearch));

const resetForm = () => {
  form.value = blankForm();
};

const resetBinding = () => {
  bindingForm.value = blankBinding();
};

const openCustomerModal = () => {
  resetForm();
  customerModalTitle.value = "新增客户";
  showCustomerModal.value = true;
};

const closeCustomerModal = () => {
  showCustomerModal.value = false;
  resetForm();
};

const openBindingModal = (customer) => {
  bindingForm.value = blankBinding();
  if (customer?.id) {
    bindingForm.value.customerId = customer.id;
    bindingForm.value.kind = customer.kind;
  }
  bindingModalTitle.value = "新增绑定";
  showBindingModal.value = true;
};

const closeBindingModal = () => {
  showBindingModal.value = false;
  resetBinding();
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
    selectedIds.value = selectedIds.value.filter((id) => customers.value.some((item) => item.id === id));
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
    if (form.value.id) await api.updateCustomer(form.value.id, payload);
    else await api.createCustomer(payload);
    await loadCustomers();
    closeCustomerModal();
  } catch (error) {
    errorMessage.value = error.message || "保存客户失败";
  }
};

function matchesCustomerSearch(item) {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return true;
  return visibleCustomerColumns.value.some((column) => String(getExportValue(item, column.key)).toLowerCase().includes(query));
}

const getExportValue = (item, key) =>
  ({
    name: `${item.name || ""} / ${item.customerCode || ""}`,
    contact: `${item.phone || ""} / ${item.email || ""}`,
    address: `${item.address || ""} / ${item.note || ""}`,
    type: `${item.kind === "owner" ? "业主" : "租客"} / ${item.ownerType === "COMPANY" ? "法人/企业" : "个人"}`,
    dates: `${item.birthDate || ""} / ${item.annualIncome || ""}`,
    extra: `${item.kana || ""} / ${item.nationality || ""}`,
  })[key] || "";

const editCustomer = (item) => {
  form.value = { ...item };
  customerModalTitle.value = "编辑客户";
  showCustomerModal.value = true;
};

const deleteCustomer = async (id) => {
  try {
    await api.deleteCustomer(id);
    await loadCustomers();
  } catch (error) {
    errorMessage.value = error.message || "删除客户失败";
  }
};

const batchDelete = async () => {
  if (!selectedIds.value.length) return;
  try {
    await Promise.all(selectedIds.value.map((id) => api.deleteCustomer(id)));
    selectedIds.value = [];
    await loadCustomers();
  } catch (error) {
    errorMessage.value = error.message || "批量删除客户失败";
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
    closeBindingModal();
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

const exportCustomers = () => {
  exportTableXls(
    "客户管理.xls",
    visibleCustomerColumns.value,
    filteredCustomers.value.map((item) =>
      Object.fromEntries(visibleCustomerColumns.value.map((column) => [column.key, getExportValue(item, column.key)])),
    ),
  );
};

const triggerImport = () => {
  fileInput.value?.click();
};

const importCustomers = async (event) => {
  const [file] = event.target.files || [];
  if (!file) return;
  try {
    const rows = await parseTableFile(file);
    const header = rows[0] || [];
    const dataRows = rows.slice(1);
    const labelIndex = (label) => header.findIndex((item) => item === label);
    await Promise.all(
      dataRows.map((row) => {
        const nameParts = String(row[labelIndex("客户 / 编号")] || "").split("/");
        const contactParts = String(row[labelIndex("联系方式")] || "").split("/");
        const addressParts = String(row[labelIndex("地址 / 附件")] || "").split("/");
        const typeParts = String(row[labelIndex("客户类型")] || "").split("/");
        const dateParts = String(row[labelIndex("出生 / 年收入")] || "").split("/");
        const extraParts = String(row[labelIndex("假名 / 国籍")] || "").split("/");
        return api.createCustomer({
          kind: typeParts[0]?.includes("业主") ? "owner" : "tenant",
          ownerType: typeParts[1]?.includes("法人") ? "COMPANY" : "PERSON",
          customerCode: nameParts[1]?.trim() || "",
          name: nameParts[0]?.trim() || "",
          phone: contactParts[0]?.trim() || "",
          email: contactParts[1]?.trim() || "",
          address: addressParts[0]?.trim() || "",
          attachments: addressParts[1]?.trim() || "",
          birthDate: dateParts[0]?.trim() || "",
          annualIncome: dateParts[1]?.trim() || "",
          kana: extraParts[0]?.trim() || "",
          nationality: extraParts[1]?.trim() || "",
        });
      }),
    );
    await loadCustomers();
  } catch (error) {
    errorMessage.value = error.message || "导入客户失败";
  } finally {
    event.target.value = "";
  }
};

onMounted(() => {
  loadCustomers();
});
</script>
