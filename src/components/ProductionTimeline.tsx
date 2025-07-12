import React, { useState } from 'react';
import { ProductionTimelineDay, ProductionHour, StoppageRecord } from '../types';
import { format, parseISO } from 'date-fns';
import { Clock, User, Wrench, AlertTriangle, CheckCircle, X } from 'lucide-react';

interface ProductionTimelineProps {
  data: ProductionTimelineDay[];
}

interface StoppageModalProps {
  isOpen: boolean;
  onClose: () => void;
  hour: ProductionHour;
  date: string;
  onAddStoppage: (stoppage: Partial<StoppageRecord>) => void;
  onUpdateStoppage: (id: string, stoppage: Partial<StoppageRecord>) => void;
}

const StoppageModal: React.FC<StoppageModalProps> = ({
  isOpen,
  onClose,
  hour,
  date,
  onAddStoppage,
  onUpdateStoppage
}) => {
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;

    setIsSubmitting(true);
    try {
      const stoppage = {
        reason: reason as any,
        description: description.trim(),
        startTime: new Date(`${date}T${hour.hour.toString().padStart(2, '0')}:00:00`).toISOString()
      };
      
      await onAddStoppage(stoppage);
      onClose();
    } catch (error) {
      console.error('Failed to add stoppage:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg border border-gray-700 w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">
            Production Details - {format(parseISO(date), 'MMM dd')}, {hour.hour}:00
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Production Summary - Removed header */}
          <div className="bg-gray-700 rounded-lg p-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-400">Units Produced:</span>
                <span className="text-white ml-2 font-medium">{hour.unitsProduced}</span>
              </div>
              <div>
                <span className="text-gray-400">Defective:</span>
                <span className="text-red-400 ml-2 font-medium">{hour.defectiveUnits}</span>
              </div>
              <div>
                <span className="text-gray-400">Status:</span>
                <span className={`ml-2 font-medium capitalize ${
                  hour.status === 'running' ? 'text-green-400' :
                  hour.status === 'stopped' ? 'text-red-400' :
                  'text-yellow-400'
                }`}>
                  {hour.status}
                </span>
              </div>
            </div>
          </div>

          {/* Operator and Mold Info */}
          {(hour.operator || hour.mold) && (
            <div className="bg-gray-700 rounded-lg p-4">
              <h4 className="text-sm font-medium text-white mb-3">Shift Information</h4>
              <div className="space-y-2 text-sm">
                {hour.operator && (
                  <div className="flex items-center">
                    <User className="h-4 w-4 text-blue-400 mr-2" />
                    <span className="text-gray-400">Operator:</span>
                    <span className="text-white ml-2">{hour.operator.username}</span>
                  </div>
                )}
                {hour.mold && (
                  <div className="flex items-center">
                    <Wrench className="h-4 w-4 text-purple-400 mr-2" />
                    <span className="text-gray-400">Mold:</span>
                    <span className="text-white ml-2">{hour.mold.name}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Existing Stoppages */}
          {hour.stoppages.length > 0 && (
            <div className="bg-gray-700 rounded-lg p-4">
              <h4 className="text-sm font-medium text-white mb-3">Stoppages</h4>
              <div className="space-y-2">
                {hour.stoppages.map((stoppage, index) => (
                  <div key={index} className="bg-gray-600 rounded p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-white capitalize">
                        {stoppage.reason.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-gray-400">
                        {format(parseISO(stoppage.startTime), 'HH:mm')}
                      </span>
                    </div>
                    {stoppage.description && (
                      <p className="text-xs text-gray-300">{stoppage.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add New Stoppage */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Add Stoppage Reason
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
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

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Description (Optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Additional details about the stoppage..."
              />
            </div>

            <div className="flex space-x-3">
              <button
                type="submit"
                disabled={!reason.trim() || isSubmitting}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? 'Adding...' : 'Add Stoppage'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

const ProductionTimeline: React.FC<ProductionTimelineProps> = ({ data }) => {
  const [selectedHour, setSelectedHour] = useState<{ hour: ProductionHour; date: string } | null>(null);

  const getHourColor = (hour: ProductionHour) => {
    if (hour.stoppages.length > 0) return 'bg-red-500';
    if (hour.status === 'running' && hour.unitsProduced > 0) return 'bg-green-500';
    if (hour.status === 'running') return 'bg-yellow-500';
    return 'bg-gray-600';
  };

  const getHourHeight = (hour: ProductionHour) => {
    const maxUnits = Math.max(...data.flatMap(day => 
      day.hours.map(h => h.unitsProduced)
    ));
    if (maxUnits === 0) return 'h-2';
    const height = Math.max(8, (hour.unitsProduced / maxUnits) * 40);
    return `h-${Math.min(40, Math.round(height / 4) * 4)}`;
  };

  const handleAddStoppage = async (stoppage: Partial<StoppageRecord>) => {
    // This would call the API to add a stoppage
    console.log('Adding stoppage:', stoppage);
  };

  const handleUpdateStoppage = async (id: string, stoppage: Partial<StoppageRecord>) => {
    // This would call the API to update a stoppage
    console.log('Updating stoppage:', id, stoppage);
  };

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8">
        <Clock className="h-8 w-8 text-gray-600 mx-auto mb-2" />
        <p className="text-gray-400">No production data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Timeline Chart */}
      <div className="space-y-4">
        {data.map((day) => (
          <div key={day.date} className="bg-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-white">
                {format(parseISO(day.date), 'EEEE, MMMM dd, yyyy')}
              </h3>
              <div className="text-xs text-gray-400">
                Total: {day.hours.reduce((sum, hour) => sum + hour.unitsProduced, 0)} units
              </div>
            </div>

            {/* Hour bars */}
            <div className="grid grid-cols-24 gap-1">
              {day.hours.map((hour) => (
                <div
                  key={hour.hour}
                  className="flex flex-col items-center cursor-pointer group"
                  onClick={() => setSelectedHour({ hour, date: day.date })}
                >
                  <div
                    className={`w-full rounded transition-all duration-200 group-hover:opacity-80 ${getHourColor(hour)}`}
                    style={{ height: `${Math.max(8, (hour.unitsProduced / 100) * 40)}px` }}
                    title={`${hour.hour}:00 - ${hour.unitsProduced} units`}
                  />
                  <span className="text-xs text-gray-400 mt-1">
                    {hour.hour}
                  </span>
                </div>
              ))}
            </div>

            {/* Operator and Mold info */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="flex items-center space-x-2">
                <User className="h-4 w-4 text-blue-400" />
                <span className="text-gray-400">Operator:</span>
                <span className="text-white">
                  {day.hours.find(h => h.operator)?.operator?.username || 'Not assigned'}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Wrench className="h-4 w-4 text-purple-400" />
                <span className="text-gray-400">Mold:</span>
                <span className="text-white">
                  {day.hours.find(h => h.mold)?.mold?.name || 'Not assigned'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="bg-gray-700 rounded-lg p-4">
        <h4 className="text-sm font-medium text-white mb-3">Legend</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-green-500 rounded"></div>
            <span className="text-gray-300">Production Running</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-yellow-500 rounded"></div>
            <span className="text-gray-300">Running (Low Output)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-red-500 rounded"></div>
            <span className="text-gray-300">Stoppage/Issue</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-gray-600 rounded"></div>
            <span className="text-gray-300">No Production</span>
          </div>
        </div>
      </div>

      {/* Stoppage Modal */}
      {selectedHour && (
        <StoppageModal
          isOpen={true}
          onClose={() => setSelectedHour(null)}
          hour={selectedHour.hour}
          date={selectedHour.date}
          onAddStoppage={handleAddStoppage}
          onUpdateStoppage={handleUpdateStoppage}
        />
      )}
    </div>
  );
};

export default ProductionTimeline;