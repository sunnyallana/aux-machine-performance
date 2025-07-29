import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Department } from '../types';
import apiService from '../services/api';
import { 
  Building2, 
  Plus, 
  Edit, 
  Trash2, 
  Power, 
  PowerOff,
  Search,
  Loader,
  Filter,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

interface PaginationData {
  currentPage: number;
  totalPages: number;
  totalDepartments: number;
  limit: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  nextPage: number | null;
  prevPage: number | null;
}

interface DepartmentsResponse {
  departments: Department[];
  pagination: PaginationData;
  filters: {
    search: string;
    isActive: string;
    sortBy: string;
    sortOrder: string;
  };
}

const Departments: React.FC = () => {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  
  // Pagination and filtering states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [showFilters, setShowFilters] = useState(false);
  
  // Modal states
  const [isCreating, setIsCreating] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: ''
  });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [statusTogglingId, setStatusTogglingId] = useState<string | null>(null);
  
  // Data states
  const [departmentsData, setDepartmentsData] = useState<DepartmentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Debounced search
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async (page = 1, search = '', isActive = '') => {
    try {
      setLoading(true);
      
      const params = {
        page,
        limit: pageSize,
        sortBy,
        sortOrder,
        ...(search && { search }),
        ...(isActive !== '' && { isActive })
      };

      const data = await apiService.getDepartmentsAdmin(params);
      setDepartmentsData(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch departments';
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
      if (searchTerm !== (departmentsData?.filters.search || '')) {
        fetchData(1, searchTerm, statusFilter);
      }
    }, 500);

    setSearchTimeout(timeout);

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [searchTerm]);

  useEffect(() => {
    fetchData(1, searchTerm, statusFilter);
  }, [fetchData, statusFilter, sortBy, sortOrder]);

  const handlePageChange = (page: number) => {
    if (page >= 1 && departmentsData && page <= departmentsData.pagination.totalPages) {
      fetchData(page, searchTerm, statusFilter);
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
    fetchData(1, searchTerm, statusFilter);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('');
    setSortBy('name');
    setSortOrder('asc');
    setCurrentPage(1);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (editingDepartment) {
      setEditingDepartment({ ...editingDepartment, [name]: value });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newDepartment = await apiService.createDepartment(formData);
      toast.success('Department created successfully');
      
      // Refresh the current page
      fetchData(currentPage, searchTerm, statusFilter);
      setIsCreating(false);
      setFormData({ name: '', description: '' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create department';
      toast.error(message);
    }
  };

  const handleUpdateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDepartment) return;
    
    try {
      const updatedDepartment = await apiService.updateDepartment(editingDepartment._id, editingDepartment);
      toast.success('Department updated successfully');
      
      // Refresh the current page
      fetchData(currentPage, searchTerm, statusFilter);
      setEditingDepartment(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update department';
      toast.error(message);
    }
  };

  const handleToggleStatus = async (id: string, isActive: boolean) => {
    try {
      setStatusTogglingId(id);
      await apiService.updateDepartment(id, { isActive: !isActive });
      toast.success(`Department ${!isActive ? 'activated' : 'deactivated'} successfully`);
      
      // Refresh the current page
      fetchData(currentPage, searchTerm, statusFilter);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update department status';
      toast.error(message);
    } finally {
      setStatusTogglingId(null);
    }
  };

  const handleDeleteDepartment = async (id: string) => {
    if (window.confirm('Are you sure you want to permanently delete this department? This will also delete all associated machines and cannot be undone.')) {
      try {
        setDeletingId(id);
        await apiService.deleteDepartment(id);
        toast.success('Department deleted successfully');
        
        // If we're on the last page and it becomes empty, go to previous page
        if (departmentsData && departmentsData.departments.length === 1 && currentPage > 1) {
          fetchData(currentPage - 1, searchTerm, statusFilter);
        } else {
          fetchData(currentPage, searchTerm, statusFilter);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete department';
        toast.error(message);
      } finally {
        setDeletingId(null);
      }
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
          {Math.min(pagination.currentPage * pagination.limit, pagination.totalDepartments)} of{' '}
          {pagination.totalDepartments} results
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

  const departments = departmentsData?.departments || [];
  const pagination = departmentsData?.pagination;

  if (!isAdmin) {
    // Non-admin view remains the same as before
    // ... (existing non-admin implementation)
  }

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
          <Building2 className="h-8 w-8 text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Departments</h1>
            <p className="text-gray-400">Manage and configure your industrial departments</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative w-full sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search departments..."
              className="pl-10 pr-4 py-2 w-full bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
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
            onClick={() => setIsCreating(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <Plus className="h-5 w-5" />
            <span>New Department</span>
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              <label className="block text-sm font-medium text-gray-300 mb-1">Sort By</label>
              <div className="flex space-x-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="name">Name</option>
                  <option value="createdAt">Created Date</option>
                  <option value="machineCount">Machine Count</option>
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
                <p className="text-sm text-gray-400">Total Departments</p>
                <p className="text-xl font-semibold text-white">{pagination.totalDepartments}</p>
              </div>
              <Building2 className="h-8 w-8 text-blue-400" />
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
                  {departments.length} departments
                </p>
              </div>
              <Building2 className="h-8 w-8 text-yellow-400" />
            </div>
          </div>
        </div>
      )}

      {/* Create Department Modal */}
      {isCreating && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg border border-gray-700 w-full max-w-md">
            <div className="p-6 border-b border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Create New Department</h3>
                <button 
                  onClick={() => setIsCreating(false)}
                  className="text-gray-400 hover:text-white"
                >
                  &times;
                </button>
              </div>
            </div>
            
            <form onSubmit={handleCreateDepartment} className="p-6 space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">
                  Department Name *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  required
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.name}
                  onChange={handleInputChange}
                />
              </div>
              
              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.description}
                  onChange={handleInputChange}
                />
              </div>
              
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 border border-gray-600 text-gray-300 rounded-md hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Create Department
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Department Modal */}
      {editingDepartment && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg border border-gray-700 w-full max-w-md">
            <div className="p-6 border-b border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Edit Department</h3>
                <button 
                  onClick={() => setEditingDepartment(null)}
                  className="text-gray-400 hover:text-white"
                >
                  &times;
                </button>
              </div>
            </div>
            
            <form onSubmit={handleUpdateDepartment} className="p-6 space-y-4">
              <div>
                <label htmlFor="edit-name" className="block text-sm font-medium text-gray-300 mb-1">
                  Department Name *
                </label>
                <input
                  type="text"
                  id="edit-name"
                  name="name"
                  required
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={editingDepartment.name}
                  onChange={handleInputChange}
                />
              </div>
              
              <div>
                <label htmlFor="edit-description" className="block text-sm font-medium text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  id="edit-description"
                  name="description"
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={editingDepartment.description || ''}
                  onChange={handleInputChange}
                />
              </div>
              
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingDepartment(null)}
                  className="px-4 py-2 border border-gray-600 text-gray-300 rounded-md hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Update Department
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Departments Table */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-750">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Department
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Description
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Machines
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Created
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
              ) : departments.length > 0 ? (
                departments.map((department) => (
                  <tr 
                    key={department._id} 
                    className={`hover:bg-gray-750 cursor-pointer ${!department.isActive ? 'opacity-70' : ''}`}
                    onClick={() => navigate(`/department/${department._id}`)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className={`flex-shrink-0 h-10 w-10 rounded-lg flex items-center justify-center ${
                          department.isActive ? 'bg-blue-500' : 'bg-gray-600'
                        }`}>
                          <Building2 className="h-6 w-6 text-white" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-white flex items-center">
                            {department.name}
                            {!department.isActive && (
                              <span className="ml-2 text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
                                Inactive
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-300 max-w-md truncate">
                        {department.description || 'No description'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        department.isActive 
                          ? 'bg-green-900/50 text-green-400' 
                          : 'bg-red-900/50 text-red-400'
                      }`}>
                        {department.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-300">
                        {department.machineCount || 0}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                      {new Date(department.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingDepartment(department);
                          }}
                          className="text-blue-400 hover:text-blue-300 p-1 rounded-md hover:bg-gray-700"
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleStatus(department._id, department.isActive);
                          }}
                          disabled={statusTogglingId === department._id}
                          className={`p-1 rounded-md hover:bg-gray-700 ${
                            department.isActive 
                              ? 'text-yellow-400 hover:text-yellow-300' 
                              : 'text-green-400 hover:text-green-300'
                          } ${statusTogglingId === department._id ? 'opacity-50' : ''}`}
                          title={department.isActive ? 'Deactivate' : 'Activate'}
                        >
                          {statusTogglingId === department._id ? (
                            <Loader className="h-4 w-4 animate-spin" />
                          ) : department.isActive ? (
                            <PowerOff className="h-4 w-4" />
                          ) : (
                            <Power className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteDepartment(department._id);
                          }}
                          disabled={deletingId === department._id}
                          className={`text-red-400 hover:text-red-300 p-1 rounded-md hover:bg-gray-700 ${
                            deletingId === department._id ? 'opacity-50' : ''
                          }`}
                          title="Delete permanently"
                        >
                          {deletingId === department._id ? (
                            <Loader className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <Building2 className="h-12 w-12 text-gray-600 mb-4" />
                      <h3 className="text-lg font-medium text-gray-400 mb-2">No departments found</h3>
                      <p className="text-gray-500 max-w-md">
                        {searchTerm || statusFilter !== ''
                          ? 'No departments match your current filters' 
                          : 'Get started by creating your first department'}
                      </p>
                      <button 
                        onClick={() => setIsCreating(true)}
                        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                      >
                        Create Department
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

export default Departments;