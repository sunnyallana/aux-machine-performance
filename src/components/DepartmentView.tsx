import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Department, Machine } from '../types';
import apiService from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  ArrowLeft,
  Settings,
  Activity,
  AlertTriangle,
  Plus,
  Edit,
  Power,
  Gauge
} from 'lucide-react';

const DepartmentView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [department, setDepartment] = useState<Department | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (id) {
      fetchDepartmentData();
    }
  }, [id]);

  const fetchDepartmentData = async () => {
    try {
      const deptData = await apiService.getDepartment(id!);
      setDepartment(deptData);
      setMachines(deptData.machines || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch department data');
    } finally {
      setLoading(false);
    }
  };

  const handleMachineClick = (machineId: string) => {
    navigate(`/machine/${machineId}`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'bg-green-500';
      case 'stopped': return 'bg-red-500';
      case 'maintenance': return 'bg-yellow-500';
      case 'error': return 'bg-red-600';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'running': return 'Running';
      case 'stopped': return 'Stopped';
      case 'maintenance': return 'Maintenance';
      case 'error': return 'Error';
      default: return 'Unknown';
    }
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

  if (!department) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">Department not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">{department.name}</h1>
            <p className="text-gray-400">{department.description}</p>
          </div>
        </div>
        
        {isAdmin && (
          <div className="flex items-center space-x-2">
            <button className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
              <Plus className="h-4 w-4" />
              <span>Add Machine</span>
            </button>
            <button className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors">
              <Settings className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      {/* Department Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Total Machines</p>
              <p className="text-xl font-semibold text-white">{machines.length}</p>
            </div>
            <Activity className="h-8 w-8 text-blue-400" />
          </div>
        </div>

        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Running</p>
              <p className="text-xl font-semibold text-green-400">
                {machines.filter(m => m.status === 'running').length}
              </p>
            </div>
            <Power className="h-8 w-8 text-green-400" />
          </div>
        </div>

        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Stopped</p>
              <p className="text-xl font-semibold text-red-400">
                {machines.filter(m => m.status === 'stopped').length}
              </p>
            </div>
            <AlertTriangle className="h-8 w-8 text-red-400" />
          </div>
        </div>

        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Avg OEE</p>
              <p className="text-xl font-semibold text-yellow-400">76%</p>
            </div>
            <Gauge className="h-8 w-8 text-yellow-400" />
          </div>
        </div>
      </div>

      {/* Machine Layout */}
      <div className="bg-gray-800 rounded-lg border border-gray-700">
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Machine Layout</h2>
            {isAdmin && (
              <button className="text-blue-400 hover:text-blue-300 text-sm flex items-center space-x-1">
                <Edit className="h-4 w-4" />
                <span>Edit Layout</span>
              </button>
            )}
          </div>
        </div>

        <div className="p-6">
          {machines.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {machines.map((machine) => (
                <div
                  key={machine._id}
                  onClick={() => handleMachineClick(machine._id)}
                  className="bg-gray-700 rounded-lg p-4 border border-gray-600 hover:border-blue-500 cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/10"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-white truncate">{machine.name}</h3>
                    <div className={`h-3 w-3 rounded-full ${getStatusColor(machine.status)}`}></div>
                  </div>
                  
                  <p className="text-sm text-gray-400 mb-3 line-clamp-2">
                    {machine.description || 'No description'}
                  </p>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">Status</span>
                      <span className={`font-medium ${
                        machine.status === 'running' ? 'text-green-400' :
                        machine.status === 'stopped' ? 'text-red-400' :
                        machine.status === 'maintenance' ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        {getStatusText(machine.status)}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">OEE</span>
                      <span className="text-white font-medium">
                        {Math.floor(Math.random() * 30) + 70}%
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">Today's Units</span>
                      <span className="text-white font-medium">
                        {Math.floor(Math.random() * 500) + 100}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-gray-600">
                    <button className="w-full text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors">
                      View Details →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Activity className="h-12 w-12 text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-400 mb-2">No machines found</h3>
              <p className="text-gray-500 mb-4">
                This department doesn't have any machines configured yet.
              </p>
              {isAdmin && (
                <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                  Add First Machine
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DepartmentView;