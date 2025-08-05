import React, { useState, useEffect, useContext } from 'react';
import { useAuth } from '../context/AuthContext';
import { ProductionTimelineDay, ProductionHour, User, Mold } from '../types';
import apiService from '../services/api';
import { ThemeContext } from '../App';
import {
  Plus,
  User as UserIcon,
  Package,
  AlertTriangle,
  Clock,
  Play,
  Square,
  Pause,
  Activity,
  X,
  Save,
  Calendar,
  Filter
} from 'lucide-react';
import { format, isToday, parseISO } from 'date-fns';

interface ProductionTimelineProps {
  data: ProductionTimelineDay[];
  machineId: string;
  dateRange: { startDate: Date; endDate: Date };
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
  dateRange,
  onAddStoppage,
  onUpdateProduction
}) => {
  const { user, isAdmin } = useAuth();
  const { isDarkMode } = useContext(ThemeContext);
  const [users, setUsers] = useState<User[]>([]);
  const [molds, setMolds] = useState<Mold[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [selectedHour, setSelectedHour] = useState<{
    date: string;
    hour: number;
    data: ProductionHour;
    pendingStoppageId?: string;
  } | null>(null);
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
  const [filterDate, setFilterDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

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
    fetchFormData();
  }, []);

  const fetchFormData = async () => {
    try {
      const [usersData, moldsData, shiftsData] = await Promise.all([
        apiService.getUsers(),
        apiService.getMolds(),
        apiService.getShifts()
      ]);
      setUsers(usersData);
      setMolds(moldsData);
      setShifts(shiftsData);
    } catch (error) {
      console.error('Failed to fetch form data:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return isDarkMode ? 'bg-green-500' : 'bg-green-500';
      case 'stoppage': return isDarkMode ? 'bg-red-500' : 'bg-red-500';
      case 'stopped_yet_producing': return isDarkMode ? 'bg-orange-500' : 'bg-orange-500';
      case 'inactive': return isDarkMode ? 'bg-gray-500' : 'bg-gray-400';
      default: return isDarkMode ? 'bg-gray-600' : 'bg-gray-300';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Play className="h-3 w-3 text-white" />;
      case 'stoppage': return <Square className="h-3 w-3 text-white" />;
      case 'stopped_yet_producing': return <Pause className="h-3 w-3 text-white" />;
      case 'inactive': return <Activity className="h-3 w-3 text-white" />;
      default: return <Activity className="h-3 w-3 text-white" />;
    }
  };

  const handleHourClick = (date: string, hour: number, hourData: ProductionHour) => {
    // Find pending stoppage if exists
    const pendingStoppage = hourData.stoppages?.find(s => s.reason === 'unclassified');
    
    setSelectedHour({
      date,
      hour,
      data: hourData,
      pendingStoppageId: pendingStoppage?._id
    });
    
    // Pre-fill production form with existing data
    setProductionForm({
      operatorId: hourData.operator?._id || hourData.operator?.id || '',
      moldId: hourData.mold?._id || hourData.mold?.id || '',
      defectiveUnits: hourData.defectiveUnits || 0,
      applyToShift: false
    });
    
    // If there's a pending stoppage, show stoppage form
    if (pendingStoppage) {
      setShowStoppageForm(true);
      setStoppageForm({
        reason: 'other',
        description: '',
        duration: pendingStoppage.duration || 0,
        sapNotificationNumber: ''
      });
    } else {
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
        date: selectedHour.date,
        pendingStoppageId: selectedHour.pendingStoppageId
      });
      
      setShowStoppageForm(false);
      setSelectedHour(null);
      setStoppageForm({
        reason: 'other',
        description: '',
        duration: 0,
        sapNotificationNumber: ''
      });
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
        selectedHour.date,
        productionForm
      );
      
      setShowProductionForm(false);
      setSelectedHour(null);
      setProductionForm({
        operatorId: '',
        moldId: '',
        defectiveUnits: 0,
        applyToShift: false
      });
    } catch (error) {
      console.error('Failed to update production:', error);
    }
  };

  const closeModals = () => {
    setShowStoppageForm(false);
    setShowProductionForm(false);
    setSelectedHour(null);
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

  // Filter data based on selected date
  const filteredData = filterDate 
    ? data.filter(day => day.date === filterDate)
    : data;

  // Show date range info
  const dateRangeText = `${format(dateRange.startDate, 'MMM dd, yyyy')} - ${format(dateRange.endDate, 'MMM dd, yyyy')}`;

  return (
    <div className="space-y-4">
      {/* Timeline Header with Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <Calendar className={`h-5 w-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`} />
          <div>
            <h3 className={`text-lg font-semibold ${textClass}`}>Production Timeline</h3>
            <p className={`text-sm ${textSecondaryClass}`}>
              Showing data for: {dateRangeText}
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center space-x-2 px-3 py-2 border rounded-md transition-colors ${
              showFilters 
                ? 'bg-blue-600 border-blue-600 text-white' 
                : `${buttonSecondaryClass}`
            }`}
          >
            <Filter className="h-4 w-4" />
            <span>Filter</span>
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className={`rounded-lg border p-4 ${cardBgClass} ${cardBorderClass}`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-medium mb-1 ${textSecondaryClass}`}>
                Filter by Date
              </label>
              <select
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className={`w-full px-3 py-2 ${inputBgClass} border ${inputBorderClass} rounded-md ${textClass} focus:outline-none focus:ring-2 focus:ring-blue-500`}
              >
                <option value="">All Dates</option>
                {data.map(day => (
                  <option key={day.date} value={day.date}>
                    {format(parseISO(day.date), 'MMM dd, yyyy')} {isToday(parseISO(day.date)) ? '(Today)' : ''}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="flex items-end">
              <button
                onClick={() => setFilterDate('')}
                className={`px-4 py-2 ${textSecondaryClass} hover:${textClass} text-sm`}
              >
                Clear Filter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className={`rounded-lg border p-4 ${cardBgClass} ${cardBorderClass}`}>
        <h4 className={`text-sm font-medium mb-3 ${textClass}`}>Status Legend</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-green-500 rounded flex items-center justify-center">
              <Play className="h-2 w-2 text-white" />
            </div>
            <span className={`text-sm ${textSecondaryClass}`}>Running</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-red-500 rounded flex items-center justify-center">
              <Square className="h-2 w-2 text-white" />
            </div>
            <span className={`text-sm ${textSecondaryClass}`}>Stoppage</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-orange-500 rounded flex items-center justify-center">
              <Pause className="h-2 w-2 text-white" />
            </div>
            <span className={`text-sm ${textSecondaryClass}`}>Stopped Yet Producing</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-gray-500 rounded flex items-center justify-center">
              <Activity className="h-2 w-2 text-white" />
            </div>
            <span className={`text-sm ${textSecondaryClass}`}>Inactive</span>
          </div>
        </div>
      </div>

      {/* Timeline Grid */}
      <div className="space-y-4">
        {filteredData.length > 0 ? (
          filteredData.map((day) => (
            <div key={day.date} className={`rounded-lg border ${cardBgClass} ${cardBorderClass}`}>
              <div className={`p-4 border-b ${cardBorderClass}`}>
                <div className="flex items-center justify-between">
                  <h3 className={`text-lg font-semibold ${textClass}`}>
                    {format(parseISO(day.date), 'EEEE, MMMM dd, yyyy')}
                    {isToday(parseISO(day.date)) && (
                      <span className={`ml-2 text-sm px-2 py-1 rounded ${
                        isDarkMode ? 'bg-blue-900/50 text-blue-400' : 'bg-blue-100 text-blue-800'
                      }`}>
                        Today
                      </span>
                    )}
                  </h3>
                  <div className={`text-sm ${textSecondaryClass}`}>
                    Total Units: {day.hours.reduce((sum, h) => sum + h.unitsProduced, 0)}
                  </div>
                </div>
              </div>
              
              <div className="p-4">
                <div className="grid grid-cols-12 gap-1">
                  {day.hours.map((hour) => {
                    const shift = getShiftForHour(hour.hour);
                    const hasUnclassifiedStoppage = hour.stoppages?.some(s => s.reason === 'unclassified');
                    
                    return (
                      <div
                        key={hour.hour}
                        onClick={() => handleHourClick(day.date, hour.hour, hour)}
                        className={`relative p-2 rounded-md cursor-pointer transition-all duration-200 border-2 ${
                          hasUnclassifiedStoppage 
                            ? 'border-red-400 animate-pulse' 
                            : 'border-transparent hover:border-blue-400'
                        } ${getStatusColor(hour.status)} hover:scale-105`}
                        title={`${hour.hour}:00 - ${hour.hour + 1}:00
Status: ${hour.status}
Units: ${hour.unitsProduced}
Defects: ${hour.defectiveUnits}
Operator: ${hour.operator?.username || 'Unassigned'}
Mold: ${hour.mold?.name || 'Unassigned'}
${shift ? `Shift: ${shift.name}` : ''}
${hasUnclassifiedStoppage ? 'REQUIRES CLASSIFICATION!' : ''}`}
                      >
                        <div className="flex items-center justify-center mb-1">
                          {getStatusIcon(hour.status)}
                        </div>
                        
                        <div className="text-center">
                          <div className="text-xs font-bold text-white">
                            {hour.hour.toString().padStart(2, '0')}:00
                          </div>
                          <div className="text-xs text-white opacity-90">
                            {hour.unitsProduced}u
                          </div>
                          {hour.defectiveUnits > 0 && (
                            <div className="text-xs text-red-200">
                              {hour.defectiveUnits}d
                            </div>
                          )}
                        </div>
                        
                        {hasUnclassifiedStoppage && (
                          <div className="absolute -top-1 -right-1">
                            <AlertTriangle className="h-4 w-4 text-red-400 animate-bounce" />
                          </div>
                        )}
                        
                        {(hour.operator || hour.mold) && (
                          <div className="absolute bottom-0 left-0 right-0 flex justify-center space-x-1">
                            {hour.operator && (
                              <div className="w-1 h-1 bg-blue-300 rounded-full"></div>
                            )}
                            {hour.mold && (
                              <div className="w-1 h-1 bg-yellow-300 rounded-full"></div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className={`text-center py-12 rounded-lg ${cardBgClass} ${cardBorderClass}`}>
            <Calendar className={`h-12 w-12 mx-auto mb-4 ${textSecondaryClass}`} />
            <h3 className={`text-lg font-medium mb-2 ${textSecondaryClass}`}>No data available</h3>
            <p className={textSecondaryClass}>
              No production data found for the selected time range.
            </p>
          </div>
        )}
      </div>

      {/* Stoppage Form Modal */}
      {showStoppageForm && selectedHour && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className={`rounded-lg border w-full max-w-md ${cardBgClass} ${cardBorderClass}`}>
            <div className={`p-6 border-b ${cardBorderClass}`}>
              <div className="flex items-center justify-between">
                <h3 className={`text-lg font-semibold ${textClass}`}>
                  Classify Stoppage - {selectedHour.hour}:00
                </h3>
                <button onClick={closeModals} className={textSecondaryClass}>
                  <X className="h-5 w-5" />
                </button>
              </div>
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
                    reason: e.target.value as any
                  })}
                  className={`w-full px-3 py-2 ${inputBgClass} border ${inputBorderClass} rounded-md ${textClass} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  <option value="planned">Planned Maintenance</option>
                  <option value="mold_change">Mold Change</option>
                  <option value="breakdown">Breakdown</option>
                  <option value="maintenance">Unplanned Maintenance</option>
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
                    value={stoppageForm.sapNotificationNumber || ''}
                    onChange={(e) => setStoppageForm({
                      ...stoppageForm,
                      sapNotificationNumber: e.target.value
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
                  onChange={(e) => setStoppageForm({
                    ...stoppageForm,
                    description: e.target.value
                  })}
                  rows={3}
                  className={`w-full px-3 py-2 ${inputBgClass} border ${inputBorderClass} rounded-md ${textClass} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="Describe the stoppage reason..."
                />
              </div>

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
                  onChange={(e) => setStoppageForm({
                    ...stoppageForm,
                    duration: parseInt(e.target.value) || 0
                  })}
                  className={`w-full px-3 py-2 ${inputBgClass} border ${inputBorderClass} rounded-md ${textClass} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={closeModals}
                  className={`px-4 py-2 border ${buttonSecondaryClass} rounded-md`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-4 py-2 ${buttonPrimaryClass} text-white rounded-md`}
                >
                  Classify Stoppage
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Production Assignment Modal */}
      {showProductionForm && selectedHour && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className={`rounded-lg border w-full max-w-md ${cardBgClass} ${cardBorderClass}`}>
            <div className={`p-6 border-b ${cardBorderClass}`}>
              <div className="flex items-center justify-between">
                <h3 className={`text-lg font-semibold ${textClass}`}>
                  Production Assignment - {selectedHour.hour}:00
                </h3>
                <button onClick={closeModals} className={textSecondaryClass}>
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            
            <form onSubmit={handleProductionSubmit} className="p-6 space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${textSecondaryClass}`}>
                  Operator
                </label>
                <select
                  value={productionForm.operatorId}
                  onChange={(e) => setProductionForm({
                    ...productionForm,
                    operatorId: e.target.value
                  })}
                  className={`w-full px-3 py-2 ${inputBgClass} border ${inputBorderClass} rounded-md ${textClass} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  <option value="">Unassigned</option>
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
                  onChange={(e) => setProductionForm({
                    ...productionForm,
                    moldId: e.target.value
                  })}
                  className={`w-full px-3 py-2 ${inputBgClass} border ${inputBorderClass} rounded-md ${textClass} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  <option value="">Unassigned</option>
                  {molds.map((mold) => (
                    <option key={mold._id} value={mold._id}>
                      {mold.name} ({mold.productionCapacityPerHour}/hr)
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
                  onChange={(e) => setProductionForm({
                    ...productionForm,
                    defectiveUnits: parseInt(e.target.value) || 0
                  })}
                  className={`w-full px-3 py-2 ${inputBgClass} border ${inputBorderClass} rounded-md ${textClass} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
              </div>

              {isAdmin && (
                <div className="flex items-center">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={productionForm.applyToShift}
                      onChange={(e) => setProductionForm({
                        ...productionForm,
                        applyToShift: e.target.checked
                      })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    <span className={`ml-3 text-sm ${textSecondaryClass}`}>
                      Apply to entire shift
                    </span>
                  </label>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={closeModals}
                  className={`px-4 py-2 border ${buttonSecondaryClass} rounded-md`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-4 py-2 ${buttonPrimaryClass} text-white rounded-md`}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Update Assignment
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