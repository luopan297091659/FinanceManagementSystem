const API_BASE = import.meta.env?.VITE_API_BASE || '/api/v1';

async function request(path, { method = 'GET', body } = {}) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth-token') : null;
  if (token) {
    options.headers.Authorization = `Bearer ${token}`;
  }

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${path}`, options);
  if (!response.ok) {
    const text = await response.text();
    let message = text || 'request failed';
    try {
      const payload = JSON.parse(text);
      message = payload.message || payload.error || message;
      if (Array.isArray(message)) {
        message = message.join('; ');
      }
    } catch (e) {
      // Keep the raw text when the server did not return JSON.
    }
    if (response.status === 401) {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('auth-token');
        localStorage.removeItem('user');
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('auth-expired'));
      }
    }
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

export const api = {
  // Auth APIs
  async login(username, password) {
    return request('/rbac/login', { method: 'POST', body: { username, password } });
  },

  async getCurrentUser() {
    return request('/rbac/me');
  },

  async requestPasswordReset(username) {
    return request('/rbac/password-reset', { method: 'POST', body: { username } });
  },

  async confirmPasswordReset(token, password) {
    return request('/rbac/password-reset/confirm', { method: 'POST', body: { token, password } });
  },

  // User Management APIs
  async listUsers() {
    return request('/rbac/users');
  },

  async createUser(payload) {
    return request('/rbac/users', { method: 'POST', body: payload });
  },

  async updateUser(id, payload) {
    return request(`/rbac/users/${id}`, { method: 'PUT', body: payload });
  },

  async deleteUser(id) {
    return request(`/rbac/users/${id}`, { method: 'DELETE' });
  },

  // Role Management APIs
  async listRoles() {
    return request('/rbac/roles');
  },

  async listPermissions() {
    return request('/rbac/permissions');
  },

  async createRole(payload) {
    return request('/rbac/roles', { method: 'POST', body: payload });
  },

  async updateRole(id, payload) {
    return request(`/rbac/roles/${id}`, { method: 'PUT', body: payload });
  },

  async deleteRole(id) {
    return request(`/rbac/roles/${id}`, { method: 'DELETE' });
  },

  // Audit Log APIs
  async listAuditLogs() {
    return request('/rbac/audit-logs');
  },

  async getEmailSettings() {
    return request('/rbac/email-settings');
  },

  async saveEmailSettings(payload) {
    return request('/rbac/email-settings', { method: 'PUT', body: payload });
  },

  async testEmailSettings(to) {
    return request('/rbac/email-settings/test', { method: 'POST', body: { to } });
  },

  // Existing APIs
  async bootstrap() {
    return request('/bootstrap');
  },

  async createRoom(payload) {
    return request('/rooms', { method: 'POST', body: payload });
  },

  async getRoom(id) {
    return request(`/rooms/${id}`);
  },

  async updateRoom(id, payload) {
    return request(`/rooms/${id}`, { method: 'PUT', body: payload });
  },

  async deleteRoom(id) {
    return request(`/rooms/${id}`, { method: 'DELETE' });
  },

  async uploadPropertyImport(payload) {
    return request('/properties/import/upload', { method: 'POST', body: payload });
  },

  async getPropertyImportBatch(batchId, params = {}) {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== '')).toString();
    return request(`/properties/import/batches/${batchId}${query ? `?${query}` : ''}`);
  },

  async listPropertyImportBatches() {
    return request('/properties/import/batches');
  },

  async updatePropertyImportRow(batchId, rowId, payload) {
    return request(`/properties/import/${batchId}/rows/${rowId}`, { method: 'PATCH', body: payload });
  },

  async commitPropertyImport(batchId) {
    return request(`/properties/import/${batchId}/commit`, { method: 'POST', body: {} });
  },

  async getPropertyImportErrors(batchId) {
    return request(`/properties/import/${batchId}/errors`);
  },

  async createCustomer(payload) {
    return request('/customers', { method: 'POST', body: payload });
  },

  async updateCustomer(id, payload) {
    return request(`/customers/${id}`, { method: 'PUT', body: payload });
  },

  async deleteCustomer(id) {
    return request(`/customers/${id}`, { method: 'DELETE' });
  },

  async createBinding(payload) {
    return request('/bindings', { method: 'POST', body: payload });
  },

  async deleteBinding(id) {
    return request(`/bindings/${id}`, { method: 'DELETE' });
  },

  async createTransaction(payload) {
    return request('/transactions', { method: 'POST', body: payload });
  },

  async updateTransaction(id, payload) {
    return request(`/transactions/${id}`, { method: 'PUT', body: payload });
  },

  async deleteTransaction(id) {
    return request(`/transactions/${id}`, { method: 'DELETE' });
  },

  async createFeeItem(payload) {
    return request('/fee-items', { method: 'POST', body: payload });
  },

  async uploadBankReconciliation(payload) {
    return request('/reconciliation/bank/upload', { method: 'POST', body: payload });
  },

  async listReconciliationBatches() {
    return request('/reconciliation/bank/batches');
  },

  async getReconciliationBatch(id) {
    return request(`/reconciliation/bank/batches/${id}`);
  },

  async deleteReconciliationBatch(id) {
    return request(`/reconciliation/bank/batches/${id}`, { method: 'DELETE' });
  },

  async listReconciliationRecords(batchId, status) {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return request(`/reconciliation/bank/batches/${batchId}/records${query}`);
  },

  async parseReconciliationBatch(batchId) {
    return request(`/reconciliation/bank/batches/${batchId}/parse`, { method: 'POST', body: {} });
  },

  async matchReconciliationBatch(batchId, matchingRules) {
    return request(`/reconciliation/bank/batches/${batchId}/match`, { method: 'POST', body: { matchingRules } });
  },

  async submitReconciliationBatch(batchId) {
    return request(`/reconciliation/bank/batches/${batchId}/submit`, { method: 'POST', body: {} });
  },

  async exportReconciliationExcel(batchId) {
    return request(`/reconciliation/bank/batches/${batchId}/export-excel`);
  },

  async exportReconciliationUnmatchedJson(batchId) {
    return request(`/reconciliation/bank/batches/${batchId}/unmatched-json`);
  },

  async updateReconciliationRecord(recordId, payload) {
    return request(`/reconciliation/bank/records/${recordId}`, { method: 'PATCH', body: payload });
  },

  async manualMatchReconciliationRecord(recordId, payload) {
    return request(`/reconciliation/bank/records/${recordId}/manual-match`, { method: 'POST', body: payload });
  },

  async unmatchReconciliationRecord(recordId) {
    return request(`/reconciliation/bank/records/${recordId}/unmatch`, { method: 'POST', body: {} });
  },

  async getReconciliationCandidates(recordId) {
    return request(`/reconciliation/bank/records/${recordId}/candidates`);
  },

  async reconciliationProperties(search = '') {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    return request(`/reconciliation/bank/options/properties${query}`);
  },

  async reconciliationRooms(propertyId = '', search = '') {
    const params = new URLSearchParams();
    if (propertyId) params.set('propertyId', propertyId);
    if (search) params.set('search', search);
    const query = params.toString() ? `?${params.toString()}` : '';
    return request(`/reconciliation/bank/options/rooms${query}`);
  },

  async reconciliationContracts(roomId = '', transactionDate = '') {
    const params = new URLSearchParams();
    if (roomId) params.set('roomId', roomId);
    if (transactionDate) params.set('transactionDate', transactionDate);
    const query = params.toString() ? `?${params.toString()}` : '';
    return request(`/reconciliation/bank/options/contracts${query}`);
  },

  async syncReconciliationMasterData(rows) {
    return request('/reconciliation/bank/master-data/sync', { method: 'POST', body: { rows } });
  },

  async listAdminTranslations(params = {}) {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== '')).toString();
    return request(`/admin/i18n/translations${query ? `?${query}` : ''}`);
  },

  async createAdminTranslation(payload) {
    return request('/admin/i18n/translations', { method: 'POST', body: payload });
  },

  async updateAdminTranslation(id, payload) {
    return request(`/admin/i18n/translations/${id}`, { method: 'PATCH', body: payload });
  },

  async importAdminTranslations(rows, options = {}) {
    return request('/admin/i18n/import', { method: 'POST', body: { rows, ...options } });
  },

  async exportAdminTranslations(params = {}) {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== '')).toString();
    return request(`/admin/i18n/export${query ? `?${query}` : ''}`);
  },

  async publishAdminTranslations(version) {
    return request('/admin/i18n/publish', { method: 'POST', body: { version } });
  },

  async listTranslationVersions() {
    return request('/admin/i18n/versions');
  },

  async rollbackTranslationVersion(version) {
    return request(`/admin/i18n/versions/${encodeURIComponent(version)}/rollback`, { method: 'POST', body: {} });
  },
};
