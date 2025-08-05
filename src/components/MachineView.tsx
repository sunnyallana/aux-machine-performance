import React, { useEffect, useState, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Machine, ProductionTimelineDay, MachineStats, MachineStatus } from '../types';
import apiService from '../services/api';
import socketService from '../services/socket';
import ProductionTimeline from './ProductionTimeline';
import { ToastContainer, toast } from 'react-toastify';
import { format, subDays, subWeeks, subMonths } from 'date-fns';
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
  Calendar,
  RefreshCw
} from 'lucide-react';
import { ThemeContext } from '../App';

const MachineView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isDarkMode } = useContext(ThemeContext);
  const [machine, setMachine] = useState<Machine | null>(null);
  const [timeline, setTimeline] = useState<ProductionTimelineDay[]>([]);
  const [stats, setStats] = useState<MachineStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('7d');
  const [customDateRange, setCustomDateRange] = useState({
    startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd')
  });
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [machineStatus, setMachineStatus] = useState<string>('inactive');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    description: ''
  });
  const [warnings, setWarnings] = useState<string[]>([]);
  const [currentLocalTime, setCurrentLocalTime] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  // Tooltip state
  const [tooltip, setTooltip] = useState<{
    content: string;
    x: number;
    y: number;
    visible: boolean;
  } | null>(null);

  // Theme classes
  const bgClass = isDarkMode ? 'bg-gray-900' : 'bg-gray-50';
  const cardBgClass = isDarkMode ? 'bg-gray-800' : 'bg-white';
  const cardBorderClass = isDarkMode ? 'border-gray-700' : 'border-gray-200';
  const textClass = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondaryClass = isDarkMode ? 'text-gray-400' : 'text-gray-600';
  const inputBgClass = isDarkMode ? 'bg-gray-700' : 'bg-white';
  const inputBorderClass = isDarkMode ? 'border-gray-600' : 'border-gray-300';
  const buttonPrimaryClass = isDarkMode 
    ? 'bg-blue-600 hover:bg-blue-700' 
    : 'bg-blue-600 hover:bg-blue-500';
  const buttonSecondaryClass = isDarkMode 
    ? 'border-gray-600 text-gray-300 hover:bg-gray-700' 
    : 'border-gray-300 text-gray-700 hover:bg-gray-100';

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
  }, [id]);

  // Separate effect for period changes to avoid unnecessary refetches
  useEffect(() => {
    if (id && machine) {
      fetchTimelineAndStats();
    }
  }, [selectedPeriod, customDateRange]);

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
        // Only refresh if the update is within our current time range
        const updateDate = new Date(update.timestamp);
        const { startDate, endDate } = getDateRange();
        
        if (updateDate >= startDate && updateDate <= endDate) {
          // Debounce stats refresh to avoid too many requests
          debouncedStatsRefresh();
        }
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
        
        // Only refresh stats if assignment is within current time range
        const assignmentDate = new Date(update.date);
        const { startDate, endDate } = getDateRange();
        
        if (assignmentDate >= startDate && assignmentDate <= endDate) {
          debouncedStatsRefresh();
        }
        
        // Remove warnings for updated hours
        setWarnings(prev => prev.filter(w => 
          !update.hours.includes(parseInt(w.split(' ')[4]))
        ));
      }
    };

    const handleStoppageUpdated = (update: any) => {
      if (update.machineId === id) {
        const stoppageDate = new Date(update.date || update.timestamp);
        const { startDate, endDate } = getDateRange();
        
        if (stoppageDate >= startDate && stoppageDate <= endDate) {
          debouncedStatsRefresh();
        }
      }
    };

    const handleStoppageDetected = (stoppage: any) => {
      if (stoppage.machineId === id) {
        toast.warning(`Stoppage detected: ${stoppage.duration} minutes`, {
          position: "top-right",
          autoClose: 5000,
          theme: isDarkMode ? "dark" : "light"
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

  // Debounced stats refresh to prevent excessive API calls
  const debouncedStatsRefresh = (() => {
    let timeout: NodeJS.Timeout;
    return () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        fetchStats();
      }, 1000); // Wait 1 second before refreshing
    };
  })();

  const getDateRange = () => {
    if (selectedPeriod === 'custom') {
      return {
        startDate: new Date(customDateRange.startDate),
        endDate: new Date(customDateRange.endDate)
      };
    }
    
    const endDate = new Date();
    let startDate: Date;
    
    switch (selectedPeriod) {
      case '24h':
        startDate = subDays(endDate, 1);
        break;
      case '7d':
        startDate = subDays(endDate, 7);
        break;
      case '30d':
        startDate = subDays(endDate, 30);
        break;
      case '3m':
        startDate = subMonths(endDate, 3);
        break;
      case '6m':
        startDate = subMonths(endDate, 6);
        break;
      case '1y':
        startDate = subMonths(endDate, 12);
        break;
      default:
        startDate = subDays(endDate, 7);
    }
    
    return { startDate, endDate };
  };

  const fetchMachineData = async () => {
    try {
      setLoading(true);
      const machineData = await apiService.getMachine(id!);
      
      setMachine(machineData);
      setEditForm({
        name: machineData.name,
        description: machineData.description || ''
      });
      
      // Fetch timeline and stats separately to allow for different time ranges
      await fetchTimelineAndStats();
      setLastFetch(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch machine data';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTimelineAndStats = async () => {
    try {
      const { startDate, endDate } = getDateRange();
      
      const [timelineData, statsData] = await Promise.all([
        apiService.getProductionTimelineCustom(id!, startDate, endDate),
        apiService.getMachineStatsCustom(id!, startDate, endDate)
      ]);
      
      setTimeline(timelineData);
      setStats(statsData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch timeline and stats';
      toast.error(message);
    }
  };

  const fetchStats = async () => {
    try {
      const { startDate, endDate } = getDateRange();
      const statsData = await apiService.getMachineStatsCustom(id!, startDate, endDate);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await fetchTimelineAndStats();
      setLastFetch(new Date());
      toast.success('Data refreshed');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh data';
      toast.error(message);
    } finally {
      setRefreshing(false);
    }
  };

  const handlePeriodChange = (period: string) => {
    setSelectedPeriod(period);
    if (period !== 'custom') {
      setShowCustomRange(false);
    } else {
      setShowCustomRange(true);
    }
  };

  const handleCustomDateChange = (field: 'startDate' | 'endDate', value: string) => {
    setCustomDateRange(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const applyCustomRange = () => {
    if (new Date(customDateRange.startDate) > new Date(customDateRange.endDate)) {
      toast.error('Start date cannot be after end date');
      return;
    }
    fetchTimelineAndStats();
  };

  // Remove the old fetchMachineData call and replace with optimized version
  const oldFetchMachineData = async () => {
    try {
      setLoading(true);
      const [machineData, timelineData, statsData] = await Promise.all([
        apiService.getMachine(id!),
        apiService.getProductionTimelineCustom(id!, ...Object.values(getDateRange())),
        apiService.getMachineStatsCustom(id!, ...Object.values(getDateRange()))
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

  const handleAddStoppage = async (stoppage: any) => {
    try {
      await apiService.addStoppageRecord({
        ...stoppage,
        machineId: id
      });
      toast.success('Stoppage recorded successfully');
      // Only refresh if stoppage is within current time range
      const stoppageDate = new Date(stoppage.date);
      const { startDate, endDate } = getDateRange();
      
      if (stoppageDate >= startDate && stoppageDate <= endDate) {
        fetchTimelineAndStats();
      }
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
      
      // Only refresh if update is within current time range
      const updateDate = new Date(date);
      const { startDate, endDate } = getDateRange();
      
      if (updateDate >= startDate && updateDate <= endDate) {
        fetchTimelineAndStats();
      }
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
      <div className={`flex items-center justify-center h-64 ${bgClass}`}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!machine || !stats) {
    return (
      <div className={`text-center py-12 ${bgClass}`}>
        <p className={textSecondaryClass}>Machine not found</p>
      </div>
    );
  }

  return (
    <div className={`space-y-6 min-h-screen p-4 ${bgClass}`}>
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
        theme={isDarkMode ? "dark" : "light"}
      />
      
      {/* Custom Tooltip */}
      {tooltip && (
        <div 
          className={`fixed text-sm px-3 py-2 rounded-md shadow-lg z-50 border transition-opacity ${
            tooltip.visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          } ${isDarkMode ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-200'}`}
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
            className={`p-2 ${textSecondaryClass} hover:${textClass} hover:${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'} rounded-md transition-colors`}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          {isEditing ? (
            <div className="space-y-2 flex-1">
              <input
                name="name"
                value={editForm.name}
                onChange={handleEditChange}
                className={`text-2xl font-bold ${textClass} ${inputBgClass} border ${inputBorderClass} rounded px-2 py-1 w-full`}
              />
              <textarea
                name="description"
                value={editForm.description}
                onChange={handleEditChange}
                className={`${textSecondaryClass} ${inputBgClass} border ${inputBorderClass} rounded px-2 py-1 w-full text-sm`}
                rows={2}
              />
            </div>
          ) : (
            <div>
              <h1 className={`text-2xl font-bold ${textClass}`}>{machine.name}</h1>
              <p className={textSecondaryClass}>{machine.description}</p>
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
                className={`px-3 py-2 ${buttonSecondaryClass} rounded-md`}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className={`px-3 py-2 ${buttonPrimaryClass} text-white rounded-md`}
              >
                Save
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className={`p-2 ${textSecondaryClass} hover:${textClass} hover:${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'} rounded-md transition-colors`}
              title="Edit machine details"
            >
              <Edit className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Mold, Operator Assignment Warning */}
      {warnings.length > 0 && (
      <div className={`rounded-lg p-4 mb-6 ${
        isDarkMode ? 'bg-yellow-900/30 border border-yellow-500' : 'bg-yellow-100 border border-yellow-300'
      }`}>
        <div className="flex items-center space-x-2 mb-2">
          <AlertTriangle className={`h-5 w-5 ${isDarkMode ? 'text-yellow-400' : 'text-yellow-600'}`} />
          <h3 className={`${isDarkMode ? 'text-yellow-400' : 'text-yellow-600'} font-medium`}>Assignment Warnings</h3>
        </div>
        <ul className={`list-disc pl-5 ${isDarkMode ? 'text-yellow-300' : 'text-yellow-700'}`}>
          {warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      </div>
      )}

      {/* Key Metrics - Compact Layout */}
      <div className="grid grid-cols-4 gap-2">
        <div 
          className={`p-3 rounded-lg border flex items-center relative ${cardBgClass} ${cardBorderClass}`}
          onMouseEnter={handleMouseEnter('Total units produced in the selected time period')}
          onMouseLeave={handleMouseLeave}
          onMouseMove={handleMouseMove}
        >
          <TrendingUp className={`h-6 w-6 mr-3 ${isDarkMode ? 'text-green-400' : 'text-green-500'}`} />
          <div>
            <p className={`text-xs flex items-center ${textSecondaryClass}`}>
              Units
              <Info className="h-3 w-3 ml-1" />
            </p>
            <p className={`text-lg font-semibold ${textClass}`}>{stats.totalUnitsProduced}</p>
          </div>
        </div>

        <div 
          className={`p-3 rounded-lg border flex items-center relative ${cardBgClass} ${cardBorderClass}`}
          onMouseEnter={handleMouseEnter('Overall Equipment Effectiveness (Availability × Performance × Quality)')}
          onMouseLeave={handleMouseLeave}
          onMouseMove={handleMouseMove}
        >
          <Gauge className={`h-6 w-6 mr-3 ${isDarkMode ? 'text-yellow-400' : 'text-amber-500'}`} />
          <div>
            <p className={`text-xs flex items-center ${textSecondaryClass}`}>
              OEE
              <Info className="h-3 w-3 ml-1" />
            </p>
            <p className={`text-lg font-semibold ${isDarkMode ? 'text-yellow-400' : 'text-amber-600'}`}>{stats.oee}%</p>
          </div>
        </div>

        <div 
          className={`p-3 rounded-lg border flex items-center relative ${cardBgClass} ${cardBorderClass}`}
          onMouseEnter={handleMouseEnter('Mean Time Between Failures (average time between breakdowns)')}
          onMouseLeave={handleMouseLeave}
          onMouseMove={handleMouseMove}
        >
          <Clock className={`h-6 w-6 mr-3 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`} />
          <div>
            <p className={`text-xs flex items-center ${textSecondaryClass}`}>
              MTBF
              <Info className="h-3 w-3 ml-1" />
            </p>
            <p className={`text-lg font-semibold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>{stats.mtbf}m</p>
          </div>
        </div>

        <div 
          className={`p-3 rounded-lg border flex items-center relative ${cardBgClass} ${cardBorderClass}`}
          onMouseEnter={handleMouseEnter('Mean Time To Repair (average time to repair a breakdown)')}
          onMouseLeave={handleMouseLeave}
          onMouseMove={handleMouseMove}
        >
          <Activity className={`h-6 w-6 mr-3 ${isDarkMode ? 'text-purple-400' : 'text-purple-500'}`} />
          <div>
            <p className={`text-xs flex items-center ${textSecondaryClass}`}>
              MTTR
              <Info className="h-3 w-3 ml-1" />
            </p>
            <p className={`text-lg font-semibold ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>{stats.mttr}m</p>
          </div>
        </div>
      </div>

      {/* Time Period Selector */}
      <div className={`rounded-lg border p-4 ${cardBgClass} ${cardBorderClass}`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <Calendar className={`h-5 w-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`} />
            <div>
              <h3 className={`text-lg font-semibold ${textClass}`}>Time Range</h3>
              <p className={`text-sm ${textSecondaryClass}`}>
                {lastFetch && `Last updated: ${format(lastFetch, 'HH:mm:ss')}`}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className={`p-2 ${textSecondaryClass} hover:${textClass} hover:${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'} rounded-md transition-colors`}
              title="Refresh data"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <span className={`text-sm ${textSecondaryClass} self-center`}>Quick Select:</span>
          {[
            { value: '24h', label: '24 Hours' },
              { value: '7d', label: '7 Days' },
              { value: '30d', label: '30 Days' },
              { value: '3m', label: '3 Months' },
              { value: '6m', label: '6 Months' },
              { value: '1y', label: '1 Year' },
              { value: 'custom', label: 'Custom Range' }
          ].map((period) => (
            <button
              key={period.value}
                onClick={() => handlePeriodChange(period.value)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                selectedPeriod === period.value
                  ? 'bg-blue-600 text-white'
                  : `${buttonSecondaryClass}`
              }`}
            >
              {period.label}
            </button>
          ))}
        </div>
          
          {showCustomRange && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-lg border border-dashed border-gray-300">
              <div>
                <label className={`block text-sm font-medium mb-1 ${textSecondaryClass}`}>
                  Start Date
                </label>
                <input
                  type="date"
                  value={customDateRange.startDate}
                  onChange={(e) => handleCustomDateChange('startDate', e.target.value)}
                  className={`w-full px-3 py-2 ${inputBgClass} border ${inputBorderClass} rounded-md ${textClass} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
              </div>
              
              <div>
                <label className={`block text-sm font-medium mb-1 ${textSecondaryClass}`}>
                  End Date
                </label>
                <input
                  type="date"
                  value={customDateRange.endDate}
                  onChange={(e) => handleCustomDateChange('endDate', e.target.value)}
                  className={`w-full px-3 py-2 ${inputBgClass} border ${inputBorderClass} rounded-md ${textClass} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
              </div>
              
              <div className="flex items-end">
                <button
                  onClick={applyCustomRange}
                  className={`w-full px-4 py-2 ${buttonPrimaryClass} text-white rounded-md transition-colors`}
                >
                  Apply Range
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detailed Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={`p-6 rounded-lg border ${cardBgClass} ${cardBorderClass}`}>
          <h3 className={`text-lg font-semibold ${textClass} mb-4`}>Performance Metrics</h3>
          <div className="space-y-4">
            <div 
              className="flex justify-between items-center relative"
              onMouseEnter={handleMouseEnter('Percentage of time the machine was available for production')}
              onMouseLeave={handleMouseLeave}
              onMouseMove={handleMouseMove}
            >
              <span className={`flex items-center ${textSecondaryClass}`}>
                Availability
                <Info className="h-3 w-3 ml-1" />
              </span>
              <div className="flex items-center space-x-2">
                <div className={`w-20 rounded-full h-2 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                  <div 
                    className="bg-green-500 h-2 rounded-full" 
                    style={{ width: `${stats.availability}%` }}
                  ></div>
                </div>
                <span className={`font-medium ${textClass}`}>{stats.availability}%</span>
              </div>
            </div>
            
            <div 
              className="flex justify-between items-center relative"
              onMouseEnter={handleMouseEnter('Percentage of units that meet quality standards')}
              onMouseLeave={handleMouseLeave}
              onMouseMove={handleMouseMove}
            >
              <span className={`flex items-center ${textSecondaryClass}`}>
                Quality
                <Info className="h-3 w-3 ml-1" />
              </span>
              <div className="flex items-center space-x-2">
                <div className={`w-20 rounded-full h-2 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                  <div 
                    className="bg-blue-500 h-2 rounded-full" 
                    style={{ width: `${stats.quality}%` }}
                  ></div>
                </div>
                <span className={`font-medium ${textClass}`}>{stats.quality}%</span>
              </div>
            </div>
            
            <div 
              className="flex justify-between items-center relative"
              onMouseEnter={handleMouseEnter('Actual production rate compared to the maximum possible rate')}
              onMouseLeave={handleMouseLeave}
              onMouseMove={handleMouseMove}
            >
              <span className={`flex items-center ${textSecondaryClass}`}>
                Performance
                <Info className="h-3 w-3 ml-1" />
              </span>
              <div className="flex items-center space-x-2">
                <div className={`w-20 rounded-full h-2 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                  <div 
                    className="bg-yellow-500 h-2 rounded-full" 
                    style={{ width: `${stats.performance}%` }}
                  ></div>
                </div>
                <span className={`font-medium ${textClass}`}>{stats.performance}%</span>
              </div>
            </div>
          </div>
        </div>

        <div className={`p-6 rounded-lg border ${cardBgClass} ${cardBorderClass}`}>
          <h3 className={`text-lg font-semibold ${textClass} mb-4`}>Quality Metrics</h3>
          <div className="space-y-4">
            <div 
              className="flex justify-between items-center relative"
              onMouseEnter={handleMouseEnter('Units that passed quality inspection')}
              onMouseLeave={handleMouseLeave}
              onMouseMove={handleMouseMove}
            >
              <span className={`flex items-center ${textSecondaryClass}`}>
                Good Units
                <Info className="h-3 w-3 ml-1" />
              </span>
              <span className={`font-medium ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                {stats.totalUnitsProduced - stats.totalDefectiveUnits}
              </span>
            </div>
            <div 
              className="flex justify-between items-center relative"
              onMouseEnter={handleMouseEnter('Units that failed quality inspection')}
              onMouseLeave={handleMouseLeave}
              onMouseMove={handleMouseMove}
            >
              <span className={`flex items-center ${textSecondaryClass}`}>
                Defective Units
                <Info className="h-3 w-3 ml-1" />
              </span>
              <span className={`font-medium ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>{stats.totalDefectiveUnits}</span>
            </div>
            <div 
              className="flex justify-between items-center relative"
              onMouseEnter={handleMouseEnter('Percentage of units that were defective')}
              onMouseLeave={handleMouseLeave}
              onMouseMove={handleMouseMove}
            >
              <span className={`flex items-center ${textSecondaryClass}`}>
                Defect Rate
                <Info className="h-3 w-3 ml-1" />
              </span>
              <span className={`font-medium ${isDarkMode ? 'text-yellow-400' : 'text-amber-600'}`}>
                {stats.totalUnitsProduced > 0 
                  ? ((stats.totalDefectiveUnits / stats.totalUnitsProduced) * 100).toFixed(1)
                  : 0
                }%
              </span>
            </div>
          </div>
        </div>

        <div className={`p-6 rounded-lg border ${cardBgClass} ${cardBorderClass}`}>
          <h3 className={`text-lg font-semibold ${textClass} mb-4`}>Reliability</h3>
          <div className="space-y-4">
            <div 
              className="flex justify-between items-center relative"
              onMouseEnter={handleMouseEnter('Current operational status of the machine')}
              onMouseLeave={handleMouseLeave}
              onMouseMove={handleMouseMove}
            >
              <span className={`flex items-center ${textSecondaryClass}`}>
                Current Status
                <Info className="h-3 w-3 ml-1" />
              </span>
              <span className={`font-medium capitalize ${
                machine.status === 'running' 
                  ? isDarkMode ? 'text-green-400' : 'text-green-600' :
                machine.status === 'inactive' 
                  ? isDarkMode ? 'text-red-400' : 'text-red-600' :
                machine.status === 'stopped_yet_producing' 
                  ? isDarkMode ? 'text-orange-400' : 'text-orange-600' :
                  isDarkMode ? 'text-red-400' : 'text-red-600'
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
              <span className={`flex items-center ${textSecondaryClass}`}>
                MTBF
                <Info className="h-3 w-3 ml-1" />
              </span>
              <span className={`font-medium ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>{stats.mtbf} minutes</span>
            </div>
            <div 
              className="flex justify-between items-center relative"
              onMouseEnter={handleMouseEnter('Mean Time To Repair (average time to repair a breakdown)')}
              onMouseLeave={handleMouseLeave}
              onMouseMove={handleMouseMove}
            >
              <span className={`flex items-center ${textSecondaryClass}`}>
                MTTR
                <Info className="h-3 w-3 ml-1" />
              </span>
              <span className={`font-medium ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>{stats.mttr} minutes</span>
            </div>
            <div 
              className="flex justify-between items-center relative"
              onMouseEnter={handleMouseEnter('Total time the machine was running in the selected period')}
              onMouseLeave={handleMouseLeave}
              onMouseMove={handleMouseMove}
            >
              <span className={`flex items-center ${textSecondaryClass}`}>
                Running Time
                <Info className="h-3 w-3 ml-1" />
              </span>
              <span className={`font-medium ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                {Math.round((stats.totalRunningMinutes || 0) / 60 * 10) / 10}h
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Production Timeline */}
      <div className={`rounded-lg border ${cardBgClass} ${cardBorderClass}`}>
        <div className={`p-6 border-b ${cardBorderClass}`}>
          <h2 className={`text-lg font-semibold ${textClass}`}>Real-time Production Timeline</h2>
          <p className={`text-sm mt-1 ${textSecondaryClass}`}>
            Live production data with operator and mold information
          </p>
        </div>
        <div className="p-6">
          <ProductionTimeline 
            data={timeline} 
            machineId={id!}
            dateRange={getDateRange()}
            onAddStoppage={handleAddStoppage}
            onUpdateProduction={handleUpdateProduction}
          />
        </div>
      </div>
    </div>
  );
};

export default MachineView;