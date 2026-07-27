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

  async updateRoom(id, payload) {
    return request(`/rooms/${id}`, { method: 'PUT', body: payload });
  },

  async deleteRoom(id) {
    return request(`/rooms/${id}`, { method: 'DELETE' });
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
};
