import { useState, useEffect, useCallback } from 'react';
import { ProductionTimelineDay, ProductionHour, StoppageRecord, User, Mold } from '../types';
import { format, parseISO, startOfDay, endOfDay, isToday, isThisWeek, isThisMonth, startOfWeek, endOfWeek, startOfMonth, endOfMonth, differenceInMinutes } from 'date-fns';
import socketService from '../services/socket';
import apiService from '../services/api';
import { 
  Clock, 
  User as UserIcon, 
  Wrench, 
  AlertTriangle, 
  X, 
  Plus,
  Play,
  Pause,
  Settings,
  Package,
  TrendingUp,
  TrendingDown,
  Activity,
  ChevronLeft,
  ChevronRight,
  Zap,
  ZapOff
} from 'lucide-react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

interface ProductionTimelineProps {
  data: ProductionTimelineDay[];
  machineId: string;
  onAddStoppage?: (stoppage: Partial<StoppageRecord>) => void;
  onUpdateProduction?: (machineId: string, hour: number, date: string, data: any) => void;
}

interface ProductionModalProps {
  isOpen: boolean;
  onClose: () => void;
  hour: ProductionHour;
  date: string;
  machineId: string;
  onAddStoppage?: (stoppage: Partial<StoppageRecord>) => void;
  onUpdateProduction?: (machineId: string, hour: number, date: string, data: any) => void;
  availableOperators?: User[];
  availableMolds?: Mold[];
}

const ProductionModal: React.FC<ProductionModalProps> = ({
  isOpen,
  onClose,
  hour,
  date,
  machineId,
  onAddStoppage,
  onUpdateProduction,
  availableOperators = [],
  availableMolds = []
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'stoppage' | 'assignment'>('details');
  const [stoppageForm, setStoppageForm] = useState({
    reason: '',
    description: '',
    duration: 30
  });
  const [assignmentForm, setAssignmentForm] = useState({
    operatorId: hour.operator?._id || hour.operator?.id || '',
    moldId: hour.mold?._id || '',
    defectiveUnits: hour.defectiveUnits || 0
  });

  // Check for pending stoppages
  const pendingStoppage = hour.stoppages.find(s => s.reason === 'undefined');

  useEffect(() => {
    if (pendingStoppage) {
      setActiveTab('stoppage');
      setStoppageForm({
        reason: '',
        description: '',
        duration: pendingStoppage.duration || 30
      });
    }
  }, [pendingStoppage]);

  if (!isOpen) return null;

  const handleStoppageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stoppageForm.reason.trim()) return;

    try {
      const stoppageData = {
        machineId,
        hour: hour.hour,
        date,
        reason: stoppageForm.reason,
        description: stoppageForm.description.trim(),
        duration: stoppageForm.duration,
        ...(pendingStoppage && { pendingStoppageId: (pendingStoppage as any)._id })
      };

      await apiService.addStoppageRecord(stoppageData);
      
      setStoppageForm({ reason: '', description: '', duration: 30 });
      toast.success('Stoppage recorded successfully');
      onClose();
    } catch (error) {
      console.error('Failed to add stoppage:', error);
      toast.error('Failed to record stoppage');
    }
  };

  const handleAssignmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await apiService.updateProductionAssignment({
        machineId,
        hour: hour.hour,
        date,
        operatorId: assignmentForm.operatorId || null,
        moldId: assignmentForm.moldId || null,
        defectiveUnits: assignmentForm.defectiveUnits
      });
      
      toast.success('Assignment updated successfully');
      onClose();
    } catch (error) {
      console.error('Failed to update assignment:', error);
      toast.error('Failed to update assignment');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-green-400';
      case 'stopped': return 'text-red-400';
      case 'maintenance': return 'text-yellow-400';
      case 'mold_change': return 'text-blue-400';
      case 'breakdown': return 'text-red-500';
      default: return 'text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Play className="h-4 w-4" />;
      case 'stopped': return <Pause className="h-4 w-4" />;
      case 'maintenance': return <Settings className="h-4 w-4" />;
      case 'mold_change': return <Package className="h-4 w-4" />;
      case 'breakdown': return <AlertTriangle className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg border border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">
            Production Details - {format(parseISO(date), 'MMM dd')}, {hour.hour.toString().padStart(2, '0')}:00
            {pendingStoppage && (
              <span className="ml-2 text-red-400 text-sm animate-pulse">
                (Stoppage Detected - Needs Categorization)
              </span>
            )}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-700">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'details', label: 'Details', icon: Activity },
              { id: 'assignment', label: 'Assignment', icon: UserIcon },
              { id: 'stoppage', label: pendingStoppage ? 'Categorize Stoppage' : 'Add Stoppage', icon: pendingStoppage ? AlertTriangle : Plus }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center space-x-2 py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-300'
                } ${pendingStoppage && tab.id === 'stoppage' ? 'text-red-400 animate-pulse' : ''}`}
              >
                <tab.icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* Details Tab */}
          {activeTab === 'details' && (
            <div className="space-y-6">
              {/* Production Summary */}
              <div className="bg-gray-700 rounded-lg p-4">
                <h4 className="text-sm font-medium text-white mb-3">Production Summary</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="flex items-center justify-center mb-2">
                      <TrendingUp className="h-5 w-5 text-green-400" />
                    </div>
                    <div className="text-2xl font-bold text-white">{hour.unitsProduced}</div>
                    <div className="text-xs text-gray-400">Units Produced</div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center mb-2">
                      <TrendingDown className="h-5 w-5 text-red-400" />
                    </div>
                    <div className="text-2xl font-bold text-red-400">{hour.defectiveUnits}</div>
                    <div className="text-xs text-gray-400">Defective Units</div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center mb-2">
                      <div className={getStatusColor(hour.status)}>
                        {getStatusIcon(hour.status)}
                      </div>
                    </div>
                    <div className={`text-sm font-medium capitalize ${getStatusColor(hour.status)}`}>
                      {hour.status.replace('_', ' ')}
                    </div>
                    <div className="text-xs text-gray-400">Status</div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center mb-2">
                      <Activity className="h-5 w-5 text-blue-400" />
                    </div>
                    <div className="text-2xl font-bold text-blue-400">
                      {hour.unitsProduced > 0 ? ((hour.unitsProduced - hour.defectiveUnits) / hour.unitsProduced * 100).toFixed(1) : 0}%
                    </div>
                    <div className="text-xs text-gray-400">Quality Rate</div>
                  </div>
                </div>
              </div>

              {/* Time Distribution */}
              <div className="bg-gray-700 rounded-lg p-4">
                <h4 className="text-sm font-medium text-white mb-3">Time Distribution</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-400">{hour.runningMinutes || 0}m</div>
                    <div className="text-xs text-gray-400">Running Time</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-red-400">{hour.stoppageMinutes || 0}m</div>
                    <div className="text-xs text-gray-400">Stoppage Time</div>
                  </div>
                </div>
                
                {/* Visual time bar */}
                <div className="mt-3 h-4 bg-gray-600 rounded-full overflow-hidden">
                  <div className="h-full flex">
                    <div 
                      className="bg-green-500" 
                      style={{ width: `${((hour.runningMinutes || 0) / 60) * 100}%` }}
                    ></div>
                    <div 
                      className="bg-red-500" 
                      style={{ width: `${((hour.stoppageMinutes || 0) / 60) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Assignment Information */}
              <div className="bg-gray-700 rounded-lg p-4">
                <h4 className="text-sm font-medium text-white mb-3">Assignment Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center space-x-3">
                    <UserIcon className="h-5 w-5 text-blue-400" />
                    <div>
                      <div className="text-sm text-gray-400">Operator</div>
                      <div className="text-white font-medium">
                        {hour.operator?.username || 'Not assigned'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Wrench className="h-5 w-5 text-purple-400" />
                    <div>
                      <div className="text-sm text-gray-400">Mold</div>
                      <div className="text-white font-medium">
                        {hour.mold?.name || 'Not assigned'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stoppages */}
              {hour.stoppages.length > 0 && (
                <div className="bg-gray-700 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-white mb-3">Stoppages</h4>
                  <div className="space-y-3">
                    {hour.stoppages.map((stoppage, index) => (
                      <div key={index} className={`rounded-lg p-3 ${
                        stoppage.reason === 'undefined' || (stoppage as any).isPending 
                          ? 'bg-red-900/30 border border-red-500 animate-pulse' 
                          : 'bg-gray-600'
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <AlertTriangle className={`h-4 w-4 ${
                              stoppage.reason === 'undefined' || (stoppage as any).isPending 
                                ? 'text-red-400' 
                                : 'text-red-400'
                            }`} />
                            <span className="text-sm font-medium text-white capitalize">
                              {stoppage.reason === 'undefined' ? 'Pending Categorization' : stoppage.reason.replace('_', ' ')}
                            </span>
                          </div>
                          <span className="text-xs text-gray-400">
                            {stoppage.duration || 0} min
                          </span>
                        </div>
                        {stoppage.description && (
                          <p className="text-xs text-gray-300 ml-6">{stoppage.description}</p>
                        )}
                        {(stoppage.reason === 'undefined' || (stoppage as any).isPending) && (
                          <p className="text-xs text-red-300 ml-6 mt-1">
                            Click "Categorize Stoppage" tab to assign a reason
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Assignment Tab */}
          {activeTab === 'assignment' && (
            <form onSubmit={handleAssignmentSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Operator
                </label>
                <select
                  value={assignmentForm.operatorId}
                  onChange={(e) => setAssignmentForm({...assignmentForm, operatorId: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">No operator assigned</option>
                  {availableOperators.map((operator) => (
                    <option key={operator._id || operator.id} value={operator._id || operator.id}>
                      {operator.username}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Mold
                </label>
                <select
                  value={assignmentForm.moldId}
                  onChange={(e) => setAssignmentForm({...assignmentForm, moldId: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">No mold assigned</option>
                  {availableMolds.map((mold) => (
                    <option key={mold._id} value={mold._id}>
                      {mold.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Defective Units
                </label>
                <input
                  type="number"
                  min="0"
                  value={assignmentForm.defectiveUnits}
                  onChange={(e) => setAssignmentForm({...assignmentForm, defectiveUnits: parseInt(e.target.value) || 0})}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
                >
                  Update Assignment
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Stoppage Tab */}
          {activeTab === 'stoppage' && (
            <form onSubmit={handleStoppageSubmit} className="space-y-4">
              {pendingStoppage && (
                <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 mb-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <AlertTriangle className="h-5 w-5 text-red-400" />
                    <h4 className="text-red-400 font-medium">Stoppage Detected</h4>
                  </div>
                  <p className="text-red-300 text-sm">
                    A stoppage was automatically detected for {pendingStoppage.duration} minutes. 
                    Please categorize the reason for this stoppage.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Stoppage Reason *
                </label>
                <select
                  required
                  value={stoppageForm.reason}
                  onChange={(e) => setStoppageForm({...stoppageForm, reason: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select reason...</option>
                  <option value="planned">Planned Maintenance</option>
                  <option value="mold_change">Mold Change</option>
                  <option value="breakdown">Breakdown</option>
                  <option value="maintenance">Unplanned Maintenance</option>
                  <option value="material_shortage">Material Shortage</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {!pendingStoppage && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Duration (minutes) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="60"
                    value={stoppageForm.duration}
                    onChange={(e) => setStoppageForm({...stoppageForm, duration: parseInt(e.target.value) || 30})}
                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  value={stoppageForm.description}
                  onChange={(e) => setStoppageForm({...stoppageForm, description: e.target.value})}
                  rows={3}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Additional details about the stoppage..."
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  disabled={!stoppageForm.reason.trim()}
                  className="flex-1 bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {pendingStoppage ? 'Categorize Stoppage' : 'Add Stoppage'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

const ProductionTimeline: React.FC<ProductionTimelineProps> = ({ 
  data: initialData, 
  machineId, 
  onAddStoppage, 
  onUpdateProduction 
}) => {
  const [data, setData] = useState(initialData);
  const [selectedHour, setSelectedHour] = useState<{ hour: ProductionHour; date: string } | null>(null);
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day');
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [availableOperators, setAvailableOperators] = useState<User[]>([]);
  const [availableMolds, setAvailableMolds] = useState<Mold[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [machineStatus, setMachineStatus] = useState<'running' | 'stopped'>('running');
  const [lastPowerSignal, setLastPowerSignal] = useState<Date | null>(null);

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    
    return () => clearInterval(timer);
  }, []);

   // Check for power signal inactivity
  useEffect(() => {
    if (lastPowerSignal) {
      const minutesSinceLastSignal = differenceInMinutes(currentTime, lastPowerSignal);
      setMachineStatus(minutesSinceLastSignal > 2 ? 'stopped' : 'running');
    }
  }, [currentTime, lastPowerSignal]);

  // Update data when props change
  useEffect(() => {
    setData(initialData);
    // Auto-select today when data changes
    if (initialData.length > 0) {
      const todayIndex = initialData.findIndex(day => isToday(parseISO(day.date)));
      if (todayIndex >= 0) {
        setSelectedDayIndex(todayIndex);
      }
    }
  }, [initialData]);

  // Set up socket listeners for real-time updates
  useEffect(() => {
    socketService.connect();
    socketService.joinMachine(machineId);

    const handleProductionUpdate = (update: any) => {
      if (update.machineId === machineId) {
        setData(prevData => {
          const newData = [...prevData];
          const dayIndex = newData.findIndex(day => day.date === update.date);
          
          if (dayIndex >= 0) {
            const hourIndex = newData[dayIndex].hours.findIndex(h => h.hour === update.hour);
            if (hourIndex >= 0) {
              newData[dayIndex].hours[hourIndex] = {
                ...newData[dayIndex].hours[hourIndex],
                unitsProduced: update.unitsProduced,
                status: update.status,
                runningMinutes: update.runningMinutes || newData[dayIndex].hours[hourIndex].runningMinutes,
                stoppageMinutes: update.stoppageMinutes || newData[dayIndex].hours[hourIndex].stoppageMinutes
              };
            }
          }
          return newData;
        });
      }
    };

    const handlePendingStoppageDetected = (stoppage: any) => {
      if (stoppage.machineId === machineId) {
        setData(prevData => {
          const newData = [...prevData];
          const dayIndex = newData.findIndex(day => day.date === stoppage.date);
          
          if (dayIndex >= 0) {
            const hourIndex = newData[dayIndex].hours.findIndex(h => h.hour === stoppage.hour);
            if (hourIndex >= 0) {
              // Add pending stoppage
              const pendingStoppageRecord: StoppageRecord = {
                _id: stoppage.pendingStoppageId,
                reason: 'undefined',  // Explicitly type as allowed value
                description: 'Automatic stoppage detection - awaiting categorization',
                startTime: stoppage.stoppageStart,
                endTime: null,
                duration: stoppage.duration
              };

              // Check if this pending stoppage already exists
              const existingIndex = newData[dayIndex].hours[hourIndex].stoppages.findIndex(
                s => s._id === stoppage.pendingStoppageId
              );

              if (existingIndex === -1) {
                newData[dayIndex].hours[hourIndex].stoppages.push(pendingStoppageRecord);
              }

              newData[dayIndex].hours[hourIndex].status = 'stopped';
              newData[dayIndex].hours[hourIndex].stoppageMinutes = 
                (newData[dayIndex].hours[hourIndex].stoppageMinutes || 0) + stoppage.duration;
            }
          }
          
          return newData;
        });

        // Show toast notification
        toast.warning(`Stoppage detected on machine - ${stoppage.duration} minutes`, {
          position: "top-right",
          autoClose: 5000,
          theme: "dark"
        });
      }
    };

    const handlePowerSignal = (signal: any) => {
      if (signal.machineId === machineId) {
        setLastPowerSignal(new Date(signal.timestamp));
        if (signal.value === 1) {
          setMachineStatus('running');
        }
      }
    };

    const handleStoppageAdded = (stoppage: any) => {
      if (stoppage.machineId === machineId) {
        // Refresh data to get updated stoppages
        window.location.reload(); // Simple refresh for now
      }
    };

    socketService.on('production-update', handleProductionUpdate);
    socketService.on('pending-stoppage-detected', handlePendingStoppageDetected);
    socketService.on('stoppage-added', handleStoppageAdded);
    socketService.on('power-signal', handlePowerSignal);
    socketService.on('production-assignment-updated', handleProductionUpdate);

    return () => {
      socketService.off('production-update', handleProductionUpdate);
      socketService.off('pending-stoppage-detected', handlePendingStoppageDetected);
      socketService.off('stoppage-added', handleStoppageAdded);
      socketService.off('power-signal', handlePowerSignal);
      socketService.off('production-assignment-updated', handleProductionUpdate);
      socketService.leaveMachine(machineId);
    };
  }, [machineId]);

  // Fetch operators and molds
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [operators, molds] = await Promise.all([
          apiService.getUsers(),
          apiService.getMolds()
        ]);
        setAvailableOperators(operators.filter((u: any) => u.role === 'operator'));
        setAvailableMolds(molds);
      } catch (error) {
        console.error('Failed to fetch operators and molds:', error);
      }
    };

    fetchData();
  }, []);

  // Filter data based on view mode and current time
   const getFilteredData = useCallback(() => {
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    
    switch (viewMode) {
      case 'day':
        return initialData.filter(day => 
          new Date(day.date).toDateString() === todayUTC.toDateString()
        );
        
      case 'week':
        const startOfWeek = new Date(todayUTC);
        startOfWeek.setUTCDate(todayUTC.getUTCDate() - todayUTC.getUTCDay());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);
        
        return initialData.filter(day => {
          const dayDate = new Date(day.date);
          return dayDate >= startOfWeek && dayDate <= endOfWeek;
        });
        
      case 'month':
        const startOfMonth = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), 1));
        const endOfMonth = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth() + 1, 0));
        
        return initialData.filter(day => {
          const dayDate = new Date(day.date);
          return dayDate >= startOfMonth && dayDate <= endOfMonth;
        });
        
      default:
        return initialData;
    }
  }, [initialData, viewMode]);

  const filteredData = getFilteredData();
  const currentDay = filteredData[selectedDayIndex] || filteredData[0];

  const getHourColor = (hour: ProductionHour) => {
    const runningRatio = (hour.runningMinutes || 0) / 60;
    const stoppageRatio = (hour.stoppageMinutes || 0) / 60;
    
    // Check for pending stoppages
    const hasPendingStoppage = hour.stoppages.some(s => s.reason === 'undefined');
    if (hasPendingStoppage) return 'bg-red-600 animate-pulse';
    
    // Check for categorized stoppages
    if (hour.stoppages.length > 0) {
      const firstStoppage = hour.stoppages[0];
      switch (firstStoppage.reason) {
        case 'mold_change': return 'bg-purple-500';
        case 'breakdown': return 'bg-orange-600'; // New color for breakdown
        case 'maintenance': return 'bg-yellow-500';
        case 'planned': return 'bg-blue-500';
        case 'material_shortage': return 'bg-orange-500';
        case 'other': return 'bg-gray-500';
      }
    }
    
    // Normal status-based coloring
    if (hour.status === 'running' && hour.unitsProduced > 0) return 'bg-green-500';
    if (hour.status === 'running') return 'bg-yellow-500';
    if (hour.status === 'maintenance') return 'bg-blue-500';
    if (hour.status === 'mold_change') return 'bg-purple-500';
    if (hour.status === 'breakdown') return 'bg-orange-600';
    if (hour.status === 'stopped' || hour.status === 'error') return 'bg-red-500';
    
    return 'bg-gray-600';
  };

  const getHourIntensity = (hour: ProductionHour, maxUnits: number) => {
    if (maxUnits === 0) return 0.3;
    return Math.max(0.3, (hour.unitsProduced / maxUnits));
  };

  const formatTime = (hour: number) => {
    return `${hour.toString().padStart(2, '0')}:00`;
  };

  const getMaxUnitsForDay = (day: ProductionTimelineDay) => {
    return Math.max(...day.hours.map(h => h.unitsProduced), 1);
  };

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8">
        <Clock className="h-8 w-8 text-gray-600 mx-auto mb-2" />
        <p className="text-gray-400">No production data available</p>
      </div>
    );
  }

  if (!currentDay) {
    return (
      <div className="text-center py-8">
        <Clock className="h-8 w-8 text-gray-600 mx-auto mb-2" />
        <p className="text-gray-400">No data available for selected period</p>
      </div>
    );
  }

  const maxUnits = getMaxUnitsForDay(currentDay);

  return (
    <div className="space-y-4">
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

      {/* View Mode Selector */}
      <div className="flex items-center justify-between">
        <div className="flex space-x-1">
          {[
            { value: 'day', label: 'Today' },
            { value: 'week', label: 'This Week' },
            { value: 'month', label: 'This Month' }
          ].map((mode) => (
            <button
              key={mode.value}
              onClick={() => {
                setViewMode(mode.value as any);
                setSelectedDayIndex(0);
              }}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                viewMode === mode.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

         {/* Machine Status Indicator */}
        <div className={`flex items-center px-3 py-1 rounded-md ${
          machineStatus === 'running' 
            ? 'bg-green-900/30 text-green-400' 
            : 'bg-red-900/30 text-red-400'
        }`}>
          {machineStatus === 'running' ? (
            <Zap className="h-4 w-4 mr-1" />
          ) : (
            <ZapOff className="h-4 w-4 mr-1" />
          )}
          <span className="text-sm">
            {machineStatus === 'running' ? 'Running' : 'Stopped'}
          </span>
        </div>


        {/* Legend */}
        <div className="flex items-center space-x-3 text-xs">
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-green-500 rounded"></div>
            <span className="text-gray-300">Production</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-yellow-500 rounded"></div>
            <span className="text-gray-300">Running</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-red-500 rounded"></div>
            <span className="text-gray-300">Stoppage</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-orange-600 rounded"></div>
            <span className="text-gray-300">Breakdown</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-red-600 rounded animate-pulse"></div>
            <span className="text-gray-300">Pending</span>
          </div>
        </div>
      </div>

      {/* Day Navigation */}
      {filteredData.length > 1 && (
        <div className="flex items-center justify-between bg-gray-800 rounded-lg p-3 border border-gray-700">
          <button
            onClick={() => setSelectedDayIndex(Math.max(0, selectedDayIndex - 1))}
            disabled={selectedDayIndex === 0}
            className="p-1 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          
          <div className="text-center">
            <h3 className="text-lg font-semibold text-white">
              {format(parseISO(currentDay.date), 'EEEE, MMMM dd, yyyy')}
            </h3>
            <p className="text-sm text-gray-400">
              Total: {currentDay.hours.reduce((sum, h) => sum + h.unitsProduced, 0)} units • 
              Defects: {currentDay.hours.reduce((sum, h) => sum + h.defectiveUnits, 0)}
            </p>
          </div>
          
          <button
            onClick={() => setSelectedDayIndex(Math.min(filteredData.length - 1, selectedDayIndex + 1))}
            disabled={selectedDayIndex === filteredData.length - 1}
            className="p-1 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Compact Horizontal Timeline */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
        {/* Time Labels */}
        <div className="flex mb-2 text-xs text-gray-400">
          {currentDay.hours.map((hour) => (
            <div key={hour.hour} className="flex-1 text-center min-w-0">
              {formatTime(hour.hour)}
            </div>
          ))}
        </div>

        {/* Production Blocks */}
        <div className="flex gap-1 mb-3">
          {currentDay.hours.map((hour) => {
            const hasPendingStoppage = hour.stoppages.some(s => s.reason === 'undefined');
            
            return (
              <div
                key={hour.hour}
                className="flex-1 relative group cursor-pointer min-w-0"
                onClick={() => setSelectedHour({ hour, date: currentDay.date })}
              >
                {/* Main production block with running/stoppage visualization */}
                <div className={`h-12 rounded transition-all duration-200 group-hover:scale-105 border relative overflow-hidden ${
                  hasPendingStoppage ? 'border-red-500 border-2' : 'border-gray-600'
                }`}>
                  {/* Running time (green) */}
                  <div
                    className="absolute left-0 top-0 h-full bg-green-500"
                    style={{ 
                      width: `${((hour.runningMinutes || 0) / 60) * 100}%`,
                      opacity: getHourIntensity(hour, maxUnits)
                    }}
                  />
                  
                  {/* Stoppage time (red) */}
                  <div
                    className={`absolute top-0 h-full ${hasPendingStoppage ? 'bg-red-600 animate-pulse' : 'bg-red-500'}`}
                    style={{ 
                      left: `${((hour.runningMinutes || 0) / 60) * 100}%`,
                      width: `${((hour.stoppageMinutes || 0) / 60) * 100}%`,
                      opacity: hasPendingStoppage ? 1 : 0.8
                    }}
                  />
                  
                  {/* Remaining time (gray) */}
                  <div
                    className="absolute top-0 h-full bg-gray-600"
                    style={{ 
                      left: `${(((hour.runningMinutes || 0) + (hour.stoppageMinutes || 0)) / 60) * 100}%`,
                      width: `${(60 - (hour.runningMinutes || 0) - (hour.stoppageMinutes || 0)) / 60 * 100}%`,
                      opacity: 0.3
                    }}
                  />

                  {/* Units produced */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-bold text-white bg-black bg-opacity-60 px-1 rounded">
                      {hour.unitsProduced}
                    </span>
                  </div>

                  {/* Status indicators */}
                  <div className="absolute top-0 left-0 right-0 flex justify-between p-0.5">
                    {/* Operator indicator */}
                    {hour.operator && (
                      <div className="w-2 h-2 bg-blue-400 rounded-full" title="Operator assigned" />
                    )}
                    
                    {/* Defects indicator */}
                    {hour.defectiveUnits > 0 && (
                      <div className="w-2 h-2 bg-red-400 rounded-full" title={`${hour.defectiveUnits} defects`} />
                    )}
                  </div>

                  {/* Bottom indicators */}
                  <div className="absolute bottom-0 left-0 right-0 flex justify-between p-0.5">
                    {/* Mold indicator */}
                    {hour.mold && (
                      <div className="w-2 h-2 bg-purple-400 rounded-full" title="Mold assigned" />
                    )}
                    
                    {/* Stoppage indicator */}
                    {hour.stoppages.length > 0 && (
                      <div className={`w-2 h-2 rounded-full ${
                        hasPendingStoppage ? 'bg-red-600 animate-pulse' : 'bg-red-600'
                      }`} title={`${hour.stoppages.length} stoppages`} />
                    )}
                  </div>

                  {/* Pending stoppage overlay */}
                  {hasPendingStoppage && (
                    <div className="absolute inset-0 bg-red-600 bg-opacity-20 animate-pulse border-2 border-red-500 rounded">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <AlertTriangle className="h-4 w-4 text-red-400 animate-bounce" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Hover tooltip */}
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                  <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap border border-gray-600 shadow-lg">
                    <div className="font-medium">{formatTime(hour.hour)}</div>
                    <div>Units: <span className="text-green-400">{hour.unitsProduced}</span></div>
                    {hour.defectiveUnits > 0 && (
                      <div>Defects: <span className="text-red-400">{hour.defectiveUnits}</span></div>
                    )}
                    <div>Running: <span className="text-green-400">{hour.runningMinutes || 0}m</span></div>
                    <div>Stoppage: <span className="text-red-400">{hour.stoppageMinutes || 0}m</span></div>
                    {hour.operator && (
                      <div>Op: <span className="text-blue-400">{hour.operator.username}</span></div>
                    )}
                    {hour.mold && (
                      <div>Mold: <span className="text-purple-400">{hour.mold.name}</span></div>
                    )}
                    <div>Status: <span className="capitalize">{hour.status.replace('_', ' ')}</span></div>
                    {hour.stoppages.length > 0 && (
                      <div className="text-red-400">
                        {hasPendingStoppage && ' (PENDING)'}
                        {hour.stoppages.length} stoppage{hour.stoppages.length > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-4 pt-3 border-t border-gray-700">
          <div className="text-center">
            <div className="text-lg font-bold text-green-400">
              {currentDay.hours.reduce((sum, h) => sum + h.unitsProduced, 0)}
            </div>
            <div className="text-xs text-gray-400">Total Units</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-red-400">
              {currentDay.hours.reduce((sum, h) => sum + h.defectiveUnits, 0)}
            </div>
            <div className="text-xs text-gray-400">Defects</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-yellow-400">
              {Math.round(currentDay.hours.reduce((sum, h) => sum + (h.runningMinutes || 0), 0) / 60 * 10) / 10}h
            </div>
            <div className="text-xs text-gray-400">Running</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-blue-400">
              {currentDay.hours.reduce((sum, h) => sum + h.stoppages.length, 0)}
            </div>
            <div className="text-xs text-gray-400">Stoppages</div>
          </div>
        </div>
      </div>

      {/* Week/Month Overview */}
      {viewMode !== 'day' && filteredData.length > 1 && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <h4 className="text-sm font-medium text-white mb-3">
            {viewMode === 'week' ? 'Week' : 'Month'} Overview
          </h4>
          <div className="space-y-2">
            {filteredData.map((day, index) => (
              <div 
                key={day.date} 
                className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                  index === selectedDayIndex ? 'bg-blue-600/20 border border-blue-500/30' : 'hover:bg-gray-700'
                }`}
                onClick={() => setSelectedDayIndex(index)}
              >
                <div className="text-sm text-white">
                  {format(parseISO(day.date), 'MMM dd')}
                  {isToday(parseISO(day.date)) && (
                    <span className="ml-2 text-xs bg-blue-600 text-white px-2 py-0.5 rounded">Today</span>
                  )}
                </div>
                <div className="flex items-center space-x-4 text-xs">
                  <span className="text-green-400">
                    {day.hours.reduce((sum, h) => sum + h.unitsProduced, 0)} units
                  </span>
                  <span className="text-red-400">
                    {day.hours.reduce((sum, h) => sum + h.defectiveUnits, 0)} defects
                  </span>
                  <span className="text-yellow-400">
                    {Math.round(day.hours.reduce((sum, h) => sum + (h.runningMinutes || 0), 0) / 60 * 10) / 10}h running
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Production Modal */}
      {selectedHour && (
        <ProductionModal
          isOpen={true}
          onClose={() => setSelectedHour(null)}
          hour={selectedHour.hour}
          date={selectedHour.date}
          machineId={machineId}
          onAddStoppage={onAddStoppage}
          onUpdateProduction={onUpdateProduction}
          availableOperators={availableOperators}
          availableMolds={availableMolds}
        />
      )}
    </div>
  );
};

export default ProductionTimeline;