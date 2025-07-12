import React, { useEffect, useState, useRef } from 'react';
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
  Gauge,
  Trash2,
  Save,
  X
} from 'lucide-react';

const DepartmentView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [department, setDepartment] = useState<Department | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAddingMachine, setIsAddingMachine] = useState(false);
  const [newMachine, setNewMachine] = useState({
    name: '',
    description: '',
    status: 'stopped' as 'running' | 'stopped' | 'maintenance' | 'error'
  });
  const [editLayoutMode, setEditLayoutMode] = useState(false);
  const [positions, setPositions] = useState<{[key: string]: {x: number; y: number}}>({});
  const [draggingMachineId, setDraggingMachineId] = useState<string | null>(null);
  const layoutContainerRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (id) {
      fetchDepartmentData();
    }
  }, [id]);

  const fetchDepartmentData = async () => {
    try {
      setLoading(true);
      const deptData = await apiService.getDepartment(id!);
      setDepartment(deptData);
      setMachines(deptData.machines || []);
      
      // Initialize positions
      const initialPositions: {[key: string]: {x: number; y: number}} = {};
      deptData.machines?.forEach(machine => {
        initialPositions[machine._id] = { ...machine.position };
      });
      setPositions(initialPositions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch department data');
    } finally {
      setLoading(false);
    }
  };

  const handleMachineClick = (machineId: string) => {
    if (!editLayoutMode) {
      navigate(`/machine/${machineId}`);
    }
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

  const handleAddMachine = async () => {
    try {
      const createdMachine = await apiService.createMachine({
        ...newMachine,
        departmentId: id
      });
      
      setMachines([...machines, createdMachine]);
      setPositions({
        ...positions,
        [createdMachine._id]: createdMachine.position
      });
      setIsAddingMachine(false);
      setNewMachine({
        name: '',
        description: '',
        status: 'stopped'
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add machine');
    }
  };

  const handleDeleteMachine = async (machineId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to permanently delete this machine? All associated data will be lost.')) {
      try {
        await apiService.deleteMachine(machineId);
        setMachines(machines.filter(m => m._id !== machineId));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete machine');
      }
    }
  };

  const handleMouseDown = (machineId: string, e: React.MouseEvent) => {
    if (!editLayoutMode || !layoutContainerRef.current) return;
    e.stopPropagation();
    
    // Calculate offset from mouse to machine position
    const containerRect = layoutContainerRef.current.getBoundingClientRect();
    const machineX = positions[machineId]?.x || 0;
    const machineY = positions[machineId]?.y || 0;
    
    dragOffset.current = {
      x: e.clientX - containerRect.left - machineX,
      y: e.clientY - containerRect.top - machineY
    };
    
    setDraggingMachineId(machineId);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!editLayoutMode || !draggingMachineId || !layoutContainerRef.current) return;
    
    const containerRect = layoutContainerRef.current.getBoundingClientRect();
    const x = e.clientX - containerRect.left - dragOffset.current.x;
    const y = e.clientY - containerRect.top - dragOffset.current.y;
    
    // Keep within container bounds
    const boundedX = Math.max(10, Math.min(x, containerRect.width - 210));
    const boundedY = Math.max(10, Math.min(y, containerRect.height - 210));
    
    setPositions(prev => ({
      ...prev,
      [draggingMachineId]: { x: boundedX, y: boundedY }
    }));
  };

  const handleMouseUp = async () => {
    if (!editLayoutMode || !draggingMachineId) return;
    
    try {
      // Only save if position actually changed
      await apiService.updateMachinePosition(
        draggingMachineId, 
        positions[draggingMachineId]
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update machine position');
    } finally {
      setDraggingMachineId(null);
    }
  };

  const handleSaveLayout = async () => {
    try {
      // Save all positions
      await Promise.all(
        Object.entries(positions).map(([machineId, position]) => 
          apiService.updateMachinePosition(machineId, position)
        )
      );
      setEditLayoutMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save layout');
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
            <button 
              onClick={() => setIsAddingMachine(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Add Machine</span>
            </button>
            <button 
              onClick={() => setEditLayoutMode(!editLayoutMode)}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
            >
              {editLayoutMode ? <Save className="h-5 w-5" /> : <Settings className="h-5 w-5" />}
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
              <button 
                onClick={() => setEditLayoutMode(!editLayoutMode)}
                className="text-blue-400 hover:text-blue-300 text-sm flex items-center space-x-1"
              >
                <Edit className="h-4 w-4" />
                <span>{editLayoutMode ? 'Save Layout' : 'Edit Layout'}</span>
              </button>
            )}
          </div>
        </div>

        <div className="p-6">
          {machines.length > 0 ? (
            <div 
              ref={layoutContainerRef}
              className="relative w-full min-h-[700px] bg-gray-900/50 rounded-lg border border-dashed border-gray-700"
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {machines.map((machine) => (
                <div
                  key={machine._id}
                  onClick={() => handleMachineClick(machine._id)}
                  className={`absolute bg-gray-700 rounded-lg p-4 border ${
                    editLayoutMode 
                      ? 'border-blue-500 cursor-move' 
                      : 'border-gray-600 hover:border-blue-500'
                  } transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/10`}
                  style={{
                    left: `${positions[machine._id]?.x || 0}px`,
                    top: `${positions[machine._id]?.y || 0}px`,
                    width: '200px',
                    zIndex: draggingMachineId === machine._id ? 10 : 1,
                    cursor: editLayoutMode ? 'move' : 'pointer',
                    transform: draggingMachineId === machine._id ? 'scale(1.02)' : 'none',
                    transition: draggingMachineId === machine._id ? 'none' : 'all 0.2s ease',
                    boxShadow: draggingMachineId === machine._id ? '0 10px 25px rgba(0, 0, 0, 0.3)' : 'none'
                  }}
                  onMouseDown={(e) => handleMouseDown(machine._id, e)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-white truncate">{machine.name}</h3>
                    <div className="flex items-center space-x-2">
                      <div className={`h-3 w-3 rounded-full ${getStatusColor(machine.status)}`}></div>
                      {editLayoutMode && (
                        <button
                          onClick={(e) => handleDeleteMachine(machine._id, e)}
                          className="text-red-400 hover:text-red-300 p-1 rounded-md hover:bg-gray-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
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
                <button 
                  onClick={() => setIsAddingMachine(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Add First Machine
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Machine Modal */}
      {isAddingMachine && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg border border-gray-700 w-full max-w-md">
            <div className="p-6 border-b border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Add New Machine</h3>
                <button 
                  onClick={() => setIsAddingMachine(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Machine Name *
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newMachine.name}
                  onChange={(e) => setNewMachine({...newMachine, name: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newMachine.description}
                  onChange={(e) => setNewMachine({...newMachine, description: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Initial Status
                </label>
                <select
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newMachine.status}
                  onChange={(e) => setNewMachine({...newMachine, status: e.target.value as any})}
                >
                  <option value="running">Running</option>
                  <option value="stopped">Stopped</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="error">Error</option>
                </select>
              </div>
              
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  onClick={() => setIsAddingMachine(false)}
                  className="px-4 py-2 border border-gray-600 text-gray-300 rounded-md hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddMachine}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Add Machine
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Layout Controls */}
      {editLayoutMode && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex justify-between items-center">
          <div className="text-yellow-400">
            <p className="flex items-center">
              <Edit className="h-4 w-4 mr-2" />
              <span>Layout Edit Mode: Drag machines to reposition, click trash icon to delete</span>
            </p>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setEditLayoutMode(false)}
              className="px-4 py-2 border border-gray-600 text-gray-300 rounded-md hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveLayout}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center"
            >
              <Save className="h-4 w-4 mr-2" />
              Save Layout
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DepartmentView;