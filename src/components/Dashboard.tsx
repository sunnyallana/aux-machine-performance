import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Department, MachineStats } from '../types';
import apiService from '../services/api';
import { 
  Building2, 
  Activity, 
  TrendingUp, 
  AlertTriangle,
  Users,
  Gauge
} from 'lucide-react';

const Dashboard: React.FC = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { user, isOperator } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      const data = await apiService.getDepartments();
      setDepartments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch departments');
    } finally {
      setLoading(false);
    }
  };

  const handleDepartmentClick = (departmentId: string) => {
    navigate(`/department/${departmentId}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-3 rounded-md">
        <div className="flex items-center">
          <AlertTriangle className="h-4 w-4 mr-2" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Welcome back, {user?.username}</h1>
            <p className="text-blue-100 mt-1">
              {isOperator 
                ? `Monitoring ${user?.department?.name || 'your department'}`
                : 'System overview and management'
              }
            </p>
          </div>
          <div className="hidden sm:block">
            <div className="flex items-center space-x-2 text-blue-100">
              <Users className="h-5 w-5" />
              <span className="capitalize">{user?.role}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <div className="flex items-center">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Building2 className="h-6 w-6 text-white" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-400">Departments</p>
              <p className="text-2xl font-semibold text-white">{departments.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <div className="flex items-center">
            <div className="p-2 bg-green-600 rounded-lg">
              <Activity className="h-6 w-6 text-white" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-400">Active Machines</p>
              <p className="text-2xl font-semibold text-white">
                {departments.reduce((total, dept) => total + dept.machineCount, 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-600 rounded-lg">
              <TrendingUp className="h-6 w-6 text-white" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-400">Avg OEE</p>
              <p className="text-2xl font-semibold text-white">78%</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <div className="flex items-center">
            <div className="p-2 bg-red-600 rounded-lg">
              <AlertTriangle className="h-6 w-6 text-white" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-400">Active Alerts</p>
              <p className="text-2xl font-semibold text-white">3</p>
            </div>
          </div>
        </div>
      </div>

      {/* Departments Grid */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4">
          {isOperator ? 'Your Department' : 'Departments Overview'}
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {departments.map((department) => (
            <div
              key={department._id}
              onClick={() => handleDepartmentClick(department._id)}
              className="bg-gray-800 rounded-lg border border-gray-700 hover:border-blue-500 cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/20"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">{department.name}</h3>
                  <Building2 className="h-6 w-6 text-blue-400" />
                </div>
                
                <p className="text-gray-400 text-sm mb-4 line-clamp-2">
                  {department.description || 'No description available'}
                </p>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Machines</span>
                    <span className="text-white font-medium">
                      {department.machineCount || 0}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Status</span>
                    <div className="flex items-center space-x-2">
                      <div className="h-2 w-2 bg-green-400 rounded-full"></div>
                      <span className="text-green-400 text-sm">Active</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Performance</span>
                    <div className="flex items-center space-x-1">
                      <Gauge className="h-4 w-4 text-yellow-400" />
                      <span className="text-white text-sm">82%</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-700">
                  <button className="w-full text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors">
                    View Details →
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {departments.length === 0 && (
          <div className="text-center py-12">
            <Building2 className="h-12 w-12 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-400 mb-2">No departments found</h3>
            <p className="text-gray-500">
              {isOperator 
                ? 'You have not been assigned to any department yet.'
                : 'Get started by creating your first department.'
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;