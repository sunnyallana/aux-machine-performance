import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import apiService from '../services/api';
import {
  Users as UsersIcon,
  User as UserIcon,
  Plus, 
  Edit, 
  Trash2, 
  Power, 
  PowerOff,
  Search,
  Loader,
  Building2,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  Filter
} from 'lucide-react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

interface PaginationData {
  currentPage: number;
  totalPages: number;
  totalUsers: number;
  limit: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  nextPage: number | null;
  prevPage: number | null;
}

interface UsersResponse {
  users: any[];
  pagination: PaginationData;
  filters: {
    search: string;
    role: string;
    department: string;
    isActive: string;
    sortBy: string;
    sortOrder: string;
  };
}

const Users: React.FC = () => {
  const { isAdmin } = useAuth();
  const [usersData, setUsersData] = useState<UsersResponse | null>(null);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination and filtering states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showFilters, setShowFilters] = useState(false);
  
  // Modal states
  const [isCreating, setIsCreating] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    role: 'operator',
    departmentId: '',
    isActive: true
  });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [statusTogglingId, setStatusTogglingId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);

  // Debounced search
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

  const fetchUsers = useCallback(async (page = 1, search = '', role = '', department = '', isActive = '') => {
    try {
      setLoading(true);
      
      const params = {
        page,
        limit: pageSize,
        sortBy,
        sortOrder,
        ...(search && { search }),
        ...(role && { role }),
        ...(department && { department }),
        ...(isActive !== '' && { isActive })
      };

      const data: UsersResponse = await apiService.getUsers(params);
      setUsersData(data);
      setCurrentPage(data.pagination.currentPage);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch users';
      toast.error(message);
      console.error('Fetch users error:', err);
    } finally {
      setLoading(false);
    }
  }, [pageSize, sortBy, sortOrder]);

  const fetchDepartments = async () => {
    try {
      const departmentsData = await apiService.getAllDepartments();
      setDepartments(departmentsData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch departments';
      toast.error(message);
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  useEffect(() => {
    fetchUsers(1, searchTerm, roleFilter, departmentFilter, statusFilter);
  }, [fetchUsers, roleFilter, departmentFilter, statusFilter, sortBy, sortOrder]);

  // Debounced search effect
  useEffect(() => {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    const timeout = setTimeout(() => {
      if (searchTerm !== (usersData?.filters.search || '')) {
        fetchUsers(1, searchTerm, roleFilter, departmentFilter, statusFilter);
      }
    }, 500);

    setSearchTimeout(timeout);

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [searchTerm]);

  const handlePageChange = (page: number) => {
    if (page >= 1 && usersData && page <= usersData.pagination.totalPages) {
      fetchUsers(page, searchTerm, roleFilter, departmentFilter, statusFilter);
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
    fetchUsers(1, searchTerm, roleFilter, departmentFilter, statusFilter);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setRoleFilter('');
    setDepartmentFilter('');
    setStatusFilter('');
    setSortBy('createdAt');
    setSortOrder('desc');
    setCurrentPage(1);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    if (editingUser) {
      if (name === 'role' && value !== 'operator') {
        setEditingUser({ 
          ...editingUser, 
          [name]: value,
          departmentId: ''
        });
      } else {
        setEditingUser({ ...editingUser, [name]: value });
      }
    } else {
      if (name === 'role' && value !== 'operator') {
        setFormData({ 
          ...formData, 
          [name]: value,
          departmentId: ''
        });
      } else {
        setFormData({ ...formData, [name]: value });
      }
    }
  };

  useEffect(() => {
    if (!isCreating) return;
    if (formData.role !== 'operator') {
      setFormData(prev => ({ ...prev, departmentId: '' }));
    }
  }, [formData.role, isCreating]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const userData: any = { ...formData };
      
      if (userData.role === 'admin') {
        userData.departmentId = undefined;
      }

      await apiService.createUser(userData);
      
      setFormData({
        username: '',
        email: '',
        password: '',
        role: 'operator',
        departmentId: '',
        isActive: true
      });
      setIsCreating(false);
      toast.success("User created successfully");
      
      // Refresh the current page
      fetchUsers(currentPage, searchTerm, roleFilter, departmentFilter, statusFilter);
    } catch (err) {
      let message = 'Failed to create user';
      
      if (err instanceof Error) {
        if (err.message.includes('E11000 duplicate key error')) {
          if (err.message.includes('username')) {
            message = 'Username already exists';
          } else if (err.message.includes('email')) {
            message = 'Email already exists';
          }
        } else {
          message = err.message;
        }
      }
      
      toast.error(message);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      const updateData: any = {
        username: editingUser.username,
        email: editingUser.email,
        role: editingUser.role,
        isActive: editingUser.isActive
      };

      // Add password if provided
      if (editingUser.password && editingUser.password.trim() !== '') {
        updateData.password = editingUser.password;
      }

      if (editingUser.role === 'operator') {
        updateData.departmentId = editingUser.departmentId;
      } else {
        updateData.departmentId = undefined;
      }

      await apiService.updateUser(editingUser.id, updateData);
      setEditingUser(null);
      toast.success("User updated successfully");
      
      // Refresh the current page
      fetchUsers(currentPage, searchTerm, roleFilter, departmentFilter, statusFilter);
    } catch (err) {
      let message = 'Failed to update user';
      
      if (err instanceof Error) {
        if (err.message.includes('E11000 duplicate key error')) {
          if (err.message.includes('username')) {
            message = 'Username already exists';
          } else if (err.message.includes('email')) {
            message = 'Email already exists';
          }
        } else {
          message = err.message;
        }
      }
      
      toast.error(message);
    }
  };

  const handleToggleStatus = async (id: string, isActive: boolean) => {
    try {
      setStatusTogglingId(id);
      await apiService.updateUser(id, { isActive: !isActive });
      toast.success(`User ${!isActive ? 'activated' : 'deactivated'} successfully`);
      
      // Refresh the current page
      fetchUsers(currentPage, searchTerm, roleFilter, departmentFilter, statusFilter);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update user status';
      toast.error(message);
    } finally {
      setStatusTogglingId(null);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (window.confirm('Are you sure you want to permanently delete this user? This action cannot be undone.')) {
      try {
        setDeletingId(id);
        await apiService.deleteUser(id);
        toast.success("User deleted successfully");
        
        // If we're on the last page and it becomes empty, go to previous page
        if (usersData && usersData.users.length === 1 && currentPage > 1) {
          fetchUsers(currentPage - 1, searchTerm, roleFilter, departmentFilter, statusFilter);
        } else {
          fetchUsers(currentPage, searchTerm, roleFilter, departmentFilter, statusFilter);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete user';
        toast.error(message);
      } finally {
        setDeletingId(null);
      }
    }
  };

  const getDepartmentName = (deptData: any) => {
    if (!deptData) return 'N/A';
    
    if (typeof deptData === 'object' && deptData.name) {
      return deptData.name;
    }
    
    const department = departments.find(d => d._id === deptData);
    return department ? department.name : 'N/A';
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
          {Math.min(pagination.currentPage * pagination.limit, pagination.totalUsers)} of{' '}
          {pagination.totalUsers} results
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

  if (loading && !usersData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const users = usersData?.users || [];
  const pagination = usersData?.pagination;

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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <UsersIcon className="h-8 w-8 text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">User Management</h1>
            <p className="text-gray-400">Manage system users and their permissions</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative w-full sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search users..."
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
          
          {isAdmin && (
            <button 
              onClick={() => setIsCreating(true)}
              className="flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <Plus className="h-5 w-5" />
              <span>New User</span>
            </button>
          )}
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Role</label>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Roles</option>
                <option value="admin">Admin</option>
                <option value="operator">Operator</option>
              </select>
            </div>
            
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
              <label className="block text-sm font-medium text-gray-300 mb-1">Sort By</label>
              <div className="flex space-x-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="createdAt">Created Date</option>
                  <option value="username">Username</option>
                  <option value="email">Email</option>
                  <option value="role">Role</option>
                </select>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="desc">↓</option>
                  <option value="asc">↑</option>
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
                <p className="text-sm text-gray-400">Total Users</p>
                <p className="text-xl font-semibold text-white">{pagination.totalUsers}</p>
              </div>
              <UserIcon className="h-8 w-8 text-blue-400" />
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
                  {users.length} users
                </p>
              </div>
              <UsersIcon className="h-8 w-8 text-yellow-400" />
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {isCreating && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg border border-gray-700 w-full max-w-md">
            <div className="p-6 border-b border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Create New User</h3>
                <button 
                  onClick={() => setIsCreating(false)}
                  className="text-gray-400 hover:text-white"
                >
                  &times;
                </button>
              </div>
            </div>
            
            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-300 mb-1">
                  Username *
                </label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  required
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.username}
                  onChange={handleInputChange}
                />
              </div>
              
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.email}
                  onChange={handleInputChange}
                />
              </div>
              
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
                  Password *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    name="password"
                    required
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.password}
                    onChange={handleInputChange}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5 text-gray-400" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>
              
              <div>
                <label htmlFor="role" className="block text-sm font-medium text-gray-300 mb-1">
                  Role *
                </label>
                <select
                  id="role"
                  name="role"
                  required
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.role}
                  onChange={handleInputChange}
                >
                  <option value="admin">Admin</option>
                  <option value="operator">Operator</option>
                </select>
              </div>
              
              {formData.role === 'operator' && (
                <div>
                  <label htmlFor="departmentId" className="block text-sm font-medium text-gray-300 mb-1">
                    Department *
                  </label>
                  <select
                    id="departmentId"
                    name="departmentId"
                    required
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.departmentId}
                    onChange={handleInputChange}
                  >
                    <option value="">Select Department</option>
                    {departments.map(dept => (
                      <option key={dept._id} value={dept._id}>{dept.name}</option>
                    ))}
                  </select>
                </div>
              )}
              
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
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg border border-gray-700 w-full max-w-md">
            <div className="p-6 border-b border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Edit User</h3>
                <button 
                  onClick={() => setEditingUser(null)}
                  className="text-gray-400 hover:text-white"
                >
                  &times;
                </button>
              </div>
            </div>
            
            <form onSubmit={handleUpdateUser} className="p-6 space-y-4">
              <div>
                <label htmlFor="edit-username" className="block text-sm font-medium text-gray-300 mb-1">
                  Username *
                </label>
                <input
                  type="text"
                  id="edit-username"
                  name="username"
                  required
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={editingUser.username}
                  onChange={handleInputChange}
                />
              </div>
              
              <div>
                <label htmlFor="edit-email" className="block text-sm font-medium text-gray-300 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  id="edit-email"
                  name="email"
                  required
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={editingUser.email}
                  onChange={handleInputChange}
                />
              </div>
              
              <div>
                <label htmlFor="edit-password" className="block text-sm font-medium text-gray-300 mb-1">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showEditPassword ? "text" : "password"}
                    id="edit-password"
                    name="password"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={editingUser.password || ''}
                    onChange={handleInputChange}
                    placeholder="Leave blank to keep current password"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                  >
                    {showEditPassword ? (
                      <EyeOff className="h-5 w-5 text-gray-400" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Only enter a value if you want to change the password
                </p>
              </div>
              
              <div>
                <label htmlFor="edit-role" className="block text-sm font-medium text-gray-300 mb-1">
                  Role *
                </label>
                <select
                  id="edit-role"
                  name="role"
                  required
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={editingUser.role}
                  onChange={handleInputChange}
                >
                  <option value="admin">Admin</option>
                  <option value="operator">Operator</option>
                </select>
              </div>
              
              {editingUser.role === 'operator' && (
                <div>
                  <label htmlFor="edit-departmentId" className="block text-sm font-medium text-gray-300 mb-1">
                    Department *
                  </label>
                  <select
                    id="edit-departmentId"
                    name="departmentId"
                    required
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={editingUser.departmentId || ''}
                    onChange={handleInputChange}
                  >
                    <option value="">Select Department</option>
                    {departments.map(dept => (
                      <option key={dept._id} value={dept._id}>{dept.name}</option>
                    ))}
                  </select>
                </div>
              )}
              
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 border border-gray-600 text-gray-300 rounded-md hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Update User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-750">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  User
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Role
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Department
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Created
                </th>
                {isAdmin && (
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {users.length > 0 ? (
                users.map((user) => (
                  <tr 
                    key={user.id} 
                    className={`hover:bg-gray-750 ${!user.isActive ? 'opacity-70' : ''}`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${
                          user.isActive ? 'bg-blue-500' : 'bg-gray-600'
                        }`}>
                          <UserIcon className="h-5 w-5 text-white" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-white flex items-center">
                            {user.username}
                            {!user.isActive && (
                              <span className="ml-2 text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
                                Inactive
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400">
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        user.role === 'admin' 
                          ? 'bg-purple-900/50 text-purple-400' 
                          : 'bg-blue-900/50 text-blue-400'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-300 flex items-center">
                        {user.departmentId ? (
                          <>
                            <Building2 className="h-4 w-4 mr-1 text-blue-400" />
                            {getDepartmentName(user.departmentId)}
                          </>
                        ) : (
                          'N/A'
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        user.isActive 
                          ? 'bg-green-900/50 text-green-400' 
                          : 'bg-red-900/50 text-red-400'
                      }`}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingUser({
                                ...user,
                                _id: user.id,
                                departmentId: user.departmentId 
                                  ? (typeof user.departmentId === 'object' 
                                      ? user.departmentId._id 
                                      : user.departmentId)
                                  : '',
                                password: ''
                              });
                            }}
                            className="text-blue-400 hover:text-blue-300 p-1 rounded-md hover:bg-gray-700"
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleStatus(user.id, user.isActive);
                            }}
                            disabled={statusTogglingId === user.id}
                            className={`p-1 rounded-md hover:bg-gray-700 ${
                              user.isActive 
                                ? 'text-yellow-400 hover:text-yellow-300' 
                                : 'text-green-400 hover:text-green-300'
                            } ${statusTogglingId === user.id ? 'opacity-50' : ''}`}
                            title={user.isActive ? 'Deactivate' : 'Activate'}
                          >
                            {statusTogglingId === user.id ? (
                              <Loader className="h-4 w-4 animate-spin" />
                            ) : user.isActive ? (
                              <PowerOff className="h-4 w-4" />
                            ) : (
                              <Power className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteUser(user.id);
                            }}
                            disabled={deletingId === user.id}
                            className={`text-red-400 hover:text-red-300 p-1 rounded-md hover:bg-gray-700 ${
                              deletingId === user.id ? 'opacity-50' : ''
                            }`}
                            title="Delete permanently"
                          >
                            {deletingId === user.id ? (
                              <Loader className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <UserIcon className="h-12 w-12 text-gray-600 mb-4" />
                      <h3 className="text-lg font-medium text-gray-400 mb-2">No users found</h3>
                      <p className="text-gray-500 max-w-md">
                        {searchTerm || roleFilter || departmentFilter || statusFilter !== ''
                          ? 'No users match your current filters' 
                          : 'Get started by creating your first user'}
                      </p>
                      {isAdmin && !searchTerm && !roleFilter && !departmentFilter && statusFilter === '' && (
                        <button 
                          onClick={() => setIsCreating(true)}
                          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                        >
                          Create User
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {pagination && <Pagination pagination={pagination} />}
      </div>
    </div>
  );
};

export default Users;