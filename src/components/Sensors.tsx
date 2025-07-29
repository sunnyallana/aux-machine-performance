import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Sensor, Machine, Department } from '../types';
import apiService from '../services/api';
import {
  Cpu,
  Plus,
  Edit,
  Trash2,
  Power,
  PowerOff,
  Search,
  Loader,
  Activity,
  Thermometer,
  Gauge,
  Zap,
  RotateCcw,
  Building2,
  Filter,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

interface PaginationData {
  currentPage: number;
  totalPages: number;
  totalSensors: number;
  limit: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  nextPage: number | null;
  prevPage: number | null;
}

interface SensorsResponse {
  sensors: Sensor[];
  pagination: PaginationData;
  filters: {
    search: string;
    department: string;
    status: string;
    sensorType: string;
    sortBy: string;
    sortOrder: string;
  };
}

interface SensorFormData {
  name: string;
  description: string;
  machineId: string;
  sensorType: 'power' | 'unit-cycle';
  isActive: boolean;
}

const Sensors: React.FC = () => {
  const { isAdmin } = useAuth();
  const [sensorsData, setSensorsData] = useState<SensorsResponse | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination and filtering states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sensorTypeFilter, setSensorTypeFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showFilters, setShowFilters] = useState(false);
  
  // Modal states
  const [showForm, setShowForm] = useState(false);
  const [editingSensor, setEditingSensor] = useState<Sensor | null>(null);
  const [formData, setFormData] = useState<SensorFormData>({
    name: '',
    description: '',
    machineId: '',
    sensorType: 'power',
    isActive: true
  });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [statusTogglingId, setStatusTogglingId] = useState<string | null>(null);

  // Debounced search
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async (page = 1, search = '', department = '', status = '', sensorType = '') => {
    try {
      setLoading(true);
      
      const params = {
        page,
        limit: pageSize,
        sortBy,
        sortOrder,
        ...(search && { search }),
        ...(department && { department }),
        ...(status !== '' && { status }),
        ...(sensorType && { sensorType })
      };

      const [sensorsResponse, departmentsData] = await Promise.all([
        apiService.getSensorsAdmin(params),
        apiService.getDepartments()
      ]);
      
      setSensorsData(sensorsResponse);
      setDepartments(departmentsData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch data';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [pageSize, sortBy, sortOrder]);

  // Debounced search effect
  useEffect(() => {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    const timeout = setTimeout(() => {
      if (searchTerm !== (sensorsData?.filters.search || '')) {
        fetchData(1, searchTerm, departmentFilter, statusFilter, sensorTypeFilter);
      }
    }, 500);

    setSearchTimeout(timeout);

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [searchTerm]);

  useEffect(() => {
    fetchData(1, searchTerm, departmentFilter, statusFilter, sensorTypeFilter);
  }, [fetchData, departmentFilter, statusFilter, sensorTypeFilter, sortBy, sortOrder]);

  const handlePageChange = (page: number) => {
    if (page >= 1 && sensorsData && page <= sensorsData.pagination.totalPages) {
      fetchData(page, searchTerm, departmentFilter, statusFilter, sensorTypeFilter);
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
    fetchData(1, searchTerm, departmentFilter, statusFilter, sensorTypeFilter);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setDepartmentFilter('');
    setStatusFilter('');
    setSensorTypeFilter('');
    setSortBy('createdAt');
    setSortOrder('desc');
    setCurrentPage(1);
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingSensor) {
        await apiService.updateSensor(editingSensor._id, formData);
        toast.success('Sensor updated successfully');
      } else {
        await apiService.createSensor(formData);
        toast.success('Sensor created successfully');
      }
      
      resetForm();
      fetchData(currentPage, searchTerm, departmentFilter, statusFilter, sensorTypeFilter);
    } catch (err) {
      let message = 'Failed to save sensor';
      
      if (err instanceof Error) {
        if (err.message.includes('E11000 duplicate key error')) {
          message = 'Sensor name must be unique';
        } else {
          message = err.message;
        }
      }
      
      toast.error(message);
    }
  };

  const handleEdit = (sensor: Sensor) => {
    setEditingSensor(sensor);
    const machine = (sensor.machineId as Machine);
    const department = (machine.departmentId as Department);
    
    setFormData({
      name: sensor.name,
      description: sensor.description || '',
      machineId: machine._id,
      isActive: sensor.isActive,
      sensorType: sensor.sensorType as any
    });
    
    setDepartmentFilter(department._id);
    setShowForm(true);
  };

  const handleToggleStatus = async (id: string, isActive: boolean) => {
    try {
      setStatusTogglingId(id);
      await apiService.updateSensor(id, { isActive: !isActive });
      toast.success(`Sensor ${!isActive ? 'activated' : 'deactivated'} successfully`);
      
      // Refresh the current page
      fetchData(currentPage, searchTerm, departmentFilter, statusFilter, sensorTypeFilter);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update sensor status';
      toast.error(message);
    } finally {
      setStatusTogglingId(null);
    }
  };

  const handleDelete = async (sensorId: string) => {
    if (!confirm('Are you sure you want to delete this sensor?')) return;

    try {
      setDeletingId(sensorId);
      await apiService.deleteSensor(sensorId);
      toast.success('Sensor deleted successfully');
      
      // If we're on the last page and it becomes empty, go to previous page
      if (sensorsData && sensorsData.sensors.length === 1 && currentPage > 1) {
        fetchData(currentPage - 1, searchTerm, departmentFilter, statusFilter, sensorTypeFilter);
      } else {
        fetchData(currentPage, searchTerm, departmentFilter, statusFilter, sensorTypeFilter);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete sensor';
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      machineId: '',
      isActive: true,
      sensorType: 'power'
    });
    setEditingSensor(null);
    setDepartmentFilter('');
    setShowForm(false);
  };

  const getSensorIcon = (type: string) => {
    switch (type) {
      case 'power': return <Zap className="h-4 w-4" />;
      case 'unit-cycle': return <RotateCcw className="h-4 w-4" />;
      case 'temperature': return <Thermometer className="h-4 w-4" />;
      case 'pressure': return <Gauge className="h-4 w-4" />;
      case 'vibration': return <Activity className="h-4 w-4" />;
      default: return <Cpu className="h-4 w-4" />;
    }
  };

  const getSensorTypeColor = (type: string) => {
    switch (type) {
      case 'power': return 'bg-yellow-400/10 text-yellow-400';
      case 'unit-cycle': return 'bg-blue-400/10 text-blue-400';
      case 'temperature': return 'bg-red-400/10 text-red-400';
      case 'pressure': return 'bg-purple-400/10 text-purple-400';
      case 'vibration': return 'bg-green-400/10 text-green-400';
      default: return 'bg-gray-400/10 text-gray-400';
    }
  };

  const Pagination = ({ pagination }: { pagination: PaginationData }) => {
    if (pagination.totalPages <= 1) return null;

    const getPageNumbers = () => {
      const pages = [];
      const maxVisible = 5;
      let start = Math.max(1, pagination.currentPage - Math.floor(maxVisible / 2));
      let end = Math.min(pagination.totalPages, start + maxVisible - 1);
      
      if (end - start + 1 < maxVisible) {
        start = Math.max(1, end - maxVisible + 1);
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      return pages;
    };

    return (
      <div className="flex items-center justify-between px-6 py-3 bg-gray-800 border-t border-gray-700">
        <div className="flex items-center text-sm text-gray-400">
          Showing {((pagination.currentPage - 1) * pagination.limit) + 1} to{' '}
          {Math.min(pagination.currentPage * pagination.limit, pagination.totalSensors)} of{' '}
          {pagination.totalSensors} results
        </div>
        
        <div className="flex items-center space-x-2">
          <select
            value={pageSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm"
          >
            <option value={5}>5 per page</option>
            <option value={10}>10 per page</option>
            <option value={20}>20 per page</option>
            <option value={50}>50 per page</option>
          </select>
          
          <button
            onClick={() => handlePageChange(pagination.currentPage - 1)}
            disabled={!pagination.hasPrevPage}
            className="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          
          {getPageNumbers().map(page => (
            <button
              key={page}
              onClick={() => handlePageChange(page)}
              className={`px-3 py-1 rounded text-sm ${
                page === pagination.currentPage
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {page}
            </button>
          ))}
          
          <button
            onClick={() => handlePageChange(pagination.currentPage + 1)}
            disabled={!pagination.hasNextPage}
            className="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  };

  if (!isAdmin) {
    return (
      <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-3 rounded-md">
        <div className="flex items-center">
          <div className="h-4 w-4 mr-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
            </svg>
          </div>
          <span>Access denied. Admin privileges required.</span>
        </div>
      </div>
    );
  }

  const sensors = sensorsData?.sensors || [];
  const pagination = sensorsData?.pagination;

  return (
    <div className="space-y-6">
      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <Cpu className="h-8 w-8 text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Sensors</h1>
            <p className="text-gray-400">Manage and configure your industrial sensors</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative w-full sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search sensors..."
              className="pl-10 pr-4 py-2 w-full bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={searchTerm}
              onChange={handleSearch}
            />
            {loading && (
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                <Loader className="h-4 w-4 animate-spin text-gray-400" />
              </div>
            )}
          </div>
          
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center space-x-2 px-4 py-2 border rounded-md transition-colors ${
              showFilters 
                ? 'bg-blue-600 border-blue-600 text-white' 
                : 'border-gray-600 text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Filter className="h-4 w-4" />
            <span>Filters</span>
          </button>
          
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <Plus className="h-5 w-5" />
            <span>New Sensor</span>
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Department</label>
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Departments</option>
                {departments.map(dept => (
                  <option key={dept._id} value={dept._id}>{dept.name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Status</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Sensor Type</label>
              <select
                value={sensorTypeFilter}
                onChange={(e) => setSensorTypeFilter(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Types</option>
                <option value="power">Power</option>
                <option value="unit-cycle">Unit Cycle</option>
                <option value="temperature">Temperature</option>
                <option value="pressure">Pressure</option>
                <option value="vibration">Vibration</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Sort By</label>
              <div className="flex space-x-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="name">Name</option>
                  <option value="createdAt">Created Date</option>
                </select>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="asc">↑</option>
                  <option value="desc">↓</option>
                </select>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end mt-4">
            <button
              onClick={clearFilters}
              className="px-4 py-2 text-gray-400 hover:text-white text-sm"
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      {pagination && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Total Sensors</p>
                <p className="text-xl font-semibold text-white">{pagination.totalSensors}</p>
              </div>
              <Cpu className="h-8 w-8 text-blue-400" />
            </div>
          </div>

          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Current Page</p>
                <p className="text-xl font-semibold text-green-400">
                  {pagination.currentPage} of {pagination.totalPages}
                </p>
              </div>
              <Power className="h-8 w-8 text-green-400" />
            </div>
          </div>

          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Showing</p>
                <p className="text-xl font-semibold text-yellow-400">
                  {sensors.length} sensors
                </p>
              </div>
              <Cpu className="h-8 w-8 text-yellow-400" />
            </div>
          </div>
        </div>
      )}

      {/* Sensor Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg border border-gray-700 w-full max-w-md">
            <div className="p-6 border-b border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">
                  {editingSensor ? 'Edit Sensor' : 'Create New Sensor'}
                </h3>
                <button 
                  onClick={resetForm}
                  className="text-gray-400 hover:text-white"
                >
                  &times;
                </button>
              </div>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Sensor Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter sensor name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter sensor description"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Sensor Type *
                </label>
                <select
                  required
                  value={formData.sensorType}
                  onChange={(e) => setFormData({ ...formData, sensorType: e.target.value as any })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="power">Power Sensor</option>
                  <option value="unit-cycle">Unit Cycle Sensor</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Department *
                </label>
                <select
                  required
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select department</option>
                  {departments.map((dept) => (
                    <option key={dept._id} value={dept._id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Machine *
                </label>
                <select
                  required
                  value={formData.machineId}
                  onChange={(e) => setFormData({ ...formData, machineId: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={!departmentFilter}
                >
                  <option value="">Select machine</option>
                  {departments
                    .find(d => d._id === departmentFilter)
                    ?.machines?.map((machine) => (
                      <option key={machine._id} value={machine._id}>
                        {machine.name}
                      </option>
                    )) || []}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Active Status
                </label>
                <div className="flex items-center">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    <span className="ml-3 text-sm text-gray-300">
                      {formData.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </label>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 border border-gray-600 text-gray-300 rounded-md hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  {editingSensor ? 'Update Sensor' : 'Create Sensor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sensors Table */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-750">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Sensor
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Machine
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Department
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Type
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center">
                    <div className="flex justify-center">
                      <Loader className="h-6 w-6 animate-spin text-blue-500" />
                    </div>
                  </td>
                </tr>
              ) : sensors.length > 0 ? (
                sensors.map((sensor) => {
                  const machine = (sensor.machineId as Machine);
                  const department = (machine.departmentId as Department);
                  
                  return (
                    <tr 
                      key={sensor._id} 
                      className={`hover:bg-gray-750 ${!sensor.isActive ? 'opacity-70' : ''}`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className={`flex-shrink-0 h-10 w-10 rounded-lg flex items-center justify-center ${getSensorTypeColor(sensor.sensorType)}`}>
                            {getSensorIcon(sensor.sensorType)}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-white">
                              {sensor.name}
                            </div>
                            <div className="text-xs text-gray-400 truncate max-w-xs">
                              {sensor.description || 'No description'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-300">
                          {machine?.name || 'Unknown'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-300 flex items-center">
                          <Building2 className="h-4 w-4 mr-1 text-gray-400" />
                          {department?.name || 'Unknown'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full capitalize ${getSensorTypeColor(sensor.sensorType)}`}>
                          {sensor.sensorType.replace('-', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          sensor.isActive 
                            ? 'bg-green-900/50 text-green-400' 
                            : 'bg-red-900/50 text-red-400'
                        }`}>
                          {sensor.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => handleEdit(sensor)}
                            className="text-blue-400 hover:text-blue-300 p-1 rounded-md hover:bg-gray-700"
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleToggleStatus(sensor._id, sensor.isActive)}
                            disabled={statusTogglingId === sensor._id}
                            className={`p-1 rounded-md hover:bg-gray-700 ${
                              sensor.isActive 
                                ? 'text-yellow-400 hover:text-yellow-300' 
                                : 'text-green-400 hover:text-green-300'
                            } ${statusTogglingId === sensor._id ? 'opacity-50' : ''}`}
                            title={sensor.isActive ? 'Deactivate' : 'Activate'}
                          >
                            {statusTogglingId === sensor._id ? (
                              <Loader className="h-4 w-4 animate-spin" />
                            ) : sensor.isActive ? (
                              <PowerOff className="h-4 w-4" />
                            ) : (
                              <Power className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            onClick={() => handleDelete(sensor._id)}
                            disabled={deletingId === sensor._id}
                            className={`text-red-400 hover:text-red-300 p-1 rounded-md hover:bg-gray-700 ${
                              deletingId === sensor._id ? 'opacity-50' : ''
                            }`}
                            title="Delete"
                          >
                            {deletingId === sensor._id ? (
                              <Loader className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <Cpu className="h-12 w-12 text-gray-600 mb-4" />
                      <h3 className="text-lg font-medium text-gray-400 mb-2">No sensors found</h3>
                      <p className="text-gray-500 max-w-md">
                        {searchTerm || departmentFilter || statusFilter !== '' || sensorTypeFilter !== ''
                          ? 'No sensors match your current filters' 
                          : 'Get started by creating your first sensor'}
                      </p>
                      <button 
                        onClick={() => setShowForm(true)}
                        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                      >
                        Create Sensor
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {pagination && !loading && <Pagination pagination={pagination} />}
      </div>
    </div>
  );
};

export default Sensors;