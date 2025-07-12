import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Machine, ProductionTimelineDay, MachineStats } from '../types';
import apiService from '../services/api';
import ProductionTimeline from './ProductionTimeline';
import {
  ArrowLeft,
  Activity,
  TrendingUp,
  AlertTriangle,
  Clock,
  Gauge,
  Power,
  Settings
} from 'lucide-react';

const MachineView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [machine, setMachine] = useState<Machine | null>(null);
  const [timeline, setTimeline] = useState<ProductionTimelineDay[]>([]);
  const [stats, setStats] = useState<MachineStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('24h');

  useEffect(() => {
    if (id) {
      fetchMachineData();
    }
  }, [id, selectedPeriod]);

  const fetchMachineData = async () => {
    try {
      setLoading(true);
      const [machineData, timelineData, statsData] = await Promise.all([
        apiService.getMachine(id!),
        apiService.getProductionTimeline(id!),
        apiService.getMachineStats(id!, selectedPeriod)
      ]);
      
      setMachine(machineData);
      setTimeline(timelineData);
      setStats(statsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch machine data');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-green-400 bg-green-400/10 border-green-400/20';
      case 'stopped': return 'text-red-400 bg-red-400/10 border-red-400/20';
      case 'maintenance': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
      case 'error': return 'text-red-500 bg-red-500/10 border-red-500/20';
      default: return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Power className="h-4 w-4" />;
      case 'stopped': return <AlertTriangle className="h-4 w-4" />;
      case 'maintenance': return <Settings className="h-4 w-4" />;
      case 'error': return <AlertTriangle className="h-4 w-4" />;
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

  if (!machine || !stats) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">Machine not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">{machine.name}</h1>
            <p className="text-gray-400">{machine.description}</p>
          </div>
        </div>
        
        <div className={`flex items-center space-x-2 px-3 py-2 rounded-md border ${getStatusColor(machine.status)}`}>
          {getStatusIcon(machine.status)}
          <span className="font-medium capitalize">{machine.status}</span>
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

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Units Produced</p>
              <p className="text-xl font-semibold text-white">{stats.totalUnitsProduced}</p>
            </div>
            <TrendingUp className="h-8 w-8 text-green-400" />
          </div>
        </div>

        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">OEE</p>
              <p className="text-xl font-semibold text-yellow-400">{stats.oee}%</p>
            </div>
            <Gauge className="h-8 w-8 text-yellow-400" />
          </div>
        </div>

        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">MTBF</p>
              <p className="text-xl font-semibold text-blue-400">{stats.mtbf}h</p>
            </div>
            <Clock className="h-8 w-8 text-blue-400" />
          </div>
        </div>

        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">MTTR</p>
              <p className="text-xl font-semibold text-purple-400">{stats.mttr}m</p>
            </div>
            <Activity className="h-8 w-8 text-purple-400" />
          </div>
        </div>
      </div>

      {/* Detailed Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Performance Metrics</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Availability</span>
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
            
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Quality</span>
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
            
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Performance</span>
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
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Good Units</span>
              <span className="text-green-400 font-medium">
                {stats.totalUnitsProduced - stats.totalDefectiveUnits}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Defective Units</span>
              <span className="text-red-400 font-medium">{stats.totalDefectiveUnits}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Defect Rate</span>
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
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Current Status</span>
              <span className={`font-medium capitalize ${
                machine.status === 'running' ? 'text-green-400' :
                machine.status === 'stopped' ? 'text-red-400' :
                machine.status === 'maintenance' ? 'text-yellow-400' :
                'text-red-400'
              }`}>
                {machine.status}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">MTBF</span>
              <span className="text-blue-400 font-medium">{stats.mtbf} hours</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">MTTR</span>
              <span className="text-purple-400 font-medium">{stats.mttr} minutes</span>
            </div>
          </div>
        </div>
      </div>

      {/* Production Timeline */}
      <div className="bg-gray-800 rounded-lg border border-gray-700">
        <div className="p-6 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">7-Day Production Timeline</h2>
          <p className="text-sm text-gray-400 mt-1">
            Hourly production data with operator and mold information
          </p>
        </div>
        <div className="p-6">
          <ProductionTimeline data={timeline} />
        </div>
      </div>
    </div>
  );
};

export default MachineView;