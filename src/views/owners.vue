<template>
  <section class="page-shell data-page owners-page">
    <div class="content-grid data-content-grid">
    <div class="panel-card full-panel">
      <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>
      <p v-if="loading && !owners.length" class="form-hint">{{ common.loading }}</p>
      <div class="table-controls data-toolbar">
        <div class="toolbar-actions">
          <input v-model="search" class="search-input" type="search" :placeholder="labels.searchPlaceholder" />
          <button class="primary-button" type="button" @click="openNew">{{ labels.newOwner }}</button>
          <button class="secondary-button" type="button" :disabled="importing" @click="fileInput?.click()">{{ labels.importOwners }}</button>
          <input ref="fileInput" class="hidden-file-input" type="file" accept=".xlsx,.xls,.xlsm,.csv,.tsv" @change="importFile" />
        </div>
        <div class="column-panel-container">
          <button class="secondary-button" type="button" @click="showColumnPanel = !showColumnPanel">{{ common.showColumns }} ▾</button>
          <div v-if="showColumnPanel" class="column-panel" role="dialog" :aria-label="common.showColumns">
            <div class="column-panel-header"><strong>{{ common.showColumns }}</strong><button class="column-reset-button" type="button" @click="resetOwnerColumns">{{ common.resetColumns }}</button></div>
            <div class="panel-body"><label v-for="column in ownerColumns" :key="column.key" class="panel-item"><input v-model="column.visible" type="checkbox" />{{ labels[column.labelKey] }}</label></div>
          </div>
        </div>
      </div>
      <div class="table-card data-table-card" :aria-busy="loading">
        <div class="table-head"><strong>{{ labels.list }}</strong><span>{{ total }} {{ common.records }}</span></div>
        <DualScrollTable>
        <table class="data-table owner-table">
          <thead><tr><th class="index-cell">{{ common.index }}</th><th v-for="column in visibleOwnerColumns" :key="column.key">{{ labels[column.labelKey] }}</th><th class="actions-cell">{{ common.actions }}</th></tr></thead>
          <tbody>
            <tr v-for="(owner, index) in owners" :key="owner.id">
              <td class="index-cell">{{ (page - 1) * pageSize + index + 1 }}</td>
              <td v-for="column in visibleOwnerColumns" :key="column.key">
                <button v-if="column.key === 'name'" class="owner-name-button" type="button" @click="openDetail(owner.id)">{{ owner.name }}</button>
                <span v-else-if="column.key === 'ownerStatus'" class="status-chip" :class="owner.ownerStatus === 'ACTIVE' ? 'contract-status-active' : 'contract-status-uncontracted'">{{ owner.ownerStatus === 'ACTIVE' ? labels.active : labels.inactive }}</span>
                <template v-else>{{ ownerColumnValue(owner, column.key) }}</template>
              </td>
              <td class="actions-cell"><div class="row-actions"><button class="ghost-button mini" type="button" @click="openDetail(owner.id)">{{ labels.details }}</button></div></td>
            </tr>
            <tr v-if="!loading && !owners.length"><td :colspan="visibleOwnerColumns.length + 2" class="empty-cell">{{ common.noData }}</td></tr>
          </tbody>
        </table>
        </DualScrollTable>
      </div>
      <DataPagination v-model:page="page" v-model:page-size="pageSize" :total="total" :labels="common" />
    </div>
    </div>

    <div v-if="detailOpen" class="modal-overlay" @click.self="closeDetail">
      <div class="modal-card owner-detail-modal" role="dialog" aria-modal="true">
        <div class="modal-header"><h3>{{ form.id ? labels.ownerDetails : labels.newOwner }}</h3><button class="modal-close-button" type="button" @click="closeDetail">×</button></div>
        <form class="owner-form" @submit.prevent="saveOwner">
          <div class="field-grid">
            <label><span>{{ labels.name }}</span><input v-model.trim="form.name" required /></label>
            <label><span>{{ labels.nameKana }}</span><input v-model.trim="form.nameKana" /></label>
            <label><span>{{ labels.ownerType }}</span><select v-model="form.ownerType"><option value="PERSON">{{ labels.person }}</option><option value="COMPANY">{{ labels.company }}</option></select></label>
            <label><span>{{ labels.status }}</span><select v-model="form.ownerStatus"><option value="ACTIVE">{{ labels.active }}</option><option value="INACTIVE">{{ labels.inactive }}</option></select></label>
            <label><span>{{ labels.phone }}</span><input v-model.trim="form.phone" /></label>
            <label><span>{{ labels.email }}</span><input v-model.trim="form.email" type="email" /></label>
            <label class="span-2"><span>{{ labels.address }}</span><input v-model.trim="form.address" /></label>
            <label class="span-2"><span>{{ labels.remark }}</span><textarea v-model.trim="form.remark" rows="2" /></label>
          </div>
          <div class="modal-actions"><button class="secondary-button" type="button" @click="closeDetail">{{ common.cancel }}</button><button class="primary-button" type="submit" :disabled="saving">{{ common.save }}</button></div>
        </form>

        <section v-if="form.id" class="owner-rooms-section">
          <div class="section-title"><div><h4>{{ labels.linkedRooms }}</h4><p>{{ labels.linkedRoomsHelp }}</p></div><strong>{{ detail?.rooms?.length || 0 }}</strong></div>
          <div class="room-add-row"><input v-model="roomSearch" class="search-input" type="search" :placeholder="labels.roomSearchPlaceholder" @keyup.enter="searchRooms" /><button class="secondary-button" type="button" @click="searchRooms">{{ labels.searchRooms }}</button></div>
          <div v-if="roomOptions.length" class="room-options">
            <label v-for="room in roomOptions" :key="room.id"><input v-model="selectedRoomIds" type="checkbox" :value="room.id" /> <span>{{ room.label }}</span></label>
            <button class="primary-button" type="button" :disabled="!selectedRoomIds.length" @click="attachRooms">{{ labels.addRooms }}</button>
          </div>
          <div class="linked-room-list">
            <div v-for="room in detail?.rooms || []" :key="room.roomId" class="linked-room-row"><div><strong>{{ room.propertyName }}</strong><span>{{ room.roomNumber || labels.noRoomNumber }}</span></div><button class="danger-button mini" type="button" @click="removeRoom(room)">{{ labels.removeRoom }}</button></div>
            <p v-if="!detail?.rooms?.length" class="form-hint">{{ labels.noLinkedRooms }}</p>
          </div>
        </section>
      </div>
    </div>

    <div v-if="importResult" class="modal-overlay" @click.self="importResult = null">
      <div class="modal-card import-result-modal">
        <div class="modal-header"><h3>{{ labels.importResult }}</h3><button class="modal-close-button" type="button" @click="importResult = null">×</button></div>
        <div class="import-metrics"><span>{{ labels.totalRows }} <strong>{{ importResult.totalRows }}</strong></span><span>{{ labels.createdOwners }} <strong>{{ importResult.createdOwners }}</strong></span><span>{{ labels.importLinkedRooms }} <strong>{{ importResult.linkedRooms }}</strong></span><span>{{ labels.skippedLinks }} <strong>{{ importResult.skippedLinks }}</strong></span><span>{{ labels.unmatchedRows }} <strong>{{ importResult.unmatchedRows.length }}</strong></span></div>
        <div v-if="importResult.unmatchedRows.length" class="owner-table-wrap"><table class="data-table"><thead><tr><th>{{ labels.sourceRow }}</th><th>{{ labels.property }}</th><th>{{ labels.roomNumber }}</th><th>{{ labels.name }}</th><th>{{ labels.reason }}</th></tr></thead><tbody><tr v-for="row in importResult.unmatchedRows" :key="row.sourceRow"><td>{{ row.sourceRow }}</td><td>{{ row.propertyName }}</td><td>{{ row.roomNumber || labels.noRoomNumber }}</td><td>{{ row.ownerName }}</td><td>{{ reasonLabel(row.reason) }}</td></tr></tbody></table></div>
        <div class="modal-actions"><button class="primary-button" type="button" @click="importResult = null">{{ common.close }}</button></div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import DataPagination from '../components/DataPagination.vue';
import DualScrollTable from '../components/DualScrollTable.vue';
import { useI18n } from '../i18n';
import { api } from '../services/api';
import { requestConfirm } from '../services/confirm';
import { parseTableFile } from '../utils/tableFiles';

const { dictionary } = useI18n();
const labels = computed(() => dictionary.value.ownersLabels);
const common = computed(() => dictionary.value.common);
const blankForm = () => ({ id: '', name: '', nameKana: '', ownerType: 'PERSON', ownerStatus: 'ACTIVE', phone: '', email: '', address: '', remark: '' });
const owners = ref([]); const total = ref(0); const page = ref(1); const pageSize = ref(20); const search = ref('');
const loading = ref(false); const saving = ref(false); const importing = ref(false); const errorMessage = ref('');
const detailOpen = ref(false); const detail = ref(null); const form = ref(blankForm()); const fileInput = ref(null); const importResult = ref(null);
const roomSearch = ref(''); const roomOptions = ref([]); const selectedRoomIds = ref([]);
const showColumnPanel = ref(false);
const ownerColumns = ref([
  { key: 'name', labelKey: 'name', visible: true },
  { key: 'nameKana', labelKey: 'nameKana', visible: true },
  { key: 'phone', labelKey: 'phone', visible: true },
  { key: 'email', labelKey: 'email', visible: true },
  { key: 'roomCount', labelKey: 'roomCount', visible: true },
  { key: 'ownerStatus', labelKey: 'status', visible: false },
  { key: 'address', labelKey: 'address', visible: false },
]);
const visibleOwnerColumns = computed(() => ownerColumns.value.filter((column) => column.visible));
const resetOwnerColumns = () => { const defaults = new Set(['name', 'nameKana', 'phone', 'email', 'roomCount']); ownerColumns.value.forEach((column) => { column.visible = defaults.has(column.key); }); };
const ownerColumnValue = (owner, key) => owner[key] ?? '-';

let requestId = 0;
const loadOwners = async () => {
  const current = ++requestId; loading.value = true; errorMessage.value = '';
  try { const result = await api.listOwners({ search: search.value.trim(), page: page.value, pageSize: pageSize.value }); if (current !== requestId) return; owners.value = result.items || []; total.value = result.pagination?.total || 0; }
  catch (error) { if (current === requestId) errorMessage.value = error.message || labels.value.loadFailed; }
  finally { if (current === requestId) loading.value = false; }
};
const openNew = () => { form.value = blankForm(); detail.value = null; roomOptions.value = []; detailOpen.value = true; };
const openDetail = async (id) => {
  errorMessage.value = '';
  try { detail.value = await api.getOwner(id); form.value = { ...blankForm(), ...detail.value, phone: detail.value.phone || '', email: detail.value.email || '', address: detail.value.address || '', remark: detail.value.remark || '' }; roomOptions.value = []; selectedRoomIds.value = []; detailOpen.value = true; }
  catch (error) { errorMessage.value = error.message || labels.value.loadFailed; }
};
const closeDetail = () => { detailOpen.value = false; detail.value = null; form.value = blankForm(); const url = new URL(window.location.href); if (url.searchParams.has('ownerId')) { url.searchParams.delete('ownerId'); window.history.replaceState({}, '', `${url.pathname}${url.search}`); } };
const saveOwner = async () => {
  saving.value = true; errorMessage.value = '';
  try { const saved = form.value.id ? await api.updateOwner(form.value.id, form.value) : await api.createOwner(form.value); await loadOwners(); await openDetail(saved.id); }
  catch (error) { errorMessage.value = error.message || labels.value.saveFailed; }
  finally { saving.value = false; }
};
const searchRooms = async () => { roomOptions.value = (await api.searchRoomOptions(roomSearch.value.trim())).filter((option) => !(detail.value?.rooms || []).some((room) => room.roomId === option.id)); selectedRoomIds.value = []; };
const attachRooms = async () => { detail.value = await api.attachOwnerRooms(form.value.id, selectedRoomIds.value); form.value = { ...form.value, ...detail.value }; roomOptions.value = []; selectedRoomIds.value = []; await loadOwners(); };
const removeRoom = async (room) => { if (!(await requestConfirm(labels.value.removeRoomConfirm, { title: labels.value.removeRoom }))) return; detail.value = await api.detachOwnerRoom(form.value.id, room.roomId); await loadOwners(); };
const importFile = async (event) => {
  const [file] = event.target.files || []; if (!file) return; importing.value = true; errorMessage.value = '';
  try { const table = await parseTableFile(file); const headers = table[0] || []; const rows = table.slice(1).filter((row) => row.some((cell) => cell !== '' && cell != null)).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))); importResult.value = await api.importOwners({ originalName: file.name, rows }); await loadOwners(); }
  catch (error) { errorMessage.value = error.message || labels.value.importFailed; }
  finally { importing.value = false; event.target.value = ''; }
};
const reasonLabel = (reason) => labels.value.reasons?.[reason] || reason;
let searchTimer;
watch(search, () => { page.value = 1; clearTimeout(searchTimer); searchTimer = setTimeout(loadOwners, 300); });
watch([page, pageSize], loadOwners);
onMounted(async () => { await loadOwners(); const ownerId = new URLSearchParams(window.location.search).get('ownerId'); if (ownerId) await openDetail(ownerId); });
</script>

<style scoped>
.owners-page{min-width:0}.owner-table-wrap{overflow:auto}.owner-table{min-width:1120px}.owner-name-button{border:0;background:transparent;color:var(--primary);font-weight:800;text-decoration:underline;text-underline-offset:2px}.owner-detail-modal{width:min(900px,100%)}.owner-form{display:grid;gap:18px}.field-grid textarea{resize:vertical}.modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}.owner-rooms-section{margin-top:26px;padding-top:22px;border-top:1px solid var(--line)}.section-title{display:flex;align-items:start;justify-content:space-between;gap:12px}.section-title h4{margin:0}.section-title p{margin:5px 0 0;color:var(--muted);font-size:12px}.room-add-row{display:flex;gap:8px;margin-top:16px}.room-add-row input{flex:1}.room-options{display:grid;gap:8px;max-height:220px;overflow:auto;margin-top:10px;padding:12px;border:1px solid var(--line);border-radius:10px}.room-options label{display:flex;gap:8px}.room-options button{justify-self:end}.linked-room-list{display:grid;margin-top:14px}.linked-room-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 0;border-top:1px solid var(--line)}.linked-room-row div{display:grid;gap:3px}.linked-room-row span{color:var(--muted);font-size:12px}.import-result-modal{width:min(1050px,100%)}.import-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-bottom:16px}.import-metrics span{display:grid;gap:4px;padding:12px;border-radius:10px;background:var(--surface-2);font-size:12px}.import-metrics strong{font-size:20px}.empty-cell{text-align:center;color:var(--muted);padding:32px!important}@media(max-width:720px){.field-grid{grid-template-columns:1fr}.field-grid .span-2{grid-column:auto}.room-add-row{align-items:stretch;flex-direction:column}.import-metrics{grid-template-columns:repeat(2,1fr)}}
</style>
