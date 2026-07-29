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
        <p v-if="loading" class="form-hint">{{ common.loading }}</p>

        <div class="section-heading">
          <div><strong>{{ labels.bindingTitle }}</strong></div>
          <div><small>{{ labels.bindingHelp }}</small></div>
        </div>
        <div v-if="bindings.length" class="table-list compact-binding-list">
          <div class="table-row binding-row header">
            <div>{{ labels.room }}</div>
            <div>{{ labels.typeCustomer }}</div>
            <div>{{ labels.period }}</div>
            <div>{{ labels.status }}</div>
            <div>{{ common.actions }}</div>
          </div>
          <div v-for="item in bindings" :key="item.id" class="table-row binding-row">
            <div>{{ getRoomLabel(item.roomId) }}</div>
            <div>{{ item.kind === "owner" ? labels.owner : labels.tenant }} / {{ getCustomerName(item.customerId) }}</div>
            <div>{{ formatDateRange(item.startDate, item.endDate) }}</div>
            <div>{{ item.status }}</div>
            <div class="row-actions">
              <button class="danger-button mini" type="button" @click="deleteBinding(item.id)">{{ common.delete }}</button>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">{{ labels.noBindings }}</div>

        <div class="table-controls data-toolbar customer-toolbar">
          <div class="toolbar-actions">
            <input v-model="searchQuery" class="search-input" type="text" :placeholder="labels.searchPlaceholder" />
            <button class="primary-button" type="button" @click="openCustomerModal">{{ labels.newCustomer }}</button>
            <button class="secondary-button" type="button" @click="triggerImport">{{ common.import }}</button>
            <button class="secondary-button" type="button" @click="exportCustomers">{{ common.export }}</button>
            <button class="danger-button" type="button" :disabled="!selectedIds.length" @click="batchDelete">{{ common.batchDelete }}</button>
            <input ref="fileInput" class="hidden-file-input" type="file" accept=".xls,.csv,.tsv,.html,.txt" @change="importCustomers" />
          </div>
          <div class="column-panel-container">
            <button class="secondary-button" type="button" @click="showColumnPanel = !showColumnPanel">{{ common.showColumns }} ▾</button>
            <div v-if="showColumnPanel" class="column-panel" role="dialog" :aria-label="common.showColumns">
              <div class="column-panel-header">
                <strong>{{ common.showColumns }}</strong>
                <button class="column-reset-button" type="button" @click="resetCustomerColumns">{{ common.resetColumns }}</button>
              </div>
              <div class="panel-body">
                <label v-for="column in customerColumns" :key="column.key" class="panel-item">
                  <input type="checkbox" v-model="column.visible" />
                  {{ labels[column.labelKey] }}
                </label>
              </div>
            </div>
          </div>
        </div>
        <CustomerTable
          v-model:selected-ids="selectedIds"
          :items="paginatedCustomers"
          :total="filteredCustomers.length"
          :columns="customerColumns"
          :labels="labels"
          :common="common"
          @edit="editCustomer"
          @delete="deleteCustomer"
          @bind="openBindingModal"
        />
        <DataPagination
          v-model:page="customerPage"
          v-model:page-size="customerPageSize"
          :total="filteredCustomers.length"
          :labels="common"
        />
      </div>
    </div>

    <div v-if="showCustomerModal" class="modal-overlay" @click.self="closeCustomerModal">
      <div class="modal-card">
        <div class="modal-header">
          <h3>{{ customerModalTitle }}</h3>
          <button class="modal-close-button" type="button" @click="closeCustomerModal" :title="common.close">×</button>
        </div>
        <CustomerForm v-model="form" :labels="labels" :common="common" @submit="saveCustomer" @cancel="closeCustomerModal" />
      </div>
    </div>
    <div v-if="showBindingModal" class="modal-overlay" @click.self="closeBindingModal">
      <div class="modal-card">
        <div class="modal-header">
          <h3>{{ bindingModalTitle }}</h3>
          <button class="modal-close-button" type="button" @click="closeBindingModal" :title="common.close">×</button>
        </div>
        <div class="field-grid">
          <label>
            {{ labels.room }}
            <select v-model="bindingForm.roomId">
              <option value="">{{ common.select }}</option>
              <option v-for="room in rooms" :key="room.id" :value="room.id">{{ room.projectName }} / {{ room.buildingName }} / {{ room.roomNumber }}</option>
            </select>
          </label>
          <label>
            {{ labels.customerType }}
            <select v-model="bindingForm.customerId">
              <option value="">{{ common.select }}</option>
              <option v-for="customer in customers" :key="customer.id" :value="customer.id">{{ customer.name }} ({{ customer.kind === "owner" ? labels.owner : labels.tenant }})</option>
            </select>
          </label>
          <label>
            {{ labels.type }}
            <select v-model="bindingForm.kind">
              <option value="tenant">{{ labels.tenant }}</option>
              <option value="owner">{{ labels.owner }}</option>
            </select>
          </label>
          <label>
            {{ labels.startDate }}
            <input type="date" v-model="bindingForm.startDate" />
          </label>
          <label>
            {{ labels.endDate }}
            <input type="date" v-model="bindingForm.endDate" />
          </label>
          <label>
            {{ labels.status }}
            <select v-model="bindingForm.status">
              <option value="ACTIVE">{{ labels.active }}</option>
              <option value="PENDING">{{ labels.pending }}</option>
              <option value="ENDED">{{ labels.ended }}</option>
            </select>
          </label>
        </div>
        <div class="form-actions" style="margin-top: 12px;">
          <button class="primary-button" type="button" @click="saveBinding">{{ labels.saveBinding }}</button>
          <button class="ghost-button" type="button" @click="closeBindingModal">{{ common.cancel }}</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import DataPagination from "../components/DataPagination.vue";
import CustomerForm from "../components/customers/CustomerForm.vue";
import CustomerTable from "../components/customers/CustomerTable.vue";
import { useI18n } from "../i18n";
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
const { dictionary } = useI18n();
const labels = computed(() => dictionary.value.customersLabels);
const common = computed(() => dictionary.value.common);
const bindingForm = ref(blankBinding());
const customers = ref([]);
const rooms = ref([]);
const bindings = ref([]);
const selectedIds = ref([]);
const fileInput = ref(null);
const loading = ref(false);
const errorMessage = ref("");
const searchQuery = ref("");
const customerPage = ref(1);
const customerPageSize = ref(20);
const showCustomerModal = ref(false);
const customerModalTitle = ref("");
const showBindingModal = ref(false);
const bindingModalTitle = ref("");
const customerColumns = ref([
  { key: "name", labelKey: "customerCode", visible: true },
  { key: "type", labelKey: "customerType", visible: true },
  { key: "contact", labelKey: "contact", visible: true },
  { key: "address", labelKey: "address", visible: true },
  { key: "dates", labelKey: "dates", visible: false },
  { key: "occupation", labelKey: "occupation", visible: false },
  { key: "extra", labelKey: "extra", visible: false },
  { key: "attachments", labelKey: "attachments", visible: false },
]);

const showColumnPanel = ref(false);
const visibleCustomerColumns = computed(() => customerColumns.value.filter((column) => column.visible));
const exportCustomerColumns = computed(() => visibleCustomerColumns.value.map((column) => ({ ...column, label: labels.value[column.labelKey] })));
const filteredCustomers = computed(() => customers.value.filter(matchesCustomerSearch));
const paginatedCustomers = computed(() => {
  const start = (customerPage.value - 1) * customerPageSize.value;
  return filteredCustomers.value.slice(start, start + customerPageSize.value);
});

const resetForm = () => {
  form.value = blankForm();
};

const resetBinding = () => {
  bindingForm.value = blankBinding();
};

const openCustomerModal = () => {
  resetForm();
  customerModalTitle.value = labels.value.newCustomer;
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
  bindingModalTitle.value = labels.value.newBinding;
  showBindingModal.value = true;
};

const closeBindingModal = () => {
  showBindingModal.value = false;
  resetBinding();
};

const getRoomLabel = (roomId) => {
  const room = rooms.value.find((item) => item.id === roomId);
  return room ? compactJoin(room.projectName, room.buildingName, room.roomNumber) : labels.value.unassignedRoom;
};

const getCustomerName = (customerId) => {
  const customer = customers.value.find((item) => item.id === customerId);
  return customer ? customer.name : labels.value.unassignedCustomer;
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
    errorMessage.value = error.message || labels.value.loadFailed;
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
    errorMessage.value = error.message || labels.value.saveFailed;
  }
};

function matchesCustomerSearch(item) {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return true;
  return visibleCustomerColumns.value.some((column) => String(getExportValue(item, column.key)).toLowerCase().includes(query));
}

const getExportValue = (item, key) =>
  ({
    name: compactJoin(item.name, item.customerCode),
    contact: compactJoin(item.phone, item.email),
    address: compactJoin(item.address, item.note),
    type: compactJoin(item.kind === "owner" ? labels.value.owner : labels.value.tenant, item.ownerType === "COMPANY" ? labels.value.company : labels.value.person),
    dates: compactJoin(item.birthDate, item.annualIncome),
    occupation: item.occupation || "",
    extra: compactJoin(item.kana, item.nationality),
    attachments: item.attachments || item.note || "",
  })[key] || "";

const compactJoin = (...values) => values.filter((value) => value !== null && value !== undefined && value !== "").join(" / ");
const formatDateRange = (startDate, endDate) => [startDate, endDate].filter(Boolean).join(" ～ ");

const resetCustomerColumns = () => {
  const defaults = new Set(["name", "type", "contact", "address"]);
  customerColumns.value.forEach((column) => {
    column.visible = defaults.has(column.key);
  });
};

watch(searchQuery, () => {
  customerPage.value = 1;
});
watch(() => customerColumns.value.map((column) => `${column.key}:${column.visible}`).join("|"), () => {
  customerPage.value = 1;
});
watch(() => filteredCustomers.value.length, (total) => {
  customerPage.value = Math.min(customerPage.value, Math.max(1, Math.ceil(total / customerPageSize.value)));
});

const editCustomer = (item) => {
  form.value = { ...item };
  customerModalTitle.value = labels.value.editCustomer;
  showCustomerModal.value = true;
};

const deleteCustomer = async (id) => {
  try {
    await api.deleteCustomer(id);
    await loadCustomers();
  } catch (error) {
    errorMessage.value = error.message || labels.value.deleteFailed;
  }
};

const batchDelete = async () => {
  if (!selectedIds.value.length) return;
  try {
    await Promise.all(selectedIds.value.map((id) => api.deleteCustomer(id)));
    selectedIds.value = [];
    await loadCustomers();
  } catch (error) {
    errorMessage.value = error.message || labels.value.batchDeleteFailed;
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
    errorMessage.value = error.message || labels.value.bindingSaveFailed;
  }
};

const deleteBinding = async (id) => {
  try {
    await api.deleteBinding(id);
    await loadCustomers();
  } catch (error) {
    errorMessage.value = error.message || labels.value.bindingDeleteFailed;
  }
};

const exportCustomers = () => {
  exportTableXls(
    labels.value.exportFileName,
    exportCustomerColumns.value,
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
        const nameParts = String(row[labelIndex(labels.value.customerCode)] || "").split("/");
        const contactParts = String(row[labelIndex(labels.value.contact)] || "").split("/");
        const addressParts = String(row[labelIndex(labels.value.addressAttachment)] || "").split("/");
        const typeParts = String(row[labelIndex(labels.value.customerType)] || "").split("/");
        const dateParts = String(row[labelIndex(labels.value.dates)] || "").split("/");
        const extraParts = String(row[labelIndex(labels.value.extra)] || "").split("/");
        return api.createCustomer({
          kind: typeParts[0]?.includes(labels.value.owner) ? "owner" : "tenant",
          ownerType: typeParts[1]?.includes(labels.value.company.split("/")[0]) ? "COMPANY" : "PERSON",
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
    errorMessage.value = error.message || labels.value.importFailed;
  } finally {
    event.target.value = "";
  }
};

onMounted(() => {
  loadCustomers();
});
</script>
