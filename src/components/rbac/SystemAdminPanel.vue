<template>
  <div class="system-admin">
    <!-- Users Tab -->
    <div v-if="activeTab === 'users'" class="tab-content">
      <div class="content-header">
        <h3>{{ dict.users }}</h3>
        <button v-if="can('user:create')" @click="openNewUser" class="primary-button">{{ dict.newUser }}</button>
      </div>
      <DualScrollTable wrapper-class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>{{ dict.username }}</th>
              <th>{{ dict.name }}</th>
              <th>{{ dict.email }}</th>
              <th>{{ dict.role }}</th>
              <th>{{ dict.status }}</th>
              <th>{{ dict.actions }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id">
              <td>{{ user.username }}</td>
              <td>{{ user.name }}</td>
              <td>{{ user.email || '-' }}</td>
              <td>{{ user.userRoles?.map(ur => ur.role.name).join(', ') || '-' }}</td>
              <td>
                <span :class="{ active: user.isActive, inactive: !user.isActive }" class="status-badge">
                  {{ user.isActive ? dict.active : dict.inactive }}
                </span>
              </td>
              <td class="actions-cell">
                <button v-if="can('user:update')" @click="editUser(user)" class="action-button edit">{{ dict.edit }}</button>
                <button v-if="can('user:delete') && user.username !== 'admin'" @click="deleteUser(user.id)" class="action-button delete">{{ dict.delete }}</button>
              </td>
            </tr>
          </tbody>
        </table>
      </DualScrollTable>
    </div>

    <!-- Roles Tab -->
    <div v-if="activeTab === 'roles'" class="tab-content">
      <div class="content-header">
        <h3>{{ dict.roles }}</h3>
        <button v-if="can('role:create')" @click="openNewRole" class="primary-button">{{ dict.newRole }}</button>
      </div>
      <DualScrollTable wrapper-class="table-wrapper">
        <table class="data-table role-table">
          <thead>
            <tr>
              <th>{{ dict.name }}</th>
              <th>{{ dict.code }}</th>
              <th>{{ dict.description }}</th>
              <th>{{ uiText.menuPermissions }}</th>
              <th>{{ dict.actions }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="role in roles" :key="role.id">
              <td class="role-name-cell">{{ role.name }}</td>
              <td><span class="role-code">{{ role.code }}</span></td>
              <td>{{ role.description || '-' }}</td>
              <td class="role-permission-summary">
                <div v-if="getRolePermissionSummary(role).length" class="permission-summary-list">
                  <span v-for="item in getRolePermissionSummary(role)" :key="item.key" class="permission-summary-item">
                    <strong>{{ item.label }}</strong>
                    <span>{{ item.actions.join(' / ') }}</span>
                  </span>
                </div>
                <span v-else>-</span>
              </td>
              <td class="actions-cell">
                <button v-if="can('role:update')" @click="editRole(role)" class="action-button edit">{{ dict.edit }}</button>
                <button v-if="can('role:delete') && !role.isSystem" @click="deleteRole(role.id)" class="action-button delete">
                  {{ dict.delete }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </DualScrollTable>
    </div>

    <!-- Audit Logs Tab -->
    <div v-if="activeTab === 'logs'" class="tab-content">
      <div class="content-header">
        <h3>{{ dict.auditLogs }}</h3>
        <button @click="loadLogs" class="secondary-button">{{ dict.refresh }}</button>
      </div>
      <DualScrollTable wrapper-class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>{{ dict.timestamp }}</th>
              <th>{{ dict.user }}</th>
              <th>{{ dict.action }}</th>
              <th>{{ dict.module }}</th>
              <th>{{ dict.details }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="log in logs" :key="log.id">
              <td>{{ formatDate(log.createdAt) }}</td>
              <td>{{ log.user?.username || '-' }}</td>
              <td>{{ log.action }}</td>
              <td>{{ log.module }}</td>
              <td class="details-cell">{{ log.details || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </DualScrollTable>
    </div>

    <!-- Email Settings Tab -->
    <div v-if="activeTab === 'email'" class="tab-content">
      <div class="content-header">
        <h3>{{ dict.emailSettings }}</h3>
        <button @click="loadEmailSettings" class="secondary-button">{{ dict.refresh }}</button>
      </div>
      <div class="settings-form">
        <div class="form-grid">
          <div class="form-group">
            <label>{{ dict.smtpHost }}</label>
            <input v-model="emailForm.smtp_host" type="text" placeholder="smtp.aliyun.com" />
          </div>
          <div class="form-group">
            <label>{{ dict.smtpPort }}</label>
            <input v-model.number="emailForm.smtp_port" type="number" min="1" />
          </div>
          <div class="form-group">
            <label>{{ dict.smtpUser }}</label>
            <input v-model="emailForm.smtp_user" type="text" placeholder="name@example.com" />
          </div>
          <div class="form-group">
            <label>{{ dict.smtpPassword }}</label>
            <input v-model="emailForm.smtp_pass" type="password" :placeholder="dict.leaveBlank" />
          </div>
          <div class="form-group">
            <label>{{ dict.fromName }}</label>
            <input v-model="emailForm.from_name" type="text" />
          </div>
          <div class="form-group">
            <label>{{ dict.dailyLimit }}</label>
            <input v-model.number="emailForm.daily_limit" type="number" min="1" />
          </div>
        </div>
        <label class="status-checkbox">
          <input v-model="emailForm.smtp_secure" type="checkbox" />
          {{ dict.smtpSecure }}
        </label>
        <div class="email-stats">{{ dict.sentToday }}: {{ sentToday }}</div>
        <div class="modal-actions">
          <button @click="saveEmailSettings" class="modal-button primary">{{ dict.save }}</button>
        </div>
      </div>

      <div class="settings-form test-form">
        <div class="form-group">
          <label>{{ dict.testEmail }}</label>
          <input v-model="testEmail" type="email" placeholder="name@example.com" />
        </div>
        <button @click="sendTestEmail" class="secondary-button">{{ dict.sendTest }}</button>
      </div>
    </div>

    <!-- Translation Management Tab -->
    <div v-if="activeTab === 'translations'" class="tab-content">
      <div class="content-header">
        <h3>{{ dict.translationManagement || 'Translation Management' }}</h3>
        <div class="header-actions">
          <button @click="loadTranslations" class="secondary-button">{{ dict.refresh }}</button>
          <button @click="openNewTranslation" class="primary-button">{{ dict.newTranslation || 'New Translation' }}</button>
        </div>
      </div>

      <div class="settings-form">
        <div class="form-grid">
          <div class="form-group">
            <label>{{ dict.key || 'Key' }}</label>
            <input v-model="translationFilters.key" type="search" placeholder="menu.bankReconciliation" />
          </div>
          <div class="form-group">
            <label>{{ dict.module }}</label>
            <input v-model="translationFilters.module" type="search" placeholder="menu" />
          </div>
          <div class="form-group">
            <label>{{ dict.locale || 'Locale' }}</label>
            <select v-model="translationFilters.locale">
              <option value="">All</option>
              <option value="ja-JP">ja-JP</option>
              <option value="zh-CN">zh-CN</option>
              <option value="en-US">en-US</option>
            </select>
          </div>
          <div class="form-group">
            <label>{{ dict.status }}</label>
            <select v-model="translationFilters.status">
              <option value="">All</option>
              <option value="DRAFT">DRAFT</option>
              <option value="PUBLISHED">PUBLISHED</option>
              <option value="DISABLED">DISABLED</option>
            </select>
          </div>
        </div>
        <div class="modal-actions">
          <button @click="loadTranslations" class="secondary-button">{{ dict.refresh }}</button>
          <button @click="exportTranslations" class="secondary-button">{{ dict.export || 'Export' }}</button>
          <button @click="triggerTranslationImport" class="secondary-button">{{ dict.import || 'Import' }}</button>
          <input ref="translationFileInput" class="hidden-file-input" type="file" accept=".json,.csv,.tsv,.html,.xls,.xlsx" @change="importTranslations" />
        </div>
      </div>

      <div class="settings-form publish-form">
        <div class="form-group">
          <label>{{ dict.version || 'Version' }}</label>
          <input v-model="translationVersion" type="text" placeholder="2026.07.28.1" />
        </div>
        <button @click="publishTranslations" class="primary-button">{{ dict.publish || 'Publish' }}</button>
      </div>

      <div v-if="translationImportPreview" class="settings-form">
        <h4>{{ dict.importPreview || 'Import Preview' }}</h4>
        <p>{{ translationImportPreview.validCount }} valid, {{ translationImportPreview.failedCount }} failed, {{ translationImportPreview.duplicateCount }} duplicates</p>
        <div class="modal-actions">
          <select v-model="translationImportMode">
            <option value="skip">Skip existing</option>
            <option value="overwrite">Overwrite existing</option>
            <option value="create">Create only</option>
          </select>
          <button @click="commitTranslationImport" class="primary-button">{{ dict.save }}</button>
        </div>
      </div>

      <DualScrollTable wrapper-class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>{{ dict.key || 'Key' }}</th>
              <th>{{ dict.module }}</th>
              <th>{{ dict.locale || 'Locale' }}</th>
              <th>{{ dict.version || 'Version' }}</th>
              <th>{{ dict.status }}</th>
              <th>{{ dict.details }}</th>
              <th>{{ dict.actions }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in translations" :key="entry.id">
              <td>{{ entry.key }}</td>
              <td>{{ entry.module }}</td>
              <td>{{ entry.locale }}</td>
              <td>{{ entry.version }}</td>
              <td>{{ entry.status }}</td>
              <td class="translation-value">{{ entry.value }}</td>
              <td class="actions-cell">
                <button @click="editTranslation(entry)" class="action-button edit">{{ dict.edit }}</button>
              </td>
            </tr>
          </tbody>
        </table>
      </DualScrollTable>
    </div>

    <div v-if="notice" :class="['notice', notice.type]">{{ notice.message }}</div>

    <!-- User Modal -->
    <div v-if="showUserModal" class="modal-overlay" @click="closeUserModal">
      <div class="modal-card" @click.stop>
        <h2>{{ editingUser ? dict.editUser : dict.newUser }}</h2>
        <div class="form-group">
          <label>{{ dict.username }}</label>
          <input v-model="userForm.username" type="text" :disabled="!!editingUser" />
        </div>
        <div class="form-group">
          <label>{{ dict.name }}</label>
          <input v-model="userForm.name" type="text" />
        </div>
        <div class="form-group">
          <label>{{ dict.email }}</label>
          <input v-model="userForm.email" type="email" />
        </div>
        <div class="form-group">
          <label>{{ dict.password }}</label>
          <input v-model="userForm.password" type="password" :placeholder="editingUser ? dict.leaveBlank : ''" />
        </div>
        <div class="form-group">
          <label>{{ dict.role }}</label>
          <select v-model="userForm.roleId">
            <option value="">{{ dict.selectRole }}</option>
            <option v-for="role in roles" :key="role.id" :value="role.id">
              {{ role.name }}
            </option>
          </select>
        </div>
        <label class="status-checkbox">
          <input v-model="userForm.isActive" type="checkbox" />
          {{ dict.active }}
        </label>
        <div class="modal-actions">
          <button @click="saveUser" class="modal-button primary">{{ dict.save }}</button>
          <button @click="closeUserModal" class="modal-button">{{ dict.cancel }}</button>
        </div>
      </div>
    </div>

    <!-- Role Modal -->
    <div v-if="showRoleModal" class="modal-overlay" @click="closeRoleModal">
      <div class="modal-card wide" @click.stop>
        <h2>{{ editingRole ? dict.editRole : dict.newRole }}</h2>
        <div class="form-group">
          <label>{{ dict.name }}</label>
          <input v-model="roleForm.name" type="text" />
        </div>
        <div class="form-group">
          <label>{{ dict.code }}</label>
          <input v-model="roleForm.code" type="text" />
        </div>
        <div class="form-group">
          <label>{{ dict.description }}</label>
          <textarea v-model="roleForm.description" rows="3"></textarea>
        </div>
        <div class="form-group">
          <label>{{ uiText.menuPermissions }}</label>
          <p class="permissions-help">{{ uiText.permissionsHelp }}</p>
          <div class="permission-matrix-wrapper">
            <table class="permission-matrix">
              <thead>
                <tr>
                  <th>{{ uiText.functionMenu }}</th>
                  <th v-for="action in permissionActions" :key="action.key">{{ action.label }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="group in permissionGroups" :key="group.key">
                  <td>
                    <strong>{{ group.label }}</strong>
                    <small v-if="group.readOnly">{{ uiText.viewOnly }}</small>
                  </td>
                  <td v-for="action in permissionActions" :key="action.key" class="permission-action-cell">
                    <input
                      v-if="availablePermissionIds(group.actions[action.key]).length"
                      type="checkbox"
                      :aria-label="`${group.label} - ${action.label}`"
                      :checked="isPermissionActionChecked(group, action.key)"
                      @change="(e) => togglePermissionAction(group, action.key, e.target.checked)"
                    />
                    <span v-else class="permission-unavailable">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="modal-actions">
          <button @click="saveRole" class="modal-button primary">{{ dict.save }}</button>
          <button @click="closeRoleModal" class="modal-button">{{ dict.cancel }}</button>
        </div>
      </div>
    </div>

    <!-- Translation Modal -->
    <div v-if="showTranslationModal" class="modal-overlay" @click="closeTranslationModal">
      <div class="modal-card wide" @click.stop>
        <h2>{{ editingTranslation ? (dict.editTranslation || 'Edit Translation') : (dict.newTranslation || 'New Translation') }}</h2>
        <div class="form-grid">
          <div class="form-group">
            <label>{{ dict.key || 'Key' }}</label>
            <input v-model="translationForm.key" type="text" />
          </div>
          <div class="form-group">
            <label>{{ dict.module }}</label>
            <input v-model="translationForm.module" type="text" />
          </div>
          <div class="form-group">
            <label>{{ dict.locale || 'Locale' }}</label>
            <select v-model="translationForm.locale">
              <option value="ja-JP">ja-JP</option>
              <option value="zh-CN">zh-CN</option>
              <option value="en-US">en-US</option>
            </select>
          </div>
          <div class="form-group">
            <label>{{ dict.version || 'Version' }}</label>
            <input v-model="translationForm.version" type="text" />
          </div>
        </div>
        <div class="form-group">
          <label>{{ dict.details }}</label>
          <textarea v-model="translationForm.value" rows="4"></textarea>
        </div>
        <div class="form-group">
          <label>{{ dict.description }}</label>
          <textarea v-model="translationForm.description" rows="2"></textarea>
        </div>
        <label class="status-checkbox">
          <input v-model="translationForm.enabled" type="checkbox" />
          {{ dict.active }}
        </label>
        <div class="modal-actions">
          <button @click="saveTranslation" class="modal-button primary">{{ dict.save }}</button>
          <button @click="closeTranslationModal" class="modal-button">{{ dict.cancel }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { locale, messages } from '../../i18n.js';
import { api } from '../../services/api.js';
import { exportTableXls, parseTableFile } from '../../utils/tableFiles.js';
import DualScrollTable from '../DualScrollTable.vue';

const props = defineProps({
  permissions: {
    type: Array,
    default: () => [],
  },
  initialTab: {
    type: String,
    default: 'users',
  },
});

const activeTab = ref(props.initialTab);
const users = ref([]);
const roles = ref([]);
const logs = ref([]);
const allPermissions = ref([]);
const notice = ref(null);
const sentToday = ref(0);
const testEmail = ref('');
const translations = ref([]);
const translationVersions = ref([]);
const translationFileInput = ref(null);
const translationImportRows = ref([]);
const translationImportPreview = ref(null);
const translationImportMode = ref('skip');
const translationVersion = ref(new Date().toISOString().slice(0, 10).replaceAll('-', '.') + '.1');

const showUserModal = ref(false);
const showRoleModal = ref(false);
const editingUser = ref(null);
const editingRole = ref(null);

const userForm = ref({ username: '', name: '', email: '', password: '', roleId: '', isActive: true });
const roleForm = ref({ name: '', code: '', description: '', permissions: [] });
const emailForm = ref({
  smtp_host: '',
  smtp_port: 465,
  smtp_user: '',
  smtp_pass: '',
  smtp_secure: true,
  from_name: '',
  daily_limit: 200,
});
const translationFilters = ref({ key: '', module: '', locale: '', status: '' });
const showTranslationModal = ref(false);
const editingTranslation = ref(null);
const translationForm = ref({
  key: '',
  module: '',
  locale: 'ja-JP',
  value: '',
  description: '',
  version: translationVersion.value,
  enabled: true,
});

const dict = computed(() => messages[locale.value].system || messages[locale.value].systemAdmin);

const uiText = computed(() => ({
  ja: {
    menuPermissions: '機能メニュー権限', functionMenu: '機能メニュー', permissionsHelp: 'メニューごとに操作権限を設定します。対応しない操作は選択できません。',
    viewOnly: '閲覧のみ', view: '閲覧', create: '追加', update: '編集', delete: '削除',
    overview: '業務概要', gis: 'GIS 地図', resources: '物件管理', contracts: '契約管理', finance: '会計管理', bank: '銀行明細照合', ocr: 'OCR 照合', knowledge: 'AI ナレッジベース',
    users: 'ユーザー管理', roles: '権限管理', audit: '監査ログ', email: 'メール設定', translations: '翻訳管理',
  },
  zh: {
    menuPermissions: '功能菜单权限', functionMenu: '功能菜单', permissionsHelp: '按功能菜单配置操作权限，不适用的操作不可选择。',
    viewOnly: '仅支持查看', view: '查看', create: '新增', update: '修改', delete: '删除',
    overview: '业务概览', gis: 'GIS 地图', resources: '房源管理', contracts: '签约管理', finance: '财务中心', bank: '银行账单对账', ocr: 'OCR 对账', knowledge: 'AI 知识库',
    users: '用户管理', roles: '权限管理', audit: '审计日志', email: '邮箱配置', translations: '翻译管理',
  },
}[locale.value] || {
  menuPermissions: 'Feature permissions', functionMenu: 'Feature menu', permissionsHelp: 'Configure operations by feature menu. Unsupported operations cannot be selected.',
  viewOnly: 'View only', view: 'View', create: 'Create', update: 'Edit', delete: 'Delete',
  overview: 'Overview', gis: 'GIS map', resources: 'Properties', contracts: 'Contracts', finance: 'Finance', bank: 'Bank reconciliation', ocr: 'OCR reconciliation', knowledge: 'AI knowledge base',
  users: 'User management', roles: 'Permission management', audit: 'Audit logs', email: 'Email settings', translations: 'Translation management',
}));

const permissionActions = computed(() => [
  { key: 'view', label: uiText.value.view },
  { key: 'create', label: uiText.value.create },
  { key: 'update', label: uiText.value.update },
  { key: 'delete', label: uiText.value.delete },
]);

const permissionGroups = computed(() => [
  {
    key: 'overview', label: uiText.value.overview, readOnly: true,
    actions: { view: ['overview:view'], create: [], update: [], delete: [] },
  },
  {
    key: 'gis', label: uiText.value.gis, readOnly: true,
    actions: { view: ['gis:view'], create: [], update: [], delete: [] },
  },
  {
    key: 'resources', label: uiText.value.resources,
    actions: {
      view: ['property:view', 'property.view', 'property.owner.view', 'room.view'],
      create: ['property:create', 'property.create', 'property.import', 'property.import.commit', 'room.create'],
      update: ['property:update', 'property.edit', 'property.owner.edit', 'room.edit'],
      delete: ['property:delete'],
    },
  },
  {
    key: 'contracts', label: uiText.value.contracts,
    actions: {
      view: ['contract.view', 'contract.charge.view', 'owner.financial.view', 'tenant:view'],
      create: ['contract.create', 'contract.import', 'integrated-import.preview', 'integrated-import.commit', 'tenant:create'],
      update: ['contract.edit', 'contract.status.edit', 'contract.charge.edit', 'owner.financial.edit', 'tenant:update'],
      delete: ['tenant:delete'],
    },
  },
  {
    key: 'finance', label: uiText.value.finance,
    actions: { view: ['payment:view'], create: ['payment:create'], update: ['payment:update', 'payment:export'], delete: ['payment:delete'] },
  },
  {
    key: 'bank', label: uiText.value.bank,
    actions: {
      view: ['reconciliation:view', 'reconciliation.bank.view', 'reconciliation.bank.history'],
      create: ['reconciliation.bank.upload', 'reconciliation.bank.parse', 'reconciliation.bank.master-data.sync'],
      update: ['reconciliation:execute', 'reconciliation:confirm', 'reconciliation.bank.match', 'reconciliation.bank.edit', 'reconciliation.bank.review', 'reconciliation.bank.submit', 'reconciliation.bank.export'],
      delete: [],
    },
  },
  {
    key: 'ocr', label: uiText.value.ocr,
    actions: { view: ['reconciliation.ocr.view'], create: ['ocr:execute'], update: [], delete: [] },
  },
  {
    key: 'knowledge', label: uiText.value.knowledge, readOnly: true,
    actions: { view: ['knowledge:view'], create: [], update: [], delete: [] },
  },
  {
    key: 'users', label: uiText.value.users,
    actions: { view: ['user:view'], create: ['user:create'], update: ['user:update', 'user:reset_password'], delete: ['user:delete'] },
  },
  {
    key: 'roles', label: uiText.value.roles,
    actions: { view: ['role:view'], create: ['role:create'], update: ['role:update'], delete: ['role:delete'] },
  },
  {
    key: 'audit', label: uiText.value.audit, readOnly: true,
    actions: { view: ['audit_log:view'], create: [], update: [], delete: [] },
  },
  {
    key: 'email', label: uiText.value.email,
    actions: { view: ['setting:email'], create: [], update: [], delete: [] },
  },
  {
    key: 'translations', label: uiText.value.translations,
    actions: {
      view: ['i18n.translation.view'], create: ['i18n.translation.import'],
      update: ['i18n.translation.edit', 'i18n.translation.publish', 'i18n.translation.export'], delete: [],
    },
  },
]);

const permissionByKey = computed(() => new Map(allPermissions.value.map((permission) => [permission.key, permission])));

const availablePermissionIds = (keys = []) => keys
  .map((key) => permissionByKey.value.get(key)?.id)
  .filter(Boolean);

const isPermissionActionChecked = (group, actionKey) => {
  const ids = availablePermissionIds(group.actions[actionKey]);
  return ids.length > 0 && ids.every((id) => roleForm.value.permissions.includes(id));
};

const togglePermissionAction = (group, actionKey, checked) => {
  const ids = availablePermissionIds(group.actions[actionKey]);
  if (checked) {
    roleForm.value.permissions = [...new Set([...roleForm.value.permissions, ...ids])];
  } else {
    const removed = new Set(ids);
    roleForm.value.permissions = roleForm.value.permissions.filter((id) => !removed.has(id));
  }
};

const getRolePermissionSummary = (role) => {
  const selectedKeys = new Set(role.rolePermissions?.map((entry) => entry.permission?.key).filter(Boolean) || []);
  return permissionGroups.value.map((group) => {
    const actions = permissionActions.value
      .filter((action) => group.actions[action.key].some((key) => selectedKeys.has(key)))
      .map((action) => action.label);
    return { key: group.key, label: group.label, actions };
  }).filter((item) => item.actions.length);
};

const can = (permission) => props.permissions.includes(permission);

const tabs = computed(() => [
  { key: 'users', label: dict.value.users, permission: 'user:view' },
  { key: 'roles', label: dict.value.roles, permission: 'role:view' },
  { key: 'logs', label: dict.value.auditLogs, permission: 'audit_log:view' },
  { key: 'email', label: dict.value.emailSettings, permission: 'setting:email' },
  { key: 'translations', label: dict.value.translationManagement || 'Translation Management', permission: 'i18n.translation.view' },
].filter((tab) => can(tab.permission)));

const showNotice = (message, type = 'error') => {
  notice.value = { message, type };
};

const formatDate = (dateStr) => {
  return new Date(dateStr).toLocaleString(locale.value === 'zh' ? 'zh-CN' : 'ja-JP');
};

const loadUsers = async () => {
  if (!can('user:view')) return;
  try {
    users.value = await api.listUsers();
  } catch (e) {
    showNotice(e.message || 'Failed to load users');
  }
};

const loadRoles = async () => {
  if (!can('role:view')) return;
  try {
    roles.value = await api.listRoles();
    allPermissions.value = await api.listPermissions();
  } catch (e) {
    showNotice(e.message || 'Failed to load roles');
  }
};

const loadLogs = async () => {
  if (!can('audit_log:view')) return;
  try {
    logs.value = await api.listAuditLogs();
  } catch (e) {
    showNotice(e.message || 'Failed to load logs');
  }
};

const loadEmailSettings = async () => {
  if (!can('setting:email')) return;
  try {
    const result = await api.getEmailSettings();
    emailForm.value = {
      ...emailForm.value,
      ...(result.email_settings || {}),
    };
    sentToday.value = result.sent_today || 0;
  } catch (e) {
    showNotice(e.message || 'Failed to load email settings');
  }
};

const loadTranslations = async () => {
  if (!can('i18n.translation.view')) return;
  try {
    translations.value = await api.listAdminTranslations(translationFilters.value);
    translationVersions.value = await api.listTranslationVersions();
  } catch (e) {
    showNotice(e.message || 'Failed to load translations');
  }
};

const loadData = async () => {
  await Promise.all([loadUsers(), loadRoles(), loadLogs(), loadEmailSettings(), loadTranslations()]);
};

const resetUserForm = () => {
  editingUser.value = null;
  userForm.value = { username: '', name: '', email: '', password: '', roleId: '', isActive: true };
};

const resetRoleForm = () => {
  editingRole.value = null;
  roleForm.value = { name: '', code: '', description: '', permissions: [] };
};

const openNewUser = () => {
  resetUserForm();
  showUserModal.value = true;
};

const closeUserModal = () => {
  showUserModal.value = false;
  resetUserForm();
};

const openNewRole = () => {
  resetRoleForm();
  showRoleModal.value = true;
};

const closeRoleModal = () => {
  showRoleModal.value = false;
  resetRoleForm();
};

const editUser = (user) => {
  editingUser.value = user;
  userForm.value = {
    username: user.username,
    name: user.name,
    email: user.email,
    password: '',
    roleId: user.userRoles?.[0]?.roleId || '',
    isActive: user.isActive,
  };
  showUserModal.value = true;
};

const saveUser = async () => {
  try {
    if (editingUser.value) {
      await api.updateUser(editingUser.value.id, userForm.value);
    } else {
      await api.createUser(userForm.value);
    }
    closeUserModal();
    await loadUsers();
    showNotice(dict.value.saveSuccess || 'Saved', 'success');
  } catch (e) {
    showNotice(e.message || 'Failed to save user');
  }
};

const deleteUser = async (id) => {
  if (confirm(dict.value.confirmDelete)) {
    try {
      await api.deleteUser(id);
      await loadUsers();
      showNotice(dict.value.deleteSuccess || 'Deleted', 'success');
    } catch (e) {
      showNotice(e.message || 'Failed to delete user');
    }
  }
};

const editRole = (role) => {
  editingRole.value = role;
  roleForm.value = {
    name: role.name,
    code: role.code,
    description: role.description,
    permissions: role.rolePermissions?.map(rp => rp.permissionId) || [],
  };
  showRoleModal.value = true;
};

const saveRole = async () => {
  try {
    if (editingRole.value) {
      await api.updateRole(editingRole.value.id, roleForm.value);
    } else {
      await api.createRole(roleForm.value);
    }
    closeRoleModal();
    await loadRoles();
    showNotice(dict.value.saveSuccess || 'Saved', 'success');
  } catch (e) {
    showNotice(e.message || 'Failed to save role');
  }
};

const deleteRole = async (id) => {
  if (confirm(dict.value.confirmDelete)) {
    try {
      await api.deleteRole(id);
      await loadRoles();
      showNotice(dict.value.deleteSuccess || 'Deleted', 'success');
    } catch (e) {
      showNotice(e.message || 'Failed to delete role');
    }
  }
};

const saveEmailSettings = async () => {
  try {
    const result = await api.saveEmailSettings(emailForm.value);
    emailForm.value = {
      ...emailForm.value,
      ...(result.email_settings || {}),
    };
    showNotice(dict.value.saveSuccess || 'Saved', 'success');
  } catch (e) {
    showNotice(e.message || 'Failed to save email settings');
  }
};

const sendTestEmail = async () => {
  try {
    await api.testEmailSettings(testEmail.value);
    showNotice(dict.value.testSent || 'Test email sent', 'success');
  } catch (e) {
    showNotice(e.message || 'Failed to send test email');
  }
};

const resetTranslationForm = () => {
  editingTranslation.value = null;
  translationForm.value = {
    key: '',
    module: '',
    locale: 'ja-JP',
    value: '',
    description: '',
    version: translationVersion.value,
    enabled: true,
  };
};

const openNewTranslation = () => {
  resetTranslationForm();
  showTranslationModal.value = true;
};

const closeTranslationModal = () => {
  showTranslationModal.value = false;
  resetTranslationForm();
};

const editTranslation = (entry) => {
  editingTranslation.value = entry;
  translationForm.value = { ...entry };
  showTranslationModal.value = true;
};

const saveTranslation = async () => {
  try {
    if (editingTranslation.value) await api.updateAdminTranslation(editingTranslation.value.id, translationForm.value);
    else await api.createAdminTranslation(translationForm.value);
    closeTranslationModal();
    await loadTranslations();
    showNotice(dict.value.saveSuccess || 'Saved', 'success');
  } catch (e) {
    showNotice(e.message || 'Failed to save translation');
  }
};

const triggerTranslationImport = () => {
  translationFileInput.value?.click();
};

const importTranslations = async (event) => {
  const [file] = event.target.files || [];
  if (!file) return;
  try {
    if (file.name.toLowerCase().endsWith('.json')) {
      const payload = JSON.parse(await file.text());
      translationImportRows.value = payload.translations || [];
      translationVersion.value = payload.version || translationVersion.value;
    } else {
      const rows = await parseTableFile(file);
      const [header = [], ...dataRows] = rows;
      translationImportRows.value = dataRows.map((row) => Object.fromEntries(header.map((key, index) => [key, row[index] ?? ''])));
    }
    translationImportPreview.value = await api.importAdminTranslations(translationImportRows.value, { preview: true, version: translationVersion.value });
  } catch (e) {
    showNotice(e.message || 'Failed to preview translation import');
  } finally {
    event.target.value = '';
  }
};

const commitTranslationImport = async () => {
  try {
    await api.importAdminTranslations(translationImportRows.value, { version: translationVersion.value, mode: translationImportMode.value });
    translationImportPreview.value = null;
    translationImportRows.value = [];
    await loadTranslations();
    showNotice(dict.value.saveSuccess || 'Imported', 'success');
  } catch (e) {
    showNotice(e.message || 'Failed to import translations');
  }
};

const exportTranslations = async () => {
  try {
    const rows = await api.exportAdminTranslations(translationFilters.value);
    exportTableXls('translations.xls', [
      { key: 'key', label: 'key' },
      { key: 'module', label: 'module' },
      { key: 'locale', label: 'locale' },
      { key: 'value', label: 'value' },
      { key: 'version', label: 'version' },
      { key: 'status', label: 'status' },
      { key: 'description', label: 'description' },
      { key: 'enabled', label: 'enabled' },
    ], rows);
  } catch (e) {
    showNotice(e.message || 'Failed to export translations');
  }
};

const publishTranslations = async () => {
  try {
    await api.publishAdminTranslations(translationVersion.value);
    await loadTranslations();
    showNotice(dict.value.saveSuccess || 'Published', 'success');
  } catch (e) {
    showNotice(e.message || 'Failed to publish translations');
  }
};

onMounted(() => {
  if (!tabs.value.some((tab) => tab.key === activeTab.value) && tabs.value[0]) {
    activeTab.value = tabs.value[0].key;
  }
  loadData();
});

watch(() => props.initialTab, (tab) => {
  if (tabs.value.some((item) => item.key === tab)) {
    activeTab.value = tab;
  }
});
</script>

<style scoped>
.system-admin {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 16px;
}

.tab-content {
  flex: 1;
  overflow-y: auto;
}

.content-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
}

.content-header h3 {
  margin: 0;
  font-size: 16px;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.notice {
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 13px;
  border: 1px solid transparent;
}

.notice.success {
  background: #e8f5e9;
  color: #1b5e20;
  border-color: #a5d6a7;
}

.notice.error {
  background: #ffebee;
  color: #b71c1c;
  border-color: #ef9a9a;
}

.settings-form {
  background: white;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.email-stats {
  margin-top: 12px;
  color: #666;
  font-size: 13px;
}

.test-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 12px;
}

.publish-form {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto;
  align-items: end;
  gap: 12px;
}

.hidden-file-input {
  display: none;
}

.translation-value {
  max-width: 360px;
  white-space: normal;
}

.table-wrapper {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  font-size: 14px;
}

.data-table thead {
  background: #f9f9f9;
  border-bottom: 1px solid var(--line);
}

.data-table th {
  padding: 12px;
  text-align: left;
  font-weight: 600;
  color: #333;
}

.data-table td {
  padding: 12px;
  border-bottom: 1px solid var(--line);
  color: #666;
}

.data-table tbody tr:hover {
  background: #f5f5f5;
}

.status-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.active {
  background: #e8f5e9;
  color: #2e7d32;
}

.status-badge.inactive {
  background: #ffebee;
  color: #c62828;
}

.actions-cell {
  display: flex;
  gap: 8px;
}

.action-button {
  padding: 6px 12px;
  border: 1px solid #ddd;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.3s;
}

.action-button:hover {
  border-color: #667eea;
  color: #667eea;
}

.action-button.delete:hover {
  border-color: #8f1d14;
  background: #8f1d14;
  color: #ffffff;
}

.action-button.delete {
  border-color: #b42318;
  background: #b42318;
  color: #ffffff;
}

.role-code {
  background: #f0f0f0;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  color: #666;
}

.role-name-cell {
  min-width: 120px;
  font-weight: 600;
  color: #1f2937 !important;
}

.role-permission-summary {
  min-width: 360px;
}

.permission-summary-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.permission-summary-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 5px;
  background: #eef7f6;
  color: #48605e;
  font-size: 12px;
}

.permission-summary-item strong {
  color: #1f4542;
}

.details-cell {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-card {
  background: white;
  border-radius: 8px;
  padding: 24px;
  max-width: 500px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-card.wide {
  max-width: 880px;
}

.modal-card h2 {
  margin: 0 0 20px;
  font-size: 18px;
  color: #333;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  font-size: 14px;
  color: #333;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  font-family: inherit;
  box-sizing: border-box;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.permissions-help {
  margin: -2px 0 10px;
  color: #77818d;
  font-size: 12px;
}

.permission-matrix-wrapper {
  overflow-x: auto;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}

.permission-matrix {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
}

.permission-matrix th,
.permission-matrix td {
  padding: 10px 12px;
  border-bottom: 1px solid #edf0f3;
  text-align: center;
  font-size: 13px;
}

.permission-matrix th:first-child,
.permission-matrix td:first-child {
  min-width: 180px;
  text-align: left;
}

.permission-matrix thead {
  background: #f7f9fb;
}

.permission-matrix tbody tr:last-child td {
  border-bottom: 0;
}

.permission-matrix td small {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 6px;
  border-radius: 10px;
  background: #f1f3f5;
  color: #7b8490;
  font-weight: 400;
}

.permission-action-cell input {
  width: 16px;
  height: 16px;
  accent-color: var(--primary, #0f766e);
  cursor: pointer;
}

.permission-unavailable {
  color: #c3c9d0;
}

.status-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #333;
  font-size: 14px;
  cursor: pointer;
}

.status-checkbox input {
  width: auto;
}

.modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
  justify-content: flex-end;
}

.modal-button {
  padding: 10px 20px;
  border: 1px solid #ddd;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s;
}

.modal-button.primary {
  background: #667eea;
  color: white;
  border-color: #667eea;
}

.modal-button:hover {
  opacity: 0.9;
}

.primary-button,
.secondary-button {
  padding: 8px 16px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s;
}

.primary-button {
  background: #667eea;
  color: white;
}

.primary-button:hover {
  opacity: 0.9;
}

.secondary-button {
  background: #f0f0f0;
  color: #333;
  border: 1px solid #ddd;
}

.secondary-button:hover {
  background: #e8e8e8;
}

@media (max-width: 768px) {
  .actions-cell {
    flex-direction: column;
  }

  .form-grid,
  .test-form {
    grid-template-columns: 1fr;
  }
}
</style>
