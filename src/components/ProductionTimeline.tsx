import { useState, useEffect, useCallback } from 'react';
import { ProductionTimelineDay, ProductionHour, StoppageRecord, User, Mold } from '../types';
import { format, parseISO, isToday } from 'date-fns';
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
import { useAuth } from '../context/AuthContext';

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
  shifts: any[];
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
  availableMolds = [],
  shifts = []
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'stoppage' | 'assignment'>('details');
  const { user: currentUser } = useAuth();
  
  const [stoppageForm, setStoppageForm] = useState({
    reason: '',
    description: '',
    duration: 30,
    sapNotificationNumber: ''
  });
  const [assignmentForm, setAssignmentForm] = useState({
    operatorId: currentUser?.role === 'operator' 
    ? (currentUser._id || currentUser.id || '')
    : (hour.operator?._id || hour.operator?.id || ''),
  moldId: hour.mold?._id || '',
  defectiveUnits: hour.defectiveUnits || 0
  });
  const [applyToShift, setApplyToShift] = useState(false);
  const [shiftInfo, setShiftInfo] = useState<{name: string; hours: number[]} | null>(null);
  
  // Check for pending stoppages
  const pendingStoppage = hour.stoppages.find(s => s.reason === 'unclassified' || (s as any).isPending);

  useEffect(() => {
    if (pendingStoppage) {
      setActiveTab('stoppage');
      setStoppageForm({
        reason: '',
        description: '',
        duration: pendingStoppage.duration || 30,
        sapNotificationNumber: ''
      });
    }
  }, [pendingStoppage]);

  // Detect shift when hour changes
  useEffect(() => {
    if (shifts.length > 0 && hour) {
      // Find shift containing the current hour
      const currentShift = shifts.find(shift => {
        const startHour = parseInt(shift.startTime.split(':')[0]);
        const endHour = parseInt(shift.endTime.split(':')[0]);
        
        if (endHour > startHour) {
          return hour.hour >= startHour && hour.hour < endHour;
        } else {
          return hour.hour >= startHour || hour.hour < endHour;
        }
      });

      if (currentShift) {
        const startHour = parseInt(currentShift.startTime.split(':')[0]);
        const endHour = parseInt(currentShift.endTime.split(':')[0]);
        const shiftHours = [];

        if (startHour <= endHour) {
          for (let h = startHour; h < endHour; h++) {
            shiftHours.push(h);
          }
        } else {
          if (hour.hour >= startHour) {
            for (let h = startHour; h < 24; h++) shiftHours.push(h);
          } else if (hour.hour < endHour) {
            for (let h = 0; h < endHour; h++) shiftHours.push(h);
          }
        }

        setShiftInfo({
          name: currentShift.name,
          hours: shiftHours
        });
        setApplyToShift(false);
      } else {
        setShiftInfo(null);
        setApplyToShift(false);
      }
    }
  }, [shifts, hour]);

  if (!isOpen) return null;

  const handleStoppageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stoppageForm.reason.trim()) return;

    // Validate SAP notification number for breakdown
    if (stoppageForm.reason === 'breakdown') {
      if (!stoppageForm.sapNotificationNumber || stoppageForm.sapNotificationNumber.trim() === '') {
        toast.error('SAP notification number is required for breakdown stoppages');
        return;
      }
      if (!/^\d+$/.test(stoppageForm.sapNotificationNumber.trim())) {
        toast.error('SAP notification number must contain only numbers');
        return;
      }
    }
    try {
      const stoppageData = {
        machineId,
        hour: hour.hour,
        date,
        reason: stoppageForm.reason,
        description: stoppageForm.description.trim(),
        duration: stoppageForm.duration,
        ...(stoppageForm.reason === 'breakdown' && { sapNotificationNumber: stoppageForm.sapNotificationNumber }),
        ...(pendingStoppage && { pendingStoppageId: (pendingStoppage as any)._id })
      };

      await apiService.addStoppageRecord(stoppageData);
      
      setStoppageForm({ reason: '', description: '', duration: 30, sapNotificationNumber: '' });
      toast.success('Stoppage recorded successfully');
      onClose();
    } catch (error) {
      console.error('Failed to add stoppage:', error);
      toast.error('Failed to record stoppage');
    }

    socketService.emit('stoppage-updated', {
      machineId,
      date,
      hour: hour.hour
    });
  };

  const handleAssignmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const operatorId = currentUser?.role === 'operator'
    ? (currentUser._id || currentUser.id || '')
    : assignmentForm.operatorId;

    try {
      await apiService.updateProductionAssignment({
        machineId,
        hour: hour.hour,
        date,
        operatorId: operatorId || null,
        moldId: assignmentForm.moldId || null,
        defectiveUnits: assignmentForm.defectiveUnits,
        applyToShift: shiftInfo ? applyToShift : false
      });
      
      const message = applyToShift && shiftInfo 
        ? `Assignment updated for entire ${shiftInfo.name} shift` 
        : 'Assignment updated successfully';
      
      toast.success(message);
      onClose();
      
    } catch (error) {
      console.error('Failed to update assignment:', error);
      toast.error('Failed to update assignment');
    }

    socketService.emit('production-assignment-updated', {
      machineId,
      date,
      hours: applyToShift && shiftInfo ? shiftInfo.hours : [hour.hour],
      originalHour: hour.hour,
      operatorId: operatorId,
      moldId: assignmentForm.moldId,
      defectiveUnits: assignmentForm.defectiveUnits
    });

  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-green-400';
      case 'stoppage': return 'text-red-400';
      case 'stopped_yet_producing': return 'text-orange-400';
      case 'inactive': return 'text-gray-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Play className="h-4 w-4" />;
      case 'stoppage': return <AlertTriangle className="h-4 w-4" />;
      case 'stopped_yet_producing': return <ZapOff className="h-4 w-4" />;
      case 'inactive': return <Activity className="h-4 w-4" />;
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
                (Unclassified Stoppage - Needs Categorization)
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
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-400">
                      {Math.min(60, hour.runningMinutes || 0)}m
                    </div>
                    <div className="text-xs text-gray-400">Running Time</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-red-400">
                      {Math.min(60, hour.stoppageMinutes || 0)}m
                    </div>
                    <div className="text-xs text-gray-400">Stoppage Time</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-gray-400">
                      {60 - Math.min(60, hour.runningMinutes || 0) - Math.min(60, hour.stoppageMinutes || 0)}m
                    </div>
                    <div className="text-xs text-gray-400">Inactive Time</div>
                  </div>
                </div>
                
                {/* Visual time bar */}
                <div className="mt-3 h-4 bg-gray-600 rounded-full overflow-hidden">
                  <div className="h-full flex">
                    <div 
                      className="bg-green-500" 
                      style={{ width: `${Math.min(100, ((hour.runningMinutes || 0) / 60) * 100)}%` }}
                    ></div>
                    <div 
                      className="bg-red-500" 
                      style={{ width: `${Math.min(100, ((hour.stoppageMinutes || 0) / 60) * 100)}%` }}
                    ></div>
                    <div 
                      className="bg-gray-500" 
                      style={{ width: `${Math.max(0, ((60 - (hour.runningMinutes || 0) - (hour.stoppageMinutes || 0)) / 60) * 100)}%` }}
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
                        stoppage.reason === 'unclassified' || (stoppage as any).isPending 
                          ? 'bg-red-900/30 border border-red-500 animate-pulse' 
                          : 'bg-gray-600'
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <AlertTriangle className={`h-4 w-4 ${
                              stoppage.reason === 'unclassified' || (stoppage as any).isPending 
                                ? 'text-red-400' 
                                : 'text-red-400'
                            }`} />
                            <span className="text-sm font-medium text-white capitalize">
                              {stoppage.reason === 'unclassified' ? 'Pending Categorization' : stoppage.reason.replace('_', ' ')}
                            </span>
                          </div>
                          <span className="text-xs text-gray-400">
                            {stoppage.duration || 0} min
                          </span>
                        </div>
                        {stoppage.description && (
                          <p className="text-xs text-gray-300 ml-6">{stoppage.description}</p>
                        )}
                        {(stoppage.reason === 'unclassified' || (stoppage as any).isPending) && (
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

                {currentUser?.role === 'operator' ? (
                  <div className="text-sm text-white p-2 bg-blue-800 rounded">
                    {currentUser.username} (You)
                  </div>
                ) : (
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
                )}
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

              {/* Shift Assignment Section */}
              {shiftInfo && (
                <div className="mt-4 p-3 bg-gray-750 rounded-lg border border-blue-500/30">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="applyToShift"
                      checked={applyToShift}
                      onChange={(e) => setApplyToShift(e.target.checked)}
                      className="h-4 w-4 text-blue-600 rounded border-gray-600 bg-gray-700 focus:ring-blue-500"
                    />
                    <label htmlFor="applyToShift" className="ml-2 text-sm font-medium text-blue-400">
                      Apply to entire shift ({shiftInfo.name})
                    </label>
                  </div>
                  
                  {applyToShift && (
                    <div className="mt-2 text-xs text-gray-400">
                      <p>This will apply operator and mold to:</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {shiftInfo.hours.map(h => (
                          <span 
                            key={h} 
                            className={`px-2 py-1 rounded ${
                              h === hour.hour 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-gray-700 text-gray-300'
                            }`}
                          >
                            {h.toString().padStart(2, '0')}:00
                          </span>
                        ))}
                      </div>
                      <p className="mt-2 text-blue-300">
                        Note: Defective units will only be updated for the current hour ({hour.hour}:00)
                      </p>
                    </div>
                  )}
                </div>
              )}

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
                    <h4 className="text-red-400 font-medium">Unclassified Stoppage Detected</h4>
                  </div>
                  <p className="text-red-300 text-sm">
                    An unclassified stoppage was automatically detected for {pendingStoppage.duration} minutes. 
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

              {stoppageForm.reason === 'breakdown' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    SAP Notification Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={stoppageForm.sapNotificationNumber}
                    onChange={(e) => setStoppageForm({...stoppageForm, sapNotificationNumber: e.target.value})}
                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter SAP notification number (numbers only)"
                    pattern="[0-9]*"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Required for breakdown stoppages. Numbers only.
                  </p>
                </div>
              )}
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
  const [machineStatus, setMachineStatus] = useState<string>('inactive');
  const [machineColor, setMachineColor] = useState<string>('gray');
  const [shifts, setShifts] = useState<any[]>([]);
  const { user: currentUser } = useAuth();

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    
    return () => clearInterval(timer);
  }, []);

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

    const handleRunningTimeUpdate = (update: any) => {
      if (update.machineId === machineId) {
        setData(prevData => {
          const newData = [...prevData];
          const dayIndex = newData.findIndex(day => day.date === update.date);
          
          if (dayIndex >= 0) {
            const hourIndex = newData[dayIndex].hours.findIndex(h => h.hour === update.hour);
            if (hourIndex >= 0) {
              newData[dayIndex].hours[hourIndex] = {
                ...newData[dayIndex].hours[hourIndex],
                runningMinutes: update.runningMinutes,
                status: 'running'
              };
            }
          }
          return newData;
        });
      }
    };

    const handleMachineStateUpdate = (update: any) => {
      if (update.machineId === machineId) {
        setMachineStatus(update.status);
        setMachineColor(update.color);
      }
    };

    const handleUnclassifiedStoppageDetected = (stoppage: any) => {
      if (stoppage.machineId === machineId) {
        setData(prevData => {
          const newData = [...prevData];
          const dayIndex = newData.findIndex(day => day.date === stoppage.date);
          
          if (dayIndex >= 0) {
            const hourIndex = newData[dayIndex].hours.findIndex(h => h.hour === stoppage.hour);
            if (hourIndex >= 0) {
              // Add unclassified stoppage
              const unclassifiedStoppageRecord: StoppageRecord = {
                _id: stoppage.pendingStoppageId || `unclassified_${Date.now()}`,
                reason: 'unclassified',
                description: 'Automatic stoppage detection - awaiting categorization',
                startTime: stoppage.stoppageStart,
                endTime: null,
                duration: stoppage.duration || 0
              };

              // Check if this unclassified stoppage already exists
              const existingIndex = newData[dayIndex].hours[hourIndex].stoppages.findIndex(
                s => s._id === stoppage.pendingStoppageId || s.reason === 'unclassified'
              );

              if (existingIndex === -1) {
                newData[dayIndex].hours[hourIndex].stoppages.push(unclassifiedStoppageRecord);
              }

              newData[dayIndex].hours[hourIndex].status = 'stoppage';
              newData[dayIndex].hours[hourIndex].stoppageMinutes = 
                (newData[dayIndex].hours[hourIndex].stoppageMinutes || 0) + (stoppage.duration || 0);
            }
          }
          
          return newData;
        });

        // Show toast notification
        toast.warning(`Unclassified stoppage detected - requires categorization`, {
          position: "top-right",
          autoClose: 5000,
          theme: "dark"
        });
      }
    };

    const handleStoppageAdded = (stoppage: any) => {
      if (stoppage.machineId === machineId) {
        // Update the timeline data in real-time
        setData(prevData => {
          const newData = [...prevData];
          const dayIndex = newData.findIndex(day => day.date === stoppage.date);
          
          if (dayIndex >= 0) {
            const hourIndex = newData[dayIndex].hours.findIndex(h => h.hour === stoppage.hour);
            if (hourIndex >= 0) {
              // Remove any unclassified stoppages and add the new classified one
              newData[dayIndex].hours[hourIndex].stoppages = 
                newData[dayIndex].hours[hourIndex].stoppages.filter(s => s.reason !== 'unclassified');
              
              // Add the new stoppage
              newData[dayIndex].hours[hourIndex].stoppages.push({
                _id: `stoppage_${Date.now()}`,
                reason: stoppage.stoppage.reason as any,
                description: stoppage.stoppage.description,
                startTime: new Date().toISOString(),
                endTime: null,
                duration: stoppage.stoppage.duration
              });

              // Update status based on stoppage reason
              if (stoppage.stoppage.reason === 'breakdown') {
                newData[dayIndex].hours[hourIndex].status = 'stoppage';
              } else {
                newData[dayIndex].hours[hourIndex].status = 'stoppage';
              }
            }

            newData[dayIndex].hours[hourIndex].stoppageMinutes = 
            newData[dayIndex].hours[hourIndex].stoppages.reduce(
              (sum, s) => sum + (s.duration || 0), 0
            );

          }

          return newData;
        });
      }
    };

    const handleProductionAssignmentUpdated = (update: any) => {
      if (update.machineId === machineId) {
        setData(prevData => {
          const newData = [...prevData];
          const dayIndex = newData.findIndex(day => day.date === update.date);
          
          if (dayIndex >= 0) {
            // Update all affected hours
            update.hours.forEach((targetHour: number) => {
              let hourIndex = newData[dayIndex].hours.findIndex(h => h.hour === targetHour);

              // Create hour if doesn't exist
              if (hourIndex === -1) {
                const newHour: ProductionHour = {
                  hour: targetHour,
                  unitsProduced: 0,
                  defectiveUnits: 0,
                  status: 'inactive',
                  operator: undefined,
                  mold: undefined,
                  stoppages: [],
                  runningMinutes: 0,
                  stoppageMinutes: 0
                };
                newData[dayIndex].hours.push(newHour);
                hourIndex = newData[dayIndex].hours.length - 1;
              }

              if (hourIndex >= 0) {
                if (update.operatorId) {
                  const operator = availableOperators.find(op => 
                    op._id === update.operatorId || op.id === update.operatorId
                  );
                  if (operator) {
                    newData[dayIndex].hours[hourIndex].operator = operator;
                  }
                }
                
                if (update.moldId) {
                  const mold = availableMolds.find(m => m._id === update.moldId);
                  if (mold) {
                    newData[dayIndex].hours[hourIndex].mold = mold;
                  }
                }
                
                // Only update defective units for the original hour
                if (targetHour === update.originalHour && update.defectiveUnits !== undefined) {
                  newData[dayIndex].hours[hourIndex].defectiveUnits = update.defectiveUnits;
                }
              }
            });
          }
          
          return newData;
        });
      }
    };

    const handleStoppageUpdated = (update: any) => {
      if (update.machineId === machineId) {
        setData(prevData => {
          const newData = [...prevData];
          const dayIndex = newData.findIndex(day => day.date === update.date);
          
          if (dayIndex >= 0) {
            const hourIndex = newData[dayIndex].hours.findIndex(h => h.hour === update.hour);
            if (hourIndex >= 0) {
              const stoppageIndex = newData[dayIndex].hours[hourIndex].stoppages.findIndex(
                s => s._id === update.stoppageId
              );
              
              if (stoppageIndex >= 0) {
                // Update duration AND startTime
                newData[dayIndex].hours[hourIndex].stoppages[stoppageIndex] = {
                  ...newData[dayIndex].hours[hourIndex].stoppages[stoppageIndex],
                  duration: update.duration,
                  startTime: new Date(Date.now() - update.duration * 60000).toISOString()
                };
                
                // Update total stoppage minutes
                newData[dayIndex].hours[hourIndex].stoppageMinutes = 
                  newData[dayIndex].hours[hourIndex].stoppages.reduce(
                    (sum, stoppage) => sum + (stoppage.duration || 0), 0
                  );
              }
            }
          }
          return newData;
        });
      }
    };

    socketService.on('production-update', handleProductionUpdate);
    socketService.on('running-time-update', handleRunningTimeUpdate);
    socketService.on('machine-state-update', handleMachineStateUpdate);
    socketService.on('unclassified-stoppage-detected', handleUnclassifiedStoppageDetected);
    socketService.on('stoppage-added', handleStoppageAdded);
    socketService.on('production-assignment-updated', handleProductionAssignmentUpdated);
    socketService.on('stoppage-updated', handleStoppageUpdated);

    return () => {
      socketService.off('production-update', handleProductionUpdate);
      socketService.off('running-time-update', handleRunningTimeUpdate);
      socketService.off('machine-state-update', handleMachineStateUpdate);
      socketService.off('unclassified-stoppage-detected', handleUnclassifiedStoppageDetected);
      socketService.off('stoppage-added', handleStoppageAdded);
      socketService.off('production-assignment-updated', handleProductionAssignmentUpdated);
      socketService.off('stoppage-updated', handleStoppageUpdated);
      socketService.leaveMachine(machineId);
    };
  }, [machineId, availableOperators, availableMolds]);

  // Fetch operators and molds
  useEffect(() => {
    const fetchData = async () => {
      try {
        let operators: User[] = [];
        if (currentUser?.role === 'admin') {
          operators = await apiService.getUsers();
        } else {
          // Fetch only current operator
          const operator = await apiService.getCurrentOperator();
          operators = [operator];
        }
        
        operators = operators.filter(u => u.role === 'operator');
        const molds = await apiService.getMolds();
        
        setAvailableOperators(operators);
        setAvailableMolds(molds);
      } catch (error) {
        console.error('Failed to fetch operators and molds:', error);
      }
    };
    fetchData();
  }, [currentUser]);


  // Fetch shifts
  useEffect(() => {
  const fetchShifts = async () => {
    try {
      // Only fetch shifts for admin users
      if (currentUser?.role === 'admin') {
        const config = await apiService.getConfig();
        setShifts(config.shifts || []);
      }
    } catch (error) {
      console.error('Failed to fetch shifts:', error);
    }
  };
  
  fetchShifts();
}, [currentUser]);

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
    // Map to the new 4 states
    let status: string = 'inactive';
    if (hour.status === 'running') status = 'running';
    else if (hour.status === 'stoppage') status = 'stoppage';
    else if (hour.status === 'stopped_yet_producing') status = 'stopped_yet_producing';
    
    switch (status) {
      case 'running': return 'bg-green-500';
      case 'stoppage': return 'bg-red-600 animate-pulse';
      case 'stopped_yet_producing': return 'bg-orange-500';
      case 'inactive': 
      default: return 'bg-gray-600';
    }
  };

  const formatTime = (hour: number) => {
    return `${hour.toString().padStart(2, '0')}:00`;
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
          machineColor === 'green'
            ? 'bg-green-900/30 text-green-400' 
            : machineColor === 'red'
            ? 'bg-red-900/30 text-red-400'
            : machineColor === 'orange'
            ? 'bg-orange-900/30 text-orange-400'
            : 'bg-gray-900/30 text-gray-400'
        }`}>
          {machineColor === 'green' ? (
            <Zap className="h-4 w-4 mr-1" />
          ) : (
            <ZapOff className="h-4 w-4 mr-1" />
          )}
          <span className="text-sm">
            {machineStatus.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </span>
        </div>

        {/* Legend */}
        <div className="flex items-center space-x-3 text-xs">
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-green-500 rounded"></div>
            <span className="text-gray-300">Running</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-red-600 rounded animate-pulse"></div>
            <span className="text-gray-300">Stoppage</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-orange-500 rounded"></div>
            <span className="text-gray-300">Stopped Yet Producing</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-gray-500 rounded"></div>
            <span className="text-gray-300">Inactive</span>
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
            const hasUnclassifiedStoppage = hour.stoppages.some(s => s.reason === 'unclassified');
            
            return (
              <div
                key={hour.hour}
                className="flex-1 relative group cursor-pointer min-w-0"
                onClick={() => setSelectedHour({ hour, date: currentDay.date })}
              >
                {/* Main production block with time-based visualization */}
                <div className={`h-12 rounded transition-all duration-200 group-hover:scale-105 border relative overflow-hidden ${
                  hasUnclassifiedStoppage ? 'border-red-500 border-2' : 'border-gray-600'
                }`}>
                  {/* Time-based visualization with proper inactive time */}
                  {(() => {
                    const runningMinutes = hour.runningMinutes || 0;
                    const stoppageMinutes = hour.stoppageMinutes || 0;
                    const inactiveMinutes = 60 - runningMinutes - stoppageMinutes;
                    
                    return (
                      <>
                        {/* Running time visualization */}
                        <div
                          className="bg-green-500" 
                          style={{ 
                            width: `${((runningMinutes || 0) / 60) * 100}%`,
                            height: '100%',
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            opacity: 0.8
                          }}
                        />
                        
                        {/* Stoppage time visualization */}
                        <div
                          className={`${hasUnclassifiedStoppage ? 'bg-red-600 animate-pulse' : 'bg-red-500'}`}
                          style={{ 
                            width: `${((stoppageMinutes || 0) / 60) * 100}%`,
                            height: '100%',
                            position: 'absolute',
                            left: `${((runningMinutes || 0) / 60) * 100}%`,
                            top: 0,
                            opacity: hasUnclassifiedStoppage ? 1 : 0.8
                          }}
                        />
                        
                        {/* Inactive time (gray) */}
                        <div
                          className="bg-gray-500" 
                          style={{ 
                            width: `${((inactiveMinutes || 0) / 60) * 100}%`,
                            height: '100%',
                            position: 'absolute',
                            left: `${((runningMinutes + stoppageMinutes) / 60) * 100}%`,
                            top: 0,
                            opacity: 0.4
                          }}
                        />
                      </>
                    );
                  })()}
                  
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
                        hasUnclassifiedStoppage ? 'bg-red-600 animate-pulse' : 'bg-red-600'
                      }`} title={`${hour.stoppages.length} stoppages`} />
                    )}
                  </div>

                  {/* Unclassified stoppage overlay */}
                  {hasUnclassifiedStoppage && (
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
                    <div>Inactive: <span className="text-gray-400">{60 - (hour.runningMinutes || 0) - (hour.stoppageMinutes || 0)}m</span></div>
                    {hour.operator && (
                      <div>Op: <span className="text-blue-400">{hour.operator.username}</span></div>
                    )}
                    {hour.mold && (
                      <div>Mold: <span className="text-purple-400">{hour.mold.name}</span></div>
                    )}
                    <div>Status: <span className="capitalize">{hour.status.replace('_', ' ')}</span></div>
                    {hour.stoppages.length > 0 && (
                      <div className="mt-1">
                        {hour.stoppages.map((stoppage, idx) => (
                          <div key={idx} className="text-red-300">
                            {stoppage.reason === 'unclassified' ? 'Unclassified' : stoppage.reason}: 
                            {stoppage.duration} min
                          </div>
                        ))}
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
          key={`${selectedHour.date}-${selectedHour.hour.hour}`}
          isOpen={true}
          onClose={() => setSelectedHour(null)}
          hour={selectedHour.hour}
          date={selectedHour.date}
          machineId={machineId}
          onAddStoppage={onAddStoppage}
          onUpdateProduction={onUpdateProduction}
          availableOperators={availableOperators}
          availableMolds={availableMolds}
          shifts={shifts}
        />
      )}
    </div>
  );
};

export default ProductionTimeline;