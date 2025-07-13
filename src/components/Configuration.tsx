import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Config, Sensor } from '../types';
import apiService from '../services/api';
import {
  Settings,
  Network,
  Mail,
  Save,
  Cpu,
  Link,
  Plus,
  Trash2
} from 'lucide-react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const Configuration: React.FC = () => {
  const { isAdmin } = useAuth();
  const [config, setConfig] = useState<Config | null>(null);
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [pinMappings, setPinMappings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('plc');
  const [emailRecipients, setEmailRecipients] = useState('');

  // Pin mapping state
  const [selectedSensor, setSelectedSensor] = useState('');
  const [selectedPin, setSelectedPin] = useState('');

  useEffect(() => {
    if (isAdmin) {
      fetchConfigData();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (config) {
      // Initialize recipients as comma-separated string
      setEmailRecipients(config.email.recipients.join(', '));
    }
  }, [config]);

  const fetchConfigData = async () => {
    try {
      const [configData, sensorsData, pinMappingsData] = await Promise.all([
        apiService.getConfig(),
        apiService.getSensors(),
        apiService.getPinMappings()
      ]);
      
      setConfig(configData);
      setSensors(sensorsData);
      setPinMappings(pinMappingsData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch configuration';
      toast.error(errorMessage, {
        position: "top-right",
        autoClose: 5000,
        theme: "dark"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConfigUpdate = async (updatedConfig: Partial<Config>) => {
    setSaving(true);

    try {
      const newConfig = { ...config, ...updatedConfig } as Config;
      await apiService.updateConfig(newConfig);
      setConfig(newConfig);
      toast.success('Configuration updated successfully', {
        position: "top-right",
        autoClose: 3000,
        theme: "dark"
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update configuration';
      toast.error(errorMessage, {
        position: "top-right",
        autoClose: 5000,
        theme: "dark"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMapping = async (mappingId: string) => {
    if (confirm('Are you sure you want to permanently delete this pin mapping?')) {
      try {
        await apiService.deletePinMapping(mappingId);
        toast.success('Pin mapping deleted successfully', {
          position: "top-right",
          autoClose: 3000,
          theme: "dark"
        });
        fetchConfigData(); // Refresh data
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to delete pin mapping';
        toast.error(errorMessage, {
          position: "top-right",
          autoClose: 5000,
          theme: "dark"
        });
      }
    }
  };

  const handlePinMapping = async () => {
    if (!selectedSensor || !selectedPin) return;

    try {
      await apiService.createPinMapping({
        sensorId: selectedSensor,
        pinId: selectedPin
      });
      
      toast.success('Pin mapping created successfully', {
        position: "top-right",
        autoClose: 3000,
        theme: "dark"
      });
      
      setSelectedSensor('');
      setSelectedPin('');
      fetchConfigData(); // Refresh data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create pin mapping';
      toast.error(errorMessage, {
        position: "top-right",
        autoClose: 5000,
        theme: "dark"
      });
    }
  };

  const availablePins = Array.from({ length: 8 }, (_, i) => `DQ.${i}`);
  const occupiedPins = pinMappings.map(mapping => mapping.pinId);
  const availablePinsForSelection = availablePins.filter(pin => !occupiedPins.includes(pin));

  if (!isAdmin) {
    return (
      <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-3 rounded-md">
        <div className="flex items-center">
          <span>Access denied. Admin privileges required.</span>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast container */}
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
      
      {/* Header */}
      <div className="flex items-center space-x-4">
        <Settings className="h-8 w-8 text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">System Configuration</h1>
          <p className="text-gray-400">Configure PLC settings, email alerts, and sensor mappings</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-700">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'plc', label: 'PLC Configuration', icon: Cpu },
            { id: 'email', label: 'Email Settings', icon: Mail },
            { id: 'mapping', label: 'Pin Mapping', icon: Link }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {/* PLC Configuration */}
        {activeTab === 'plc' && config && (
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
            <div className="flex items-center space-x-2 mb-4">
              <Network className="h-5 w-5 text-blue-400" />
              <h2 className="text-lg font-semibold text-white">PLC Connection Settings</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  IP Address
                </label>
                <input
                  type="text"
                  value={config.plc.ip}
                  onChange={(e) => setConfig({
                    ...config,
                    plc: { ...config.plc, ip: e.target.value }
                  })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="192.168.1.100"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Rack
                </label>
                <input
                  type="number"
                  value={config.plc.rack}
                  onChange={(e) => setConfig({
                    ...config,
                    plc: { ...config.plc, rack: parseInt(e.target.value) || 0 }
                  })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Slot
                </label>
                <input
                  type="number"
                  value={config.plc.slot}
                  onChange={(e) => setConfig({
                    ...config,
                    plc: { ...config.plc, slot: parseInt(e.target.value) || 1 }
                  })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="1"
                />
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={() => handleConfigUpdate({ plc: config.plc })}
                disabled={saving}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <Save className="h-4 w-4" />
                <span>{saving ? 'Saving...' : 'Save PLC Settings'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Email Configuration */}
        {activeTab === 'email' && config && (
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
            <div className="flex items-center space-x-2 mb-4">
              <Mail className="h-5 w-5 text-blue-400" />
              <h2 className="text-lg font-semibold text-white">Email Alert Settings</h2>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Sender Email
                  </label>
                  <input
                    type="email"
                    value={config.email.senderEmail}
                    onChange={(e) => setConfig({
                      ...config,
                      email: { ...config.email, senderEmail: e.target.value }
                    })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="alerts@company.com"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    App Password
                  </label>
                  <input
                    type="password"
                    value={config.email.senderPassword}
                    onChange={(e) => setConfig({
                      ...config,
                      email: { ...config.email, senderPassword: e.target.value }
                    })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="App-specific password"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Recipients (comma-separated)
                </label>
                  <textarea
                    value={emailRecipients}
                    onChange={(e) => setEmailRecipients(e.target.value)}
                    rows={3}
                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="manager@company.com, operator@company.com"
                  />
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={() => {
                  // Split into array only when saving
                  const recipientsArray = emailRecipients
                    .split(',')
                    .map(email => email.trim())
                    .filter(Boolean);
                  
                  handleConfigUpdate({
                    email: {
                      ...config.email,
                      recipients: recipientsArray
                    }
                  });
                }}
                disabled={saving}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <Save className="h-4 w-4" />
                <span>{saving ? 'Saving...' : 'Save Email Settings'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Pin Mapping */}
        {activeTab === 'mapping' && (
          <div className="space-y-6">
            {/* Add New Mapping */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <div className="flex items-center space-x-2 mb-4">
                <Plus className="h-5 w-5 text-blue-400" />
                <h2 className="text-lg font-semibold text-white">Create Pin Mapping</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Sensor
                  </label>
                  <select
                    value={selectedSensor}
                    onChange={(e) => setSelectedSensor(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select sensor...</option>
                    {sensors.filter(sensor => 
                      !pinMappings.some(mapping => mapping.sensorId._id === sensor._id)
                    ).map((sensor) => (
                      <option key={sensor._id} value={sensor._id}>
                        {sensor.name} ({sensor.sensorType})
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    PLC Pin
                  </label>
                  <select
                    value={selectedPin}
                    onChange={(e) => setSelectedPin(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select pin...</option>
                    {availablePinsForSelection.map((pin) => (
                      <option key={pin} value={pin}>
                        {pin}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="flex items-end">
                  <button
                    onClick={handlePinMapping}
                    disabled={!selectedSensor || !selectedPin}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    <Link className="h-4 w-4" />
                    <span>Map Pin</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Current Mappings */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Current Pin Mappings</h2>
              
              {pinMappings.length > 0 ? (
                <div className="space-y-3">
                  {pinMappings.map((mapping) => (
                    <div key={mapping._id} className="bg-gray-700 rounded-lg p-4 flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="bg-blue-600 text-white px-3 py-1 rounded text-sm font-mono">
                          {mapping.pinId}
                        </div>
                        <div>
                          <div className="text-white font-medium">{mapping.sensorId.name}</div>
                          <div className="text-gray-400 text-sm">
                            {mapping.sensorId.sensorType} • Machine: {mapping.sensorId.machineId?.name || 'Unknown'}
                          </div>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <button 
                          onClick={() => handleDeleteMapping(mapping._id)}
                          className="text-red-400 hover:bg-red-400/10 p-2 rounded"
                          title="Delete permanently"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-400">No pin mappings configured</p>
                  <p className="text-gray-500 text-sm mt-1">Create your first mapping above</p>
                </div>
              )}
            </div>

            {/* Pin Status Overview */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">PLC Pin Status</h2>
              
              <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                {availablePins.map((pin) => {
                  const mapping = pinMappings.find(m => m.pinId === pin);
                  let statusClass = 'bg-gray-700 border-gray-600 text-gray-400';
                  let statusText = 'Free';
                  
                  if (mapping) {
                    statusClass = 'bg-green-900/50 border-green-500 text-green-300';
                    statusText = 'Mapped';
                  }
                  
                  return (
                    <div
                      key={pin}
                      className={`p-3 rounded-lg border text-center ${statusClass}`}
                      title={mapping ? `Mapped to: ${mapping.sensorId.name}` : 'Available'}
                    >
                      <div className="font-mono text-sm">{pin}</div>
                      <div className="text-xs mt-1">
                        {statusText}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Configuration;