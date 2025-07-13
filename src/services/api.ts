const API_BASE_URL = 'http://localhost:3001/api';

class ApiService {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('token');
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('token');
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(this.token && { Authorization: `Bearer ${this.token}` }),
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Network error' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Auth
  async login(username: string, password: string) {
    const response = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    this.setToken(response.token);
    return response;
  }

  async getCurrentUser() {
    return this.request('/auth/me');
  }

  async initDemo() {
    return this.request('/auth/init-demo', { method: 'POST' });
  }

  // Departments
  async getDepartments() {
    return this.request('/departments');
  }

  async getDepartment(id: string) {
    return this.request(`/departments/${id}`);
  }

  async createDepartment(department: any) {
    return this.request('/departments', {
      method: 'POST',
      body: JSON.stringify(department),
    });
  }

  async updateDepartment(id: string, department: any) {
    return this.request(`/departments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(department),
    });
  }

  async getAllDepartments() {
    return this.request('/departments/admin/all');
  }

  async deleteDepartment(id: string) {
    return this.request(`/departments/${id}`, {
      method: 'DELETE',
    });
  }

  // Machines
  async getMachinesByDepartment(departmentId: string) {
    return this.request(`/machines/department/${departmentId}`);
  }

  async getMachine(id: string) {
    return this.request(`/machines/${id}`);
  }

  async getMachines() {
    return this.request('/machines');
  }

  async createMachine(machine: any) {
    return this.request('/machines', {
      method: 'POST',
      body: JSON.stringify(machine),
    });
  }

  async updateMachine(id: string, machineData: any) {
    return this.request(`/machines/${id}`, {
      method: 'PUT',
      body: JSON.stringify(machineData),
    });
  }

  async updateMachinePosition(id: string, position: { x: number; y: number }) {
    return this.request(`/machines/${id}/position`, {
      method: 'PATCH',
      body: JSON.stringify(position),
    });
  }

  async deleteMachine(id: string) {
  return this.request(`/machines/${id}`, {
    method: 'DELETE',
  });
}

  // Users
  async getUsers() {
    return this.request('/users');
  }

  async createUser(user: any) {
    return this.request('/users', {
      method: 'POST',
      body: JSON.stringify(user),
    });
  }

  async updateUser(id: string, user: any) {
    return this.request(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(user),
    });
  }

  async deleteUser(id: string) {
    return this.request(`/users/${id}`, {
      method: 'DELETE',
    });
  }

  // Analytics
  async getProductionTimeline(machineId: string) {
    return this.request(`/analytics/production-timeline/${machineId}`);
  }

  async getMachineStats(machineId: string, period: string = '24h') {
    return this.request(`/analytics/machine-stats/${machineId}?period=${period}`);
  }

  async addStoppageRecord(stoppage: any) {
    return this.request('/analytics/stoppage', {
      method: 'POST',
      body: JSON.stringify(stoppage),
    });
  }

  async updateStoppageRecord(id: string, stoppage: any) {
    return this.request(`/analytics/stoppage/${id}`, {
      method: 'PUT',
      body: JSON.stringify(stoppage),
    });
  }

  // Configuration
  async getConfig() {
    return this.request('/config');
  }

  async updateConfig(config: any) {
    return this.request('/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }

  // Sensors
  async getSensors() {
    return this.request('/sensors');
  }

  async getSensorsByMachine(machineId: string) {
    return this.request(`/sensors/machine/${machineId}`);
  }

  async getSensorsForAdmin() {
    return this.request('/sensors/admin/all');
  }

  async createSensor(sensor: any) {
    return this.request('/sensors', {
      method: 'POST',
      body: JSON.stringify(sensor),
    });
  }

  async createPinMapping(mapping: any) {
    return this.request('/sensors/pin-mapping', {
      method: 'POST',
      body: JSON.stringify(mapping),
    });
  }

  async getPinMappings() {
    return this.request('/sensors/pin-mappings');
  }

  async updateSensor(id: string, sensorData: any) {
  return this.request(`/sensors/${id}`, {
    method: 'PUT',
    body: JSON.stringify(sensorData),
  });
}

  async deleteSensor(id: string) {
    return this.request(`/sensors/${id}`, {
      method: 'DELETE',
    });
  }
}

export default new ApiService();