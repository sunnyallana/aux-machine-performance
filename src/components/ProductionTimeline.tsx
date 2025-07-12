import React, { useState } from 'react';
import { ProductionTimelineDay, ProductionHour, StoppageRecord } from '../types';
import { format, parseISO } from 'date-fns';
import { Clock, User, Wrench, AlertTriangle, X } from 'lucide-react';

interface ProductionTimelineProps {
  data: ProductionTimelineDay[];
}

interface StoppageModalProps {
  isOpen: boolean;
  onClose: () => void;
  hour: ProductionHour;
  date: string;
  onAddStoppage: (stoppage: Partial<StoppageRecord>) => void;
}

const StoppageModal: React.FC<StoppageModalProps> = ({
  isOpen,
  onClose,
  hour,
  date,
  onAddStoppage
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
            Production Details - {format(parseISO(date), 'MMM dd')}, {hour.hour}:00 - {(hour.hour + 1).toString().padStart(2, '0')}:00
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
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
                        {stoppage.duration} min
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

  const handleAddStoppage = async (stoppage: Partial<StoppageRecord>) => {
    console.log('Adding stoppage:', stoppage);
  };

  const calculateAssignmentSegments = (hours: ProductionHour[], type: 'operator' | 'mold') => {
    const segments: { start: number; end: number; value: any }[] = [];
    let currentStart = -1;
    let currentValue = null;

    for (let i = 0; i <= hours.length; i++) {
      const hour = i < hours.length ? hours[i] : null;
      const value = hour ? (type === 'operator' ? hour.operator?.id : hour.mold?.id) : null;

      if (value !== currentValue) {
        if (currentValue !== null && currentStart !== -1) {
          segments.push({
            start: currentStart,
            end: i - 1,
            value: currentValue
          });
        }
        
        if (value) {
          currentStart = i;
          currentValue = value;
        } else {
          currentStart = -1;
          currentValue = null;
        }
      }
    }

    return segments;
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
      {/* Compact Legend */}
      <div className="bg-gray-700 rounded-lg p-4">
        <h4 className="text-sm font-medium text-white mb-3">Legend</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-500 rounded"></div>
            <span className="text-gray-300">Production</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-yellow-500 rounded"></div>
            <span className="text-gray-300">Running (Low)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-red-500 rounded"></div>
            <span className="text-gray-300">Stoppage</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-gray-600 rounded"></div>
            <span className="text-gray-300">No Production</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-blue-500 rounded"></div>
            <span className="text-gray-300">Operator</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-purple-500 rounded"></div>
            <span className="text-gray-300">Mold</span>
          </div>
        </div>
      </div>
      
      {data.map((day) => {
        const operatorSegments = calculateAssignmentSegments(day.hours, 'operator');
        const moldSegments = calculateAssignmentSegments(day.hours, 'mold');
        
        return (
          <div key={day.date} className="bg-gray-700 rounded-lg p-4">
            {/* Date header */}
            <div className="mb-4">
              <h3 className="text-md font-medium text-white">
                {format(parseISO(day.date), 'EEEE, MMMM dd, yyyy')}
              </h3>
            </div>

            {/* Compact timeline visualization */}
            <div className="mb-3 relative h-8 bg-gray-800 rounded overflow-hidden">
              {/* Hour state indicators */}
              <div className="absolute inset-0 flex">
                {day.hours.map((hour) => (
                  <div
                    key={hour.hour}
                    className="flex-1 h-full cursor-pointer group relative"
                    onClick={() => setSelectedHour({ hour, date: day.date })}
                  >
                    <div
                      className={`w-full h-full transition-all duration-200 group-hover:opacity-80 ${getHourColor(hour)}`}
                      title={`${hour.hour}:00 - ${hour.unitsProduced} units`}
                    />
                  </div>
                ))}
              </div>
              
              {/* Operator assignments overlay */}
              {operatorSegments.map((segment, idx) => {
                const operator = day.hours[segment.start].operator;
                if (!operator) return null;
                
                return (
                  <div
                    key={`operator-${idx}`}
                    className="absolute top-0 h-1/2 bg-blue-500 opacity-80"
                    style={{
                      left: `${(segment.start / 24) * 100}%`,
                      width: `${((segment.end - segment.start + 1) / 24) * 100}%`,
                    }}
                    title={`Operator: ${operator.username} (${segment.end - segment.start + 1}h)`}
                  />
                );
              })}
              
              {/* Mold assignments overlay */}
              {moldSegments.map((segment, idx) => {
                const mold = day.hours[segment.start].mold;
                if (!mold) return null;
                
                return (
                  <div
                    key={`mold-${idx}`}
                    className="absolute bottom-0 h-1/2 bg-purple-500 opacity-80"
                    style={{
                      left: `${(segment.start / 24) * 100}%`,
                      width: `${((segment.end - segment.start + 1) / 24) * 100}%`,
                    }}
                    title={`Mold: ${mold.name} (${segment.end - segment.start + 1}h)`}
                  />
                );
              })}
            </div>

            {/* Summary information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
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
              
              {/* Stoppages summary */}
              {day.hours.some(h => h.stoppages.length > 0) && (
                <div className="md:col-span-2 flex items-start space-x-2 text-red-400">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <span>Stoppages: </span>
                    {day.hours.flatMap(h => h.stoppages).map((stoppage, i) => (
                      <span key={i} className="ml-1">
                        {stoppage.reason.replace('_', ' ')} ({stoppage.duration}min)
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Stoppage Modal */}
      {selectedHour && (
        <StoppageModal
          isOpen={true}
          onClose={() => setSelectedHour(null)}
          hour={selectedHour.hour}
          date={selectedHour.date}
          onAddStoppage={handleAddStoppage}
        />
      )}
    </div>
  );
};

// Sample data generator
const generateSampleData = (): ProductionTimelineDay[] => {
  const createHour = (
    hour: number,
    status: 'running' | 'stopped' | 'off',
    unitsProduced: number,
    operator: { id: string; username: string } | null,
    mold: { id: string; name: string } | null,
    stoppages: StoppageRecord[] = []
  ): ProductionHour => ({
    hour,
    status,
    unitsProduced,
    defectiveUnits: Math.floor(unitsProduced * 0.02),
    operator,
    mold,
    stoppages
  });

  const operators = [
    { id: 'op1', username: 'John Smith' },
    { id: 'op2', username: 'Emma Johnson' },
    { id: 'op3', username: 'Michael Brown' }
  ];

  const molds = [
    { id: 'mold-a', name: 'Mold A-125' },
    { id: 'mold-b', name: 'Mold B-87' },
    { id: 'mold-c', name: 'Mold C-42' }
  ];

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  return [
    {
      date: yesterday.toISOString().split('T')[0],
      hours: [
        createHour(0, 'off', 0, null, null),
        createHour(1, 'off', 0, null, null),
        createHour(2, 'off', 0, null, null),
        createHour(3, 'off', 0, null, null),
        createHour(4, 'off', 0, null, null),
        createHour(5, 'running', 45, operators[0], molds[0]),
        createHour(6, 'running', 120, operators[0], molds[0]),
        createHour(7, 'running', 135, operators[0], molds[0]),
        createHour(8, 'running', 125, operators[0], molds[0]),
        createHour(9, 'stopped', 0, null, molds[0], [
          { id: 'st1', reason: 'breakdown', description: 'Motor failure', duration: 45, startTime: '', endTime: '' }
        ]),
        createHour(10, 'stopped', 0, null, molds[0], [
          { id: 'st2', reason: 'maintenance', description: 'Scheduled calibration', duration: 30, startTime: '', endTime: '' }
        ]),
        createHour(11, 'running', 65, operators[1], molds[0]),
        createHour(12, 'running', 115, operators[1], molds[0]),
        createHour(13, 'running', 125, operators[1], molds[0]),
        createHour(14, 'running', 0, operators[1], molds[1]), // Running with no output
        createHour(15, 'running', 140, operators[1], molds[1]),
        createHour(16, 'running', 130, operators[1], molds[1]),
        createHour(17, 'running', 110, operators[1], molds[1]),
        createHour(18, 'running', 95, operators[2], molds[1]),
        createHour(19, 'stopped', 0, operators[2], molds[1], [
          { id: 'st3', reason: 'material_shortage', description: 'Resin depleted', duration: 25, startTime: '', endTime: '' }
        ]),
        createHour(20, 'running', 85, operators[2], molds[1]),
        createHour(21, 'running', 90, operators[2], molds[1]),
        createHour(22, 'running', 75, operators[2], molds[1]),
        createHour(23, 'off', 0, null, null)
      ]
    },
    {
      date: today.toISOString().split('T')[0],
      hours: [
        createHour(0, 'off', 0, null, null),
        createHour(1, 'off', 0, null, null),
        createHour(2, 'off', 0, null, null),
        createHour(3, 'off', 0, null, null),
        createHour(4, 'running', 40, operators[2], molds[2]),
        createHour(5, 'running', 115, operators[2], molds[2]),
        createHour(6, 'running', 125, operators[2], molds[2]),
        createHour(7, 'running', 135, operators[0], molds[2]),
        createHour(8, 'running', 145, operators[0], molds[2]),
        createHour(9, 'stopped', 0, null, null, [
          { id: 'st4', reason: 'mold_change', description: 'Changing to Mold A', duration: 55, startTime: '', endTime: '' }
        ]),
        createHour(10, 'running', 70, operators[0], molds[0]),
        createHour(11, 'running', 125, operators[0], molds[0]),
        createHour(12, 'running', 130, operators[0], molds[0]),
        createHour(13, 'running', 0, operators[1], molds[0]), // Running with no output
        createHour(14, 'running', 115, operators[1], molds[0]),
        createHour(15, 'running', 120, operators[1], molds[0]),
        createHour(16, 'running', 125, operators[1], molds[0]),
        createHour(17, 'running', 110, operators[1], molds[0]),
        createHour(18, 'stopped', 0, null, null, [
          { id: 'st5', reason: 'other', description: 'Power outage', duration: 20, startTime: '', endTime: '' }
        ]),
        createHour(19, 'running', 85, operators[2], molds[0]),
        createHour(20, 'running', 90, operators[2], molds[0]),
        createHour(21, 'running', 95, operators[2], molds[0]),
        createHour(22, 'running', 80, operators[2], molds[0]),
        createHour(23, 'off', 0, null, null)
      ]
    }
  ];
};

// Component that renders the timeline with sample data
const ProductionTimelineWithSampleData: React.FC = () => {
  const sampleData = generateSampleData();
  return <ProductionTimeline data={sampleData} />;
};

export default ProductionTimelineWithSampleData;