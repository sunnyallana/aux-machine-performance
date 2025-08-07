import React, { useState, useEffect, useContext } from 'react';
import { useAuth } from '../context/AuthContext';
import { ProductionTimelineDay, ProductionHour, User, Mold } from '../types';
import apiService from '../services/api';
import { format, parseISO, isToday, isBefore, startOfDay } from 'date-fns';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import {
  Plus,
  User as UserIcon,
  Package,
  AlertTriangle,
  Clock,
  Edit,
  Save,
  X,
  Calendar,
  Search
} from 'lucide-react';
import { ThemeContext } from '../App';

interface ProductionTimelineProps {
  data: ProductionTimelineDay[];
  machineId: string;
  selectedPeriod?: string;
  customStartDate?: Date | null;
  customEndDate?: Date | null;
  onAddStoppage: (stoppage: any) => void;
  onUpdateProduction: (machineId: string, hour: number, date: string, data: any) => void;
}

interface StoppageForm {
  reason: 'planned' | 'mold_change' | 'breakdown' | 'maintenance' | 'material_shortage' | 'other';
  description: string;
  duration: number;
  sapNotificationNumber?: string;
}

interface ProductionForm {
  operatorId: string;
  moldId: string;
  defectiveUnits: number;
  applyToShift: boolean;
}

const ProductionTimeline: React.FC<ProductionTimelineProps> = ({ 
  data, 
  machineId, 
  selectedPeriod,
  customStartDate,
  customEndDate,
  onAddStoppage, 
  onUpdateProduction 
}) => {
  const { user, isAdmin } = useAuth();
  const { isDarkMode } = useContext(ThemeContext);
  const [users, setUsers] = useState<User[]>([]);
  const [molds, setMolds] = useState<Mold[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [selectedHour, setSelectedHour] = useState<{day: string, hour: number} | null>(null);
  const [showStoppageForm, setShowStoppageForm] = useState(false);
  const [showProductionForm, setShowProductionForm] = useState(false);
  const [stoppageForm, setStoppageForm] = useState<StoppageForm>({
    reason: 'other',
    description: '',
    duration: 0,
    sapNotificationNumber: ''
  });
  const [productionForm, setProductionForm] = useState<ProductionForm>({
    operatorId: '',
    moldId: '',
    defectiveUnits: 0,
    applyToShift: false
  });
  const [pendingStoppageId, setPendingStoppageId] = useState<string | null>(null);

  // Custom date range states
  const [showCustomDateRange, setShowCustomDateRange] = useState(false);
  const [customTimelineStartDate, setCustomTimelineStartDate] = useState<Date | null>(null);
  const [customTimelineEndDate, setCustomTimelineEndDate] = useState<Date | null>(null);
  const [applyingCustomRange, setApplyingCustomRange] = useState(false);
  const [timelineData, setTimelineData] = useState<ProductionTimelineDay[]>(data);

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

  useEffect(() => {
    setTimelineData(data);
  }, [data]);

  useEffect(() => {
    fetchUsers();
    fetchMolds();
    fetchShifts();
  }, []);

  const fetchUsers = async () => {
    try {
      const usersData = await apiService.getUsers();
      setUsers(usersData);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const fetchMolds = async () => {
    try {
      const moldsData = await apiService.getMolds();
      setMolds(moldsData);
    } catch (error) {
      console.error('Failed to fetch molds:', error);
    }
  };

  const fetchShifts = async () => {
    try {
      const shiftsData = await apiService.getShifts();
      setShifts(shiftsData);
    } catch (error) {
      console.error('Failed to fetch shifts:', error);
    }
  };

  const handleCustomTimelineRangeApply = async () => {
    if (!customTimelineStartDate || !customTimelineEndDate) {
      toast.error('Please select both start and end dates');
      return;
    }

    if (customTimelineStartDate > customTimelineEndDate) {
      toast.error('Start date cannot be after end date');
      return;
    }

    try {
      setApplyingCustomRange(true);
      
      // Format dates for API
      const startDateStr = format(customTimelineStartDate, 'yyyy-MM-dd');
      const endDateStr = format(customTimelineEndDate, 'yyyy-MM-dd');
      
      // Fetch custom range timeline data
      const timelineData = await apiService.getProductionTimelineCustom(machineId, startDateStr, endDateStr);
      setTimelineData(timelineData);
      
      toast.success(`Timeline loaded for ${format(customTimelineStartDate, 'MMM dd')} - ${format(customTimelineEndDate, 'MMM dd, yyyy')}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch custom timeline data';
      toast.error(message);
    } finally {
      setApplyingCustomRange(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return isDarkMode ? 'bg-green-500' : 'bg-green-500';
      case 'stoppage': return isDarkMode ? 'bg-red-500' : 'bg-red-500';
      case 'stopped_yet_producing': return isDarkMode ? 'bg-orange-500' : 'bg-orange-500';
      case 'inactive': return isDarkMode ? 'bg-gray-600' : 'bg-gray-400';
      default: return isDarkMode ? 'bg-gray-600' : 'bg-gray-400';
    }
  };

  const getStoppageReasonColor = (reason: string) => {
    switch (reason) {
      case 'breakdown': return isDarkMode ? 'bg-red-600' : 'bg-red-500';
      case 'maintenance': return isDarkMode ? 'bg-blue-600' : 'bg-blue-500';
      case 'mold_change': return isDarkMode ? 'bg-purple-600' : 'bg-purple-500';
      case 'material_shortage': return isDarkMode ? 'bg-orange-600' : 'bg-orange-500';
      case 'planned': return isDarkMode ? 'bg-green-600' : 'bg-green-500';
      case 'unclassified': return isDarkMode ? 'bg-yellow-600 animate-pulse' : 'bg-yellow-500 animate-pulse';
      default: return isDarkMode ? 'bg-gray-600' : 'bg-gray-500';
    }
  };

  const handleHourClick = (day: string, hour: number, hourData: ProductionHour) => {
    const selectedDate = parseISO(day + 'T00:00:00');
    const currentDate = new Date();
    const hourDate = new Date(selectedDate);
    hourDate.setHours(hour);

    // Check if this hour is in the future
    if (hourDate > currentDate) {
      toast.warning('Cannot modify future production data');
      return;
    }

    setSelectedHour({ day, hour });
    
    // Check for pending stoppages
    const pendingStoppage = hourData.stoppages?.find(s => s.reason === 'unclassified');
    if (pendingStoppage) {
      setPendingStoppageId(pendingStoppage._id);
      setStoppageForm({
        reason: 'other',
        description: '',
        duration: pendingStoppage.duration || 0,
        sapNotificationNumber: ''
      });
      setShowStoppageForm(true);
    } else {
      // Pre-fill production form with existing data
      setProductionForm({
        operatorId: hourData.operator?._id || hourData.operator?.id || '',
        moldId: hourData.mold?._id || '',
        defectiveUnits: hourData.defectiveUnits || 0,
        applyToShift: false
      });
      setShowProductionForm(true);
    }
  };

  const handleStoppageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHour) return;

    try {
      await onAddStoppage({
        ...stoppageForm,
        hour: selectedHour.hour,
        date: selectedHour.day,
        pendingStoppageId
      });
      
      setShowStoppageForm(false);
      setStoppageForm({
        reason: 'other',
        description: '',
        duration: 0,
        sapNotificationNumber: ''
      });
      setPendingStoppageId(null);
      setSelectedHour(null);
    } catch (error) {
      console.error('Failed to submit stoppage:', error);
    }
  };

  const handleProductionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHour) return;

    try {
      await onUpdateProduction(
        machineId,
        selectedHour.hour,
        selectedHour.day,
        {
          operatorId: productionForm.operatorId || null,
          moldId: productionForm.moldId || null,
          defectiveUnits: productionForm.defectiveUnits,
          applyToShift: productionForm.applyToShift
        }
      );
      
      setShowProductionForm(false);
      setProductionForm({
        operatorId: '',
        moldId: '',
        defectiveUnits: 0,
        applyToShift: false
      });
      setSelectedHour(null);
    } catch (error) {
      console.error('Failed to update production:', error);
    }
  };

  const getShiftForHour = (hour: number) => {
    return shifts.find(shift => {
      const startHour = parseInt(shift.startTime.split(':')[0]);
      const endHour = parseInt(shift.endTime.split(':')[0]);
      
      if (startHour <= endHour) {
        return hour >= startHour && hour < endHour;
      } else {
        return hour >= startHour || hour < endHour;
      }
    });
  };

  const formatStoppageReason = (reason: string) => {
    return reason.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <div className="space-y-6">
      {/* Timeline Date Range Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
        <span className={`text-sm font-medium ${textSecondaryClass}`}>Timeline View:</span>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setShowCustomDateRange(false);
              setTimelineData(data);
            }}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              !showCustomDateRange
                ? 'bg-blue-600 text-white'
                : `${buttonSecondaryClass}`
            }`}
          >
            Default (7 Days)
          </button>
          <button
            onClick={() => setShowCustomDateRange(!showCustomDateRange)}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              showCustomDateRange
                ? 'bg-blue-600 text-white'
                : `${buttonSecondaryClass}`
            }`}
          >
            <Calendar className="h-4 w-4 mr-1 inline" />
            Custom Range
          </button>
        </div>
        
        {/* Custom Date Range Selector for Timeline */}
        {showCustomDateRange && (
          <div className={`flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 rounded-lg border ${cardBgClass} ${cardBorderClass}`}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex flex-col">
                <label className={`text-xs font-medium mb-1 ${textSecondaryClass}`}>Start Date</label>
                <DatePicker
                  selected={customTimelineStartDate}
                  onChange={(date) => setCustomTimelineStartDate(date)}
                  selectsStart
                  startDate={customTimelineStartDate}
                  endDate={customTimelineEndDate}
                  maxDate={new Date()}
                  dateFormat="MMM dd, yyyy"
                  className={`px-3 py-2 text-sm rounded-md border ${inputBgClass} ${inputBorderClass} ${textClass} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholderText="Select start date"
                />
              </div>
              
              <div className="flex flex-col">
                <label className={`text-xs font-medium mb-1 ${textSecondaryClass}`}>End Date</label>
                <DatePicker
                  selected={customTimelineEndDate}
                  onChange={(date) => setCustomTimelineEndDate(date)}
                  selectsEnd
                  startDate={customTimelineStartDate}
                  endDate={customTimelineEndDate}
                  minDate={customTimelineStartDate}
                  maxDate={new Date()}
                  dateFormat="MMM dd, yyyy"
                  className={`px-3 py-2 text-sm rounded-md border ${inputBgClass} ${inputBorderClass} ${textClass} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholderText="Select end date"
                />
              </div>
            </div>
            
            <div className="flex gap-2 mt-2 sm:mt-0">
              <button
                onClick={handleCustomTimelineRangeApply}
                disabled={applyingCustomRange || !customTimelineStartDate || !customTimelineEndDate}
                className={`flex items-center space-x-2 px-4 py-2 ${buttonPrimaryClass} text-white rounded-md disabled:opacity-50 transition-colors text-sm`}
              >
                {applyingCustomRange ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <Search className="h-4 w-4" />
                )}
                <span>{applyingCustomRange ? 'Loading...' : 'Apply'}</span>
              </button>
              
              <button
                onClick={() => {
                  setShowCustomDateRange(false);
                  setCustomTimelineStartDate(null);
                  setCustomTimelineEndDate(null);
                  setTimelineData(data);
                }}
                className={`px-3 py-2 border ${buttonSecondaryClass} rounded-md text-sm`}
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Timeline Grid */}
      <div className="space-y-4">
        {timelineData.map((day) => (
          <div key={day.date} className={`rounded-lg border ${cardBgClass} ${cardBorderClass}`}>
            <div className={`p-4 border-b ${cardBorderClass}`}>
              <div className="flex items-center justify-between">
                <h3 className={`font-semibold ${textClass}`}>
                  {format(parseISO(day.date), 'EEEE, MMMM dd, yyyy')}
                  {isToday(parseISO(day.date)) && (
                    <span className={`ml-2 text-xs px-2 py-1 rounded ${
                      isDarkMode ? 'bg-blue-900/50 text-blue-400' : 'bg-blue-100 text-blue-800'
                    }`}>
                      Today
                    </span>
                  )}
                </h3>
                <div className="flex items-center space-x-4 text-sm">
                  <span className={textSecondaryClass}>
                    Total Units: <span className={`font-medium ${textClass}`}>
                      {day.hours.reduce((sum, h) => sum + h.unitsProduced, 0)}
                    </span>
                  </span>
                  <span className={textSecondaryClass}>
                    Defects: <span className={`font-medium ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                      {day.hours.reduce((sum, h) => sum + h.defectiveUnits, 0)}
                    </span>
                  </span>
                </div>
              </div>
            </div>
            
            <div className="p-4">
              <div className="grid grid-cols-12 gap-1">
                {day.hours.map((hour) => {
                  const hasUnclassifiedStoppage = hour.stoppages?.some(s => s.reason === 'unclassified');
                  const hasBreakdown = hour.stoppages?.some(s => s.reason === 'breakdown');
                  const currentDate = new Date();
                  const hourDate = new Date(parseISO(day.date));
                  hourDate.setHours(hour.hour);
                  const isFutureHour = hourDate > currentDate;
                  
                  return (
                    <div
                      key={hour.hour}
                      onClick={() => !isFutureHour && handleHourClick(day.date, hour.hour, hour)}
                      className={`relative aspect-square rounded-lg border-2 transition-all duration-200 ${
                        isFutureHour 
                          ? 'opacity-30 cursor-not-allowed' 
                          : 'cursor-pointer hover:scale-105 hover:shadow-lg'
                      } ${
                        hasUnclassifiedStoppage 
                          ? 'border-yellow-400 animate-pulse' 
                          : hasBreakdown 
                            ? 'border-red-400' 
                            : isDarkMode ? 'border-gray-600' : 'border-gray-300'
                      }`}
                      style={{
                        backgroundColor: getStatusColor(hour.status),
                        minHeight: '60px'
                      }}
                      title={`${hour.hour}:00 - ${hour.hour + 1}:00 | Status: ${hour.status} | Units: ${hour.unitsProduced} | Defects: ${hour.defectiveUnits}`}
                    >
                      {/* Hour label */}
                      <div className="absolute top-1 left-1 text-xs font-bold text-white bg-black bg-opacity-50 px-1 rounded">
                        {hour.hour.toString().padStart(2, '0')}
                      </div>
                      
                      {/* Units produced */}
                      {hour.unitsProduced > 0 && (
                        <div className="absolute top-1 right-1 text-xs font-bold text-white bg-black bg-opacity-50 px-1 rounded">
                          {hour.unitsProduced}
                        </div>
                      )}
                      
                      {/* Defective units indicator */}
                      {hour.defectiveUnits > 0 && (
                        <div className="absolute bottom-1 right-1 text-xs font-bold text-white bg-red-600 px-1 rounded">
                          {hour.defectiveUnits}
                        </div>
                      )}
                      
                      {/* Operator indicator */}
                      {hour.operator && (
                        <div className="absolute bottom-1 left-1">
                          <UserIcon className="h-3 w-3 text-white" />
                        </div>
                      )}
                      
                      {/* Mold indicator */}
                      {hour.mold && (
                        <div className="absolute bottom-1 left-5">
                          <Package className="h-3 w-3 text-white" />
                        </div>
                      )}
                      
                      {/* Stoppage indicators */}
                      {hour.stoppages && hour.stoppages.length > 0 && (
                        <div className="absolute top-1 left-6 flex space-x-1">
                          {hour.stoppages.slice(0, 3).map((stoppage, idx) => (
                            <div
                              key={idx}
                              className={`w-2 h-2 rounded-full ${getStoppageReasonColor(stoppage.reason)}`}
                              title={`${formatStoppageReason(stoppage.reason)}: ${stoppage.description || 'No description'} (${stoppage.duration || 0}min)`}
                            />
                          ))}
                          {hour.stoppages.length > 3 && (
                            <div className="text-xs text-white font-bold">+{hour.stoppages.length - 3}</div>
                          )}
                        </div>
                      )}
                      
                      {/* Unclassified stoppage warning */}
                      {hasUnclassifiedStoppage && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <AlertTriangle className="h-6 w-6 text-yellow-400 animate-bounce" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              
              {/* Legend */}
              <div className="mt-4 flex flex-wrap gap-4 text-xs">
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-3 bg-green-500 rounded"></div>
                  <span className={textSecondaryClass}>Running</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-3 bg-red-500 rounded"></div>
                  <span className={textSecondaryClass}>Stoppage</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-3 bg-orange-500 rounded"></div>
                  <span className={textSecondaryClass}>Stopped Yet Producing</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-3 bg-gray-500 rounded"></div>
                  <span className={textSecondaryClass}>Inactive</span>
                </div>
                <div className="flex items-center space-x-1">
                  <UserIcon className="h-3 w-3" />
                  <span className={textSecondaryClass}>Operator Assigned</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Package className="h-3 w-3" />
                  <span className={textSecondaryClass}>Mold Assigned</span>
                </div>
                <div className="flex items-center space-x-1">
                  <AlertTriangle className="h-3 w-3 text-yellow-400" />
                  <span className={textSecondaryClass}>Unclassified Stoppage</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Stoppage Form Modal */}
      {showStoppageForm && selectedHour && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className={`rounded-lg border w-full max-w-md ${cardBgClass} ${cardBorderClass}`}>
            <div className={`p-6 border-b ${cardBorderClass}`}>
              <div className="flex items-center justify-between">
                <h3 className={`text-lg font-semibold ${textClass}`}>
                  {pendingStoppageId ? 'Classify Stoppage' : 'Add Stoppage'}
                </h3>
                <button 
                  onClick={() => {
                    setShowStoppageForm(false);
                    setPendingStoppageId(null);
                    setSelectedHour(null);
                  }}
                  className={textSecondaryClass}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className={`text-sm mt-2 ${textSecondaryClass}`}>
                {format(parseISO(selectedHour.day), 'MMMM dd, yyyy')} at {selectedHour.hour}:00
              </p>
            </div>
            
            <form onSubmit={handleStoppageSubmit} className="p-6 space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${textSecondaryClass}`}>
                  Stoppage Reason *
                </label>
                <select
                  required
                  value={stoppageForm.reason}
                  onChange={(e) => setStoppageForm({
                    ...stoppageForm, 
                    reason: e.target.value as any,
                    sapNotificationNumber: e.target.value === 'breakdown' ? stoppageForm.sapNotificationNumber : ''
                  })}
                  className={`w-full px-3 py-2 ${inputBgClass} border ${inputBorderClass} rounded-md ${textClass} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  <option value="planned">Planned Stoppage</option>
                  <option value="mold_change">Mold Change</option>
                  <option value="breakdown">Breakdown</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="material_shortage">Material Shortage</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {stoppageForm.reason === 'breakdown' && (
                <div>
                  <label className={`block text-sm font-medium mb-2 ${textSecondaryClass}`}>
                    SAP Notification Number *
                  </label>
                  <input
                    type="text"
                    required
                    pattern="[0-9]+"
                    title="Please enter only numbers"
                    value={stoppageForm.sapNotificationNumber || ''}
                    onChange={(e) => setStoppageForm({
                      ...stoppageForm,
                      sapNotificationNumber: e.target.value.replace(/\D/g, '') // Only allow numbers
                    })}
                    className={`w-full px-3 py-2 ${inputBgClass} border ${inputBorderClass} rounded-md ${textClass} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    placeholder="Enter SAP notification number (numbers only)"
                  />
                </div>
              )}
              
              <div>
                <label className={`block text-sm font-medium mb-2 ${textSecondaryClass}`}>
                  Description
                </label>
                <textarea
                  value={stoppageForm.description}
                  onChange={(e) => setStoppageForm({...stoppageForm, description: e.target.value})}
                  rows={3}
                  className={`w-full px-3 py-2 ${inputBgClass} border ${inputBorderClass} rounded-md ${textClass} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="Describe the stoppage reason..."
                />
              </div>
              
              {!pendingStoppageId && (
                <div>
                  <label className={`block text-sm font-medium mb-2 ${textSecondaryClass}`}>
                    Duration (minutes) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="60"
                    value={stoppageForm.duration}
                    onChange={(e) => setStoppageForm({...stoppageForm, duration: parseInt(e.target.value) || 0})}
                    className={`w-full px-3 py-2 ${inputBgClass} border ${inputBorderClass} rounded-md ${textClass} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  />
                </div>
              )}
              
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowStoppageForm(false);
                    setPendingStoppageId(null);
                    setSelectedHour(null);
                  }}
                  className={`px-4 py-2 border ${buttonSecondaryClass} rounded-md`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-4 py-2 ${buttonPrimaryClass} text-white rounded-md`}
                >
                  {pendingStoppageId ? 'Classify Stoppage' : 'Add Stoppage'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Production Assignment Form Modal */}
      {showProductionForm && selectedHour && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className={`rounded-lg border w-full max-w-md ${cardBgClass} ${cardBorderClass}`}>
            <div className={`p-6 border-b ${cardBorderClass}`}>
              <div className="flex items-center justify-between">
                <h3 className={`text-lg font-semibold ${textClass}`}>Update Production Data</h3>
                <button 
                  onClick={() => {
                    setShowProductionForm(false);
                    setSelectedHour(null);
                  }}
                  className={textSecondaryClass}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className={`text-sm mt-2 ${textSecondaryClass}`}>
                {format(parseISO(selectedHour.day), 'MMMM dd, yyyy')} at {selectedHour.hour}:00
              </p>
            </div>
            
            <form onSubmit={handleProductionSubmit} className="p-6 space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${textSecondaryClass}`}>
                  Operator
                </label>
                <select
                  value={productionForm.operatorId}
                  onChange={(e) => setProductionForm({...productionForm, operatorId: e.target.value})}
                  className={`w-full px-3 py-2 ${inputBgClass} border ${inputBorderClass} rounded-md ${textClass} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  <option value="">No operator assigned</option>
                  {users.filter(u => u.role === 'operator').map((operator) => (
                    <option key={operator._id || operator.id} value={operator._id || operator.id}>
                      {operator.username}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className={`block text-sm font-medium mb-2 ${textSecondaryClass}`}>
                  Mold
                </label>
                <select
                  value={productionForm.moldId}
                  onChange={(e) => setProductionForm({...productionForm, moldId: e.target.value})}
                  className={`w-full px-3 py-2 ${inputBgClass} border ${inputBorderClass} rounded-md ${textClass} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  <option value="">No mold assigned</option>
                  {molds.map((mold) => (
                    <option key={mold._id} value={mold._id}>
                      {mold.name} ({mold.productionCapacityPerHour} units/hr)
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className={`block text-sm font-medium mb-2 ${textSecondaryClass}`}>
                  Defective Units
                </label>
                <input
                  type="number"
                  min="0"
                  value={productionForm.defectiveUnits}
                  onChange={(e) => setProductionForm({...productionForm, defectiveUnits: parseInt(e.target.value) || 0})}
                  className={`w-full px-3 py-2 ${inputBgClass} border ${inputBorderClass} rounded-md ${textClass} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
              </div>

              {isAdmin && (
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="applyToShift"
                    checked={productionForm.applyToShift}
                    onChange={(e) => setProductionForm({...productionForm, applyToShift: e.target.checked})}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="applyToShift" className={`ml-2 text-sm ${textSecondaryClass}`}>
                    Apply to entire shift
                    {(() => {
                      const shift = getShiftForHour(selectedHour.hour);
                      return shift ? ` (${shift.name}: ${shift.startTime} - ${shift.endTime})` : '';
                    })()}
                  </label>
                </div>
              )}
              
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowProductionForm(false);
                    setSelectedHour(null);
                  }}
                  className={`px-4 py-2 border ${buttonSecondaryClass} rounded-md`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-4 py-2 ${buttonPrimaryClass} text-white rounded-md`}
                >
                  Update Production
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductionTimeline;