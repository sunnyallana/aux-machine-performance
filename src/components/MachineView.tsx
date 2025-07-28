import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Machine, ProductionTimelineDay, MachineStats, MachineStatus } from '../types';
import apiService from '../services/api';
import socketService from '../services/socket';
import ProductionTimeline from './ProductionTimeline';
import { ToastContainer, toast } from 'react-toastify';
import { format, isToday } from 'date-fns';
import 'react-toastify/dist/ReactToastify.css';

import {
  ArrowLeft,
  Activity,
  TrendingUp,
  AlertTriangle,
  Clock,
  Gauge,
  Zap,
  ZapOff,
  Edit,
  Info,
} from 'lucide-react';

const MachineView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [machine, setMachine] = useState<Machine | null>(null);
  const [timeline, setTimeline] = useState<ProductionTimelineDay[]>([]);
  const [stats, setStats] = useState<MachineStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('24h');
  const [machineStatus, setMachineStatus] = useState<string>('inactive');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    description: ''
  });
  const [warnings, setWarnings] = useState<string[]>([]);
  const [currentLocalTime, setCurrentLocalTime] = useState(new Date());
  // Tooltip state
  const [tooltip, setTooltip] = useState<{
    content: string;
    x: number;
    y: number;
    visible: boolean;
  } | null>(null);

  // Handle mouse enter for tooltip
  const handleMouseEnter = (content: string) => (e: React.MouseEvent) => {
    setTooltip({
      content,
      x: e.clientX,
      y: e.clientY,
      visible: true
    });
  };

  // Handle mouse leave for tooltip
  const handleMouseLeave = () => {
    setTooltip(null);
  };

  // Update tooltip position on mouse move
  const handleMouseMove = (e: React.MouseEvent) => {
    if (tooltip) {
      setTooltip({
        ...tooltip,
        x: e.clientX,
        y: e.clientY
      });
    }
  };

  useEffect(() => {
    if (id) {
      fetchMachineData();
      setupSocketListeners();
    }
    return () => {
      if (id) {
        socketService.leaveMachine(id);
      }
    };
  }, [id, selectedPeriod]);

  // useEffect for time updates
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentLocalTime(new Date());
    }, 60000); // Update every minute
    
    return () => clearInterval(timer);
  }, []);

  // useEffect to check assignments
  useEffect(() => {
    if (!timeline.length) return;
    
    const newWarnings: string[] = [];
    const currentLocalHour = currentLocalTime.getHours();
    const today = format(currentLocalTime, 'yyyy-MM-dd');
    
    timeline.forEach(day => {
      // Only check today's data
      if (day.date !== today) return;
      
      day.hours.forEach(hour => {
        // Only check current and past hours
        if (hour.hour > currentLocalHour) return;
        
        if (!hour.operator) {
          newWarnings.push(`Operator not assigned for ${hour.hour}:00`);
        }
        if (!hour.mold) {
          newWarnings.push(`Mold not assigned for ${hour.hour}:00`);
        }
      });
    });
    
    setWarnings(newWarnings);
  }, [timeline, currentLocalTime]);

  const setupSocketListeners = () => {
    if (!id) return;

    socketService.connect();
    socketService.joinMachine(id);

    const handleProductionUpdate = (update: any) => {
      if (update.machineId === id) {
        // Refresh stats when production updates
        fetchStats();
      }
    };

    const handleAssignmentUpdated = (update: any) => {
      if (update.machineId === id) {
        // Optimistically update timeline
        setTimeline(prev => prev.map(day => {
          if (day.date !== update.date) return day;
          return {
            ...day,
            hours: day.hours.map(hour => {
              if (!update.hours.includes(hour.hour)) return hour;
              return {
                ...hour,
                operator: update.operatorId ?? undefined,
                mold: update.moldId ?? undefined
              };
            })
          };
        }));
        
        fetchStats();
        // Remove warnings for updated hours
        setWarnings(prev => prev.filter(w => 
          !update.hours.includes(parseInt(w.split(' ')[4]))
        ));
      }
    };

    const handleStoppageUpdated = (update: any) => {
      if (update.machineId === id) {
        fetchStats();
      }
    };

    const handleStoppageDetected = (stoppage: any) => {
      if (stoppage.machineId === id) {
        toast.warning(`Stoppage detected: ${stoppage.duration} minutes`, {
          position: "top-right",
          autoClose: 5000,
          theme: "dark"
        });
        // Refresh data
        fetchMachineData();
      }
    };

    const handleMachineStateUpdate = (update: any) => {
      if (update.machineId === id) {
        setMachineStatus(update.status);
        // Update machine object status
        setMachine(prev => prev ? { ...prev, status: update.dbStatus } : null);
      }
    };

    socketService.on('production-update', handleProductionUpdate);
    socketService.on('stoppage-detected', handleStoppageDetected);
    socketService.on('production-assignment-updated', handleAssignmentUpdated);
    socketService.on('stoppage-updated', handleStoppageUpdated);
    socketService.on('stoppage-added', handleStoppageDetected);
    socketService.on('machine-state-update', handleMachineStateUpdate);

    return () => {
      socketService.off('production-update', handleProductionUpdate);
      socketService.off('stoppage-detected', handleStoppageDetected);
      socketService.off('stoppage-added', handleStoppageDetected);
      socketService.off('machine-state-update', handleMachineStateUpdate);
      socketService.off('production-assignment-updated', handleAssignmentUpdated);
      socketService.off('stoppage-updated', handleStoppageUpdated);
    };
  };

  const fetchMachineData = async () => {
    try {
      setLoading(true);
      const [machineData, timelineData, statsData] = await Promise.all([
        apiService.getMachine(id!),
        apiService.getProductionTimeline(id!),
        apiService.getMachineStats(id!, selectedPeriod)
      ]);
      
      setMachine(machineData);
      setEditForm({
        name: machineData.name,
        description: machineData.description || ''
      });
      setTimeline(timelineData);
      setStats(statsData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch machine data';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const statsData = await apiService.getMachineStats(id!, selectedPeriod);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const handleAddStoppage = async (stoppage: any) => {
    try {
      await apiService.addStoppageRecord({
        ...stoppage,
        machineId: id
      });
      toast.success('Stoppage recorded successfully');
      fetchMachineData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message :'Failed to record stoppage');
    }
  };

  const handleUpdateProduction = async (machineId: string, hour: number, date: string, data: any) => {
    try {
      await apiService.updateProductionAssignment({
        machineId,
        hour,
        date,
        ...data
      });
      toast.success('Production data updated');
      fetchStats(); // Add this line
      fetchMachineData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message :'Failed to update production data');
    }
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveEdit = async () => {
    if (!machine || !id) return;
    
    try {
      const updatedMachine = await apiService.updateMachine(id, editForm);
      setMachine(updatedMachine);
      setIsEditing(false);
      toast.success('Machine details updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message :'Failed to update machine');
    }
  };

  const getStatusColor = (status: MachineStatus) => {
    switch (status) {
      case 'running': return 'text-green-400 bg-green-400/10 border-green-400/20';
      case 'stoppage': return 'text-red-400 bg-red-400/10 border-red-400/20 animate-pulse';
      case 'stopped_yet_producing': return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
      case 'inactive': return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
      default: return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
    }
  };

 const getStatusIcon = (status: MachineStatus) => {
    switch (status) {
      case 'running': return <Zap className="h-4 w-4" />;
      case 'stoppage': return <AlertTriangle className="h-4 w-4" />;
      case 'stopped_yet_producing': return <ZapOff className="h-4 w-4" />;
      case 'inactive': return <Activity className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!machine || !stats) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">Machine not found</p>
      </div>
    );
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
      
      {/* Custom Tooltip */}
      {tooltip && (
        <div 
          className={`fixed bg-gray-800 text-white text-sm px-3 py-2 rounded-md shadow-lg z-50 border border-gray-700 transition-opacity ${
            tooltip.visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          style={{
            left: tooltip.x + 10,
            top: tooltip.y + 10,
            transform: 'translate(0, -50%)',
            maxWidth: '300px'
          }}
        >
          {tooltip.content}
        </div>
      )}
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          {isEditing ? (
            <div className="space-y-2 flex-1">
              <input
                name="name"
                value={editForm.name}
                onChange={handleEditChange}
                className="text-2xl font-bold text-white bg-gray-700 border border-gray-600 rounded px-2 py-1 w-full"
              />
              <textarea
                name="description"
                value={editForm.description}
                onChange={handleEditChange}
                className="text-gray-400 bg-gray-700 border border-gray-600 rounded px-2 py-1 w-full text-sm"
                rows={2}
              />
            </div>
          ) : (
            <div>
              <h1 className="text-2xl font-bold text-white">{machine.name}</h1>
              <p className="text-gray-400">{machine.description}</p>
            </div>
          )}
        </div>
        
        <div className="flex items-center space-x-3">
          <div className={`flex items-center space-x-2 px-3 py-2 rounded-md border ${getStatusColor(machineStatus as MachineStatus || machine.status)}`}>
            {getStatusIcon(machineStatus as MachineStatus || machine.status)}
            <span className="font-medium capitalize">{(machineStatus || machine.status).replace('_', ' ')}</span>
          </div>
          
          {isEditing ? (
            <div className="flex space-x-2">
              <button
                onClick={() => setIsEditing(false)}
                className="px-3 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Save
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
              title="Edit machine details"
            >
              <Edit className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Mold, Operator Assignment Warning */}
      {warnings.length > 0 && (
      <div className="bg-yellow-900/30 border border-yellow-500 rounded-lg p-4 mb-6">
        <div className="flex items-center space-x-2 mb-2">
          <AlertTriangle className="h-5 w-5 text-yellow-400" />
          <h3 className="text-yellow-400 font-medium">Assignment Warnings</h3>
        </div>
        <ul className="list-disc pl-5 text-yellow-300">
          {warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      </div>
      )}

      {/* Key Metrics - Compact Layout */}
      <div className="grid grid-cols-4 gap-2">
        <div 
          className="bg-gray-800 p-3 rounded-lg border border-gray-700 flex items-center relative"
          onMouseEnter={handleMouseEnter('Total units produced in the selected time period')}
          onMouseLeave={handleMouseLeave}
          onMouseMove={handleMouseMove}
        >
          <TrendingUp className="h-6 w-6 text-green-400 mr-3" />
          <div>
            <p className="text-xs text-gray-400 flex items-center">
              Units
              <Info className="h-3 w-3 ml-1 text-gray-500" />
            </p>
            <p className="text-lg font-semibold text-white">{stats.totalUnitsProduced}</p>
          </div>
        </div>

        <div 
          className="bg-gray-800 p-3 rounded-lg border border-gray-700 flex items-center relative"
          onMouseEnter={handleMouseEnter('Overall Equipment Effectiveness (Availability × Performance × Quality)')}
          onMouseLeave={handleMouseLeave}
          onMouseMove={handleMouseMove}
        >
          <Gauge className="h-6 w-6 text-yellow-400 mr-3" />
          <div>
            <p className="text-xs text-gray-400 flex items-center">
              OEE
              <Info className="h-3 w-3 ml-1 text-gray-500" />
            </p>
            <p className="text-lg font-semibold text-yellow-400">{stats.oee}%</p>
          </div>
        </div>

        <div 
          className="bg-gray-800 p-3 rounded-lg border border-gray-700 flex items-center relative"
          onMouseEnter={handleMouseEnter('Mean Time Between Failures (average time between breakdowns)')}
          onMouseLeave={handleMouseLeave}
          onMouseMove={handleMouseMove}
        >
          <Clock className="h-6 w-6 text-blue-400 mr-3" />
          <div>
            <p className="text-xs text-gray-400 flex items-center">
              MTBF
              <Info className="h-3 w-3 ml-1 text-gray-500" />
            </p>
            <p className="text-lg font-semibold text-blue-400">{stats.mtbf}m</p>
          </div>
        </div>

        <div 
          className="bg-gray-800 p-3 rounded-lg border border-gray-700 flex items-center relative"
          onMouseEnter={handleMouseEnter('Mean Time To Repair (average time to repair a breakdown)')}
          onMouseLeave={handleMouseLeave}
          onMouseMove={handleMouseMove}
        >
          <Activity className="h-6 w-6 text-purple-400 mr-3" />
          <div>
            <p className="text-xs text-gray-400 flex items-center">
              MTTR
              <Info className="h-3 w-3 ml-1 text-gray-500" />
            </p>
            <p className="text-lg font-semibold text-purple-400">{stats.mttr}m</p>
          </div>
        </div>
      </div>

      {/* Time Period Selector */}
      <div className="flex items-center space-x-2">
        <span className="text-sm text-gray-400">Time Period:</span>
        <div className="flex space-x-1">
          {[
            { value: '24h', label: '24 Hours' },
            { value: '7d', label: '7 Days' },
            { value: '30d', label: '30 Days' }
          ].map((period) => (
            <button
              key={period.value}
              onClick={() => setSelectedPeriod(period.value)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                selectedPeriod === period.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {period.label}
            </button>
          ))}
        </div>
      </div>

      {/* Detailed Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Performance Metrics</h3>
          <div className="space-y-4">
            <div 
              className="flex justify-between items-center relative"
              onMouseEnter={handleMouseEnter('Percentage of time the machine was available for production')}
              onMouseLeave={handleMouseLeave}
              onMouseMove={handleMouseMove}
            >
              <span className="text-gray-400 flex items-center">
                Availability
                <Info className="h-3 w-3 ml-1 text-gray-500" />
              </span>
              <div className="flex items-center space-x-2">
                <div className="w-20 bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-green-500 h-2 rounded-full" 
                    style={{ width: `${stats.availability}%` }}
                  ></div>
                </div>
                <span className="text-white font-medium">{stats.availability}%</span>
              </div>
            </div>
            
            <div 
              className="flex justify-between items-center relative"
              onMouseEnter={handleMouseEnter('Percentage of units that meet quality standards')}
              onMouseLeave={handleMouseLeave}
              onMouseMove={handleMouseMove}
            >
              <span className="text-gray-400 flex items-center">
                Quality
                <Info className="h-3 w-3 ml-1 text-gray-500" />
              </span>
              <div className="flex items-center space-x-2">
                <div className="w-20 bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full" 
                    style={{ width: `${stats.quality}%` }}
                  ></div>
                </div>
                <span className="text-white font-medium">{stats.quality}%</span>
              </div>
            </div>
            
            <div 
              className="flex justify-between items-center relative"
              onMouseEnter={handleMouseEnter('Actual production rate compared to the maximum possible rate')}
              onMouseLeave={handleMouseLeave}
              onMouseMove={handleMouseMove}
            >
              <span className="text-gray-400 flex items-center">
                Performance
                <Info className="h-3 w-3 ml-1 text-gray-500" />
              </span>
              <div className="flex items-center space-x-2">
                <div className="w-20 bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-yellow-500 h-2 rounded-full" 
                    style={{ width: `${stats.performance}%` }}
                  ></div>
                </div>
                <span className="text-white font-medium">{stats.performance}%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Quality Metrics</h3>
          <div className="space-y-4">
            <div 
              className="flex justify-between items-center relative"
              onMouseEnter={handleMouseEnter('Units that passed quality inspection')}
              onMouseLeave={handleMouseLeave}
              onMouseMove={handleMouseMove}
            >
              <span className="text-gray-400 flex items-center">
                Good Units
                <Info className="h-3 w-3 ml-1 text-gray-500" />
              </span>
              <span className="text-green-400 font-medium">
                {stats.totalUnitsProduced - stats.totalDefectiveUnits}
              </span>
            </div>
            <div 
              className="flex justify-between items-center relative"
              onMouseEnter={handleMouseEnter('Units that failed quality inspection')}
              onMouseLeave={handleMouseLeave}
              onMouseMove={handleMouseMove}
            >
              <span className="text-gray-400 flex items-center">
                Defective Units
                <Info className="h-3 w-3 ml-1 text-gray-500" />
              </span>
              <span className="text-red-400 font-medium">{stats.totalDefectiveUnits}</span>
            </div>
            <div 
              className="flex justify-between items-center relative"
              onMouseEnter={handleMouseEnter('Percentage of units that were defective')}
              onMouseLeave={handleMouseLeave}
              onMouseMove={handleMouseMove}
            >
              <span className="text-gray-400 flex items-center">
                Defect Rate
                <Info className="h-3 w-3 ml-1 text-gray-500" />
              </span>
              <span className="text-yellow-400 font-medium">
                {stats.totalUnitsProduced > 0 
                  ? ((stats.totalDefectiveUnits / stats.totalUnitsProduced) * 100).toFixed(1)
                  : 0
                }%
              </span>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Reliability</h3>
          <div className="space-y-4">
            <div 
              className="flex justify-between items-center relative"
              onMouseEnter={handleMouseEnter('Current operational status of the machine')}
              onMouseLeave={handleMouseLeave}
              onMouseMove={handleMouseMove}
            >
              <span className="text-gray-400 flex items-center">
                Current Status
                <Info className="h-3 w-3 ml-1 text-gray-500" />
              </span>
              <span className={`font-medium capitalize ${
                machine.status === 'running' ? 'text-green-400' :
                machine.status === 'inactive' ? 'text-red-400' :
                machine.status === 'stopped_yet_producing' ? 'text-yellow-400' :
                'text-red-400'
              }`}>
                {machine.status}
              </span>
            </div>
            <div 
              className="flex justify-between items-center relative"
              onMouseEnter={handleMouseEnter('Mean Time Between Failures (average time between breakdowns)')}
              onMouseLeave={handleMouseLeave}
              onMouseMove={handleMouseMove}
            >
              <span className="text-gray-400 flex items-center">
                MTBF
                <Info className="h-3 w-3 ml-1 text-gray-500" />
              </span>
              <span className="text-blue-400 font-medium">{stats.mtbf} minutes</span>
            </div>
            <div 
              className="flex justify-between items-center relative"
              onMouseEnter={handleMouseEnter('Mean Time To Repair (average time to repair a breakdown)')}
              onMouseLeave={handleMouseLeave}
              onMouseMove={handleMouseMove}
            >
              <span className="text-gray-400 flex items-center">
                MTTR
                <Info className="h-3 w-3 ml-1 text-gray-500" />
              </span>
              <span className="text-purple-400 font-medium">{stats.mttr} minutes</span>
            </div>
            <div 
              className="flex justify-between items-center relative"
              onMouseEnter={handleMouseEnter('Total time the machine was running in the selected period')}
              onMouseLeave={handleMouseLeave}
              onMouseMove={handleMouseMove}
            >
              <span className="text-gray-400 flex items-center">
                Running Time
                <Info className="h-3 w-3 ml-1 text-gray-500" />
              </span>
              <span className="text-green-400 font-medium">
                {Math.round((stats.totalRunningMinutes || 0) / 60 * 10) / 10}h
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Production Timeline */}
      <div className="bg-gray-800 rounded-lg border border-gray-700">
        <div className="p-6 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Real-time Production Timeline</h2>
          <p className="text-sm text-gray-400 mt-1">
            Live production data with operator and mold information
          </p>
        </div>
        <div className="p-6">
          <ProductionTimeline 
            data={timeline} 
            machineId={id!}
            onAddStoppage={handleAddStoppage}
            onUpdateProduction={handleUpdateProduction}
          />
        </div>
      </div>
    </div>
  );
};

export default MachineView;