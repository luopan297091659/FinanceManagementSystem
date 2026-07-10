const API_BASE = import.meta.env?.VITE_API_BASE || '/api/v1';

async function request(path, { method = 'GET', body } = {}) {
  const options = {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
  };

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${path}`, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'request failed');
  }

  if (response.status === 204) return null;
  return response.json();
}

export const api = {
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
  async createFeeItem(payload) {
    return request('/fee-items', { method: 'POST', body: payload });
  },
};
