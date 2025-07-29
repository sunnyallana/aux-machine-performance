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

  async getCurrentOperator() {
    return this.request('/users/me/operator');
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

  async getDepartmentsAdmin(params?: {
    page?: number;
    limit?: number;
    search?: string;
    isActive?: string;
    sortBy?: string;
    sortOrder?: string;
  }) {
    let endpoint = '/departments/admin/all';
    
    if (params) {
      const searchParams = new URLSearchParams();
      
      if (params.page) searchParams.append('page', params.page.toString());
      if (params.limit) searchParams.append('limit', params.limit.toString());
      if (params.search) searchParams.append('search', params.search);
      if (params.isActive) searchParams.append('isActive', params.isActive);
      if (params.sortBy) searchParams.append('sortBy', params.sortBy);
      if (params.sortOrder) searchParams.append('sortOrder', params.sortOrder);
      
      if (searchParams.toString()) {
        endpoint += `?${searchParams.toString()}`;
      }
    }
    
    return this.request(endpoint);
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

  async getDepartmentStats(departmentId: string) {
    return this.request(`/analytics/department-stats/${departmentId}`);
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
  
   async getUsersAdmin(params?: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    department?: string;
    isActive?: string;
    sortBy?: string;
    sortOrder?: string;
  }) {
    let endpoint = '/users/admin/all';
    
    if (params) {
      const searchParams = new URLSearchParams();
      
      if (params.page) searchParams.append('page', params.page.toString());
      if (params.limit) searchParams.append('limit', params.limit.toString());
      if (params.search) searchParams.append('search', params.search);
      if (params.role) searchParams.append('role', params.role);
      if (params.department) searchParams.append('department', params.department);
      if (params.isActive) searchParams.append('isActive', params.isActive);
      if (params.sortBy) searchParams.append('sortBy', params.sortBy);
      if (params.sortOrder) searchParams.append('sortOrder', params.sortOrder);
      
      if (searchParams.toString()) {
        endpoint += `?${searchParams.toString()}`;
      }
    }
    
    return this.request(endpoint);
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

  async updateProductionAssignment(data: any) {
    return this.request('/analytics/production-assignment', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Configuration
  async getConfig() {
    return this.request('/config');
  }

  async getShifts() {
  return this.request('/config/shifts');
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

  async getSensorsAdmin(params?: {
    page?: number;
    limit?: number;
    search?: string;
    department?: string;
    status?: string;
    sensorType?: string;
    sortBy?: string;
    sortOrder?: string;
  }) {
    let endpoint = '/sensors/admin/all';
    
    if (params) {
      const searchParams = new URLSearchParams();
      
      if (params.page) searchParams.append('page', params.page.toString());
      if (params.limit) searchParams.append('limit', params.limit.toString());
      if (params.search) searchParams.append('search', params.search);
      if (params.department) searchParams.append('department', params.department);
      if (params.status) searchParams.append('status', params.status);
      if (params.sensorType) searchParams.append('sensorType', params.sensorType);
      if (params.sortBy) searchParams.append('sortBy', params.sortBy);
      if (params.sortOrder) searchParams.append('sortOrder', params.sortOrder);
      
      if (searchParams.toString()) {
        endpoint += `?${searchParams.toString()}`;
      }
    }
    
    return this.request(endpoint);
  }

  async createSensor(sensor: any) {
    return this.request('/sensors', {
      method: 'POST',
      body: JSON.stringify(sensor),
    });
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
    // Pin mapping
  async deletePinMapping(id: string) {
    return this.request(`/sensors/pin-mapping/${id}`, {
      method: 'DELETE',
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

    // Molds
  async getMolds() {
    return this.request('/molds');
  }

  async getMoldsAdmin(params?: {
    page?: number;
    limit?: number;
    search?: string;
    department?: string;
    isActive?: string;
    sortBy?: string;
    sortOrder?: string;
  }) {
    let endpoint = '/molds/admin/all';
    
    if (params) {
      const searchParams = new URLSearchParams();
      
      if (params.page) searchParams.append('page', params.page.toString());
      if (params.limit) searchParams.append('limit', params.limit.toString());
      if (params.search) searchParams.append('search', params.search);
      if (params.department) searchParams.append('department', params.department);
      if (params.isActive) searchParams.append('isActive', params.isActive);
      if (params.sortBy) searchParams.append('sortBy', params.sortBy);
      if (params.sortOrder) searchParams.append('sortOrder', params.sortOrder);
      
      if (searchParams.toString()) {
        endpoint += `?${searchParams.toString()}`;
      }
    }
    
    return this.request(endpoint);
  }

  async createMold(mold: any) {
    return this.request('/molds', {
      method: 'POST',
      body: JSON.stringify(mold),
    });
  }

  async updateMold(id: string, moldData: any) {
    return this.request(`/molds/${id}`, {
      method: 'PUT',
      body: JSON.stringify(moldData),
    });
  }

  async deleteMold(id: string) {
    return this.request(`/molds/${id}`, {
      method: 'DELETE',
    });
  }

  async toggleMoldStatus(id: string) {
    return this.request(`/molds/${id}/status`, {
      method: 'PATCH',
    });
  }

  // Reports
  async getReports(filters?: any) {
    const params = new URLSearchParams(filters).toString();
    return this.request(`/reports${params ? `?${params}` : ''}`);
  }

  async generateReport(reportData: any) {
    return this.request('/reports/generate', {
      method: 'POST',
      body: JSON.stringify(reportData),
    });
  }

  async emailReport(reportId: string) {
    return this.request(`/reports/${reportId}/email`, {
      method: 'POST',
    });
  }
}

export default new ApiService();