const express = require('express');
const mongoose = require('mongoose');
const SignalData = require('../models/SignalData');
const SensorPinMapping = require('../models/SensorPinMapping');
const ProductionRecord = require('../models/ProductionRecord');
const StoppageRecord = require('../models/StoppageRecord');
const Config = require('../models/Config');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Store last activity times for machines
const machineLastActivity = new Map();
const machineLastCycleSignal = new Map();
const machineLastPowerSignal = new Map();
const machineStates = new Map(); // Track machine states
const pendingStoppages = new Map(); // Track machines with pending stoppages
const machineRunningMinutes = new Map(); // Track running minutes per machine

// Get configuration for timeouts
const getSignalTimeouts = async () => {
  try {
    const config = await Config.findOne();
    return {
      powerTimeout: (config?.signalTimeouts?.powerSignalTimeout || 5) * 60 * 1000, // 5 minutes default
      cycleTimeout: (config?.signalTimeouts?.cycleSignalTimeout || 2) * 60 * 1000   // 2 minutes default
    };
  } catch (error) {
    console.error('Error getting signal timeouts:', error);
    return { powerTimeout: 5 * 60 * 1000, cycleTimeout: 2 * 60 * 1000 };
  }
};

// Process pin data from Python daemon
router.post('/pin-data', async (req, res) => {
  try {
    const { pinData, timestamp } = req.body;
    const io = req.app.get('io');
    
    if (!pinData) {
      return res.status(400).json({ message: 'Pin data is required' });
    }

    // Convert hex string to byte
    const byteValue = parseInt(pinData, 16);
    const currentTime = new Date(timestamp || Date.now());
    
    console.log(`Received pin data: ${pinData} (${byteValue.toString(2).padStart(8, '0')})`);

    // Get all pin mappings
    const pinMappings = await SensorPinMapping.find({})
      .populate({
        path: 'sensorId',
        populate: {
          path: 'machineId',
          populate: {
            path: 'departmentId'
          }
        }
      });

    const processedMachines = new Set();
    const timeouts = await getSignalTimeouts();

    // Process each pin
    for (let pinIndex = 0; pinIndex < 8; pinIndex++) {
      const pinId = `DQ.${pinIndex}`;
      const pinValue = (byteValue >> pinIndex) & 1;
      
      // Find mapping for this pin
      const mapping = pinMappings.find(m => m.pinId === pinId);
      if (!mapping || !mapping.sensorId) continue;

      const sensor = mapping.sensorId;
      const machine = sensor.machineId;
      
      if (!machine) continue;

      // Store signal data
      const signalData = new SignalData({
        sensorId: sensor._id,
        machineId: machine._id,
        value: pinValue,
        timestamp: currentTime
      });
      await signalData.save();

      if (sensor.sensorType === 'power' && pinValue === 1) {
        machineLastPowerSignal.set(machine._id.toString(), currentTime);
        
        // Emit power signal to frontend
        io.emit('power-signal', {
          machineId: machine._id.toString(),
          value: pinValue,
          timestamp: currentTime
        });
      }

      // Process unit cycle signals
      if (sensor.sensorType === 'unit-cycle' && pinValue === 1) {
        // Unit cycle detected - update production
        await updateProductionRecord(machine._id, currentTime, io);
        processedMachines.add(machine._id.toString());
        
        // Update last cycle signal time
        machineLastCycleSignal.set(machine._id.toString(), currentTime);
        
        // Clear any pending stoppages for this machine
        if (pendingStoppages.has(machine._id.toString())) {
          await resolvePendingStoppage(machine._id.toString(), currentTime, io);
          pendingStoppages.delete(machine._id.toString());
        }
      }
      
      // Update machine last activity
      machineLastActivity.set(machine._id.toString(), currentTime);
    }

    // Update machine states and check for stoppages
    await updateMachineStates(pinMappings, currentTime, io, timeouts);

    res.json({ 
      message: 'Pin data processed successfully',
      processedMachines: Array.from(processedMachines)
    });

  } catch (error) {
    console.error('Error processing pin data:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update machine states based on power and cycle signals
async function updateMachineStates(pinMappings, currentTime, io, timeouts) {
  const machinesWithSensors = new Set();
  const Machine = require('../models/Machine');
  
  // Get all machines with sensors
  pinMappings.forEach(mapping => {
    if (mapping.sensorId && mapping.sensorId.machineId) {
      machinesWithSensors.add(mapping.sensorId.machineId._id.toString());
    }
  });

  for (const machineId of machinesWithSensors) {
    const lastPowerTime = machineLastPowerSignal.get(machineId);
    const lastCycleTime = machineLastCycleSignal.get(machineId);
    
    const powerTimeoutAgo = new Date(currentTime.getTime() - timeouts.powerTimeout);
    const cycleTimeoutAgo = new Date(currentTime.getTime() - timeouts.cycleTimeout);
    
    const hasPower = lastPowerTime && lastPowerTime >= powerTimeoutAgo;
    const hasCycle = lastCycleTime && lastCycleTime >= cycleTimeoutAgo;
    
    let machineStatus;
    let statusColor;
    
    if (hasPower && hasCycle) {
      // Power signal within 5 minutes and cycle signal within 2 minutes => running
      machineStatus = 'running_producing';
      statusColor = 'green';
      
      // Track running minutes
      const currentMinute = Math.floor(currentTime.getTime() / (60 * 1000));
      const lastTrackedMinute = machineRunningMinutes.get(machineId) || 0;
      
      if (currentMinute > lastTrackedMinute) {
        machineRunningMinutes.set(machineId, currentMinute);
        await updateRunningMinutes(machineId, currentTime, io);
      }
      
    } else if (hasPower && !hasCycle) {
      // Power signal within 5 minutes but no cycle signal within 2 minutes => unclassified stoppage
      machineStatus = 'unclassified_stoppage';
      statusColor = 'red';
      
      // Create pending stoppage if not already exists
      if (!pendingStoppages.has(machineId)) {
        await createPendingStoppage(machineId, currentTime, io);
        pendingStoppages.set(machineId, {
          startTime: currentTime,
          detectedAt: currentTime
        });
      }
      
    } else if (!hasPower && hasCycle) {
      // No power signal within 5 minutes but cycle signal within 2 minutes => powered off but producing
      machineStatus = 'powered_off_producing';
      statusColor = 'orange';
      
    } else {
      // No power signal within 5 minutes and no cycle signal within 2 minutes => powered off
      machineStatus = 'powered_off';
      statusColor = 'gray';
    }

    // Update machine state
    const currentState = machineStates.get(machineId) || {};
    const newState = {
      ...currentState,
      status: machineStatus,
      color: statusColor,
      hasPower,
      hasCycle,
      lastUpdate: currentTime
    };
    
    machineStates.set(machineId, newState);

    // Update machine status in database
    try {
      let dbStatus = 'stopped';
      if (machineStatus === 'running_producing') {
        dbStatus = 'running';
      } else if (machineStatus === 'unclassified_stoppage') {
        dbStatus = 'error';
      } else if (machineStatus === 'powered_off_producing') {
        dbStatus = 'maintenance';
      } else {
        dbStatus = 'stopped';
      }
      
      await Machine.findByIdAndUpdate(machineId, { status: dbStatus });
    } catch (error) {
      console.error('Error updating machine status in database:', error);
    }

    // Emit machine state update
    io.emit('machine-state-update', {
      machineId,
      status: machineStatus,
      color: statusColor,
      hasPower,
      hasCycle,
      dbStatus: machineStatus === 'running_producing' ? 'running' : 
                machineStatus === 'unclassified_stoppage' ? 'error' :
                machineStatus === 'powered_off_producing' ? 'maintenance' : 'stopped',
      timestamp: currentTime
    });
  }
}

async function updateRunningMinutes(machineId, currentTime, io) {
  try {
    const currentHour = currentTime.getHours();
    const currentDate = currentTime.toISOString().split('T')[0];
    
    // Find or create production record for today
    let productionRecord = await ProductionRecord.findOne({
      machineId,
      startTime: {
        $gte: new Date(currentDate + 'T00:00:00.000Z'),
        $lt: new Date(currentDate + 'T23:59:59.999Z')
      }
    });

    if (!productionRecord) {
      productionRecord = new ProductionRecord({
        machineId,
        startTime: new Date(currentDate + 'T00:00:00.000Z'),
        hourlyData: []
      });
    }

    // Find or create hourly data
    let hourData = productionRecord.hourlyData.find(h => h.hour === currentHour);
    if (!hourData) {
      hourData = {
        hour: currentHour,
        unitsProduced: 0,
        defectiveUnits: 0,
        status: 'running',
        runningMinutes: 0,
        stoppageMinutes: 0,
        stoppages: []
      };
      productionRecord.hourlyData.push(hourData);
    }

    // Increment running minutes
    hourData.runningMinutes = Math.min(60, (hourData.runningMinutes || 0) + 1);
    hourData.status = 'running';
    
    await productionRecord.save();

    // Emit running time update
    io.emit('running-time-update', {
      machineId: machineId.toString(),
      hour: currentHour,
      date: currentDate,
      runningMinutes: hourData.runningMinutes,
      timestamp: currentTime
    });

  } catch (error) {
    console.error('Error updating running minutes:', error);
  }
}

async function createPendingStoppage(machineId, currentTime, io) {
  try {
    const currentHour = currentTime.getHours();
    const currentDate = currentTime.toISOString().split('T')[0];
    
    // Find production record
    let productionRecord = await ProductionRecord.findOne({
      machineId,
      startTime: {
        $gte: new Date(currentDate + 'T00:00:00.000Z'),
        $lt: new Date(currentDate + 'T23:59:59.999Z')
      }
    });

    if (!productionRecord) {
      productionRecord = new ProductionRecord({
        machineId,
        startTime: new Date(currentDate + 'T00:00:00.000Z'),
        hourlyData: []
      });
    }

    // Find or create hourly data
    let hourData = productionRecord.hourlyData.find(h => h.hour === currentHour);
    if (!hourData) {
      hourData = {
        hour: currentHour,
        unitsProduced: 0,
        defectiveUnits: 0,
        status: 'stopped',
        runningMinutes: 0,
        stoppageMinutes: 0,
        stoppages: []
      };
      productionRecord.hourlyData.push(hourData);
    }

    // Add pending stoppage record
    const pendingStoppageId = `pending_${Date.now()}`;
    hourData.stoppages.push({
      _id: pendingStoppageId,
      reason: 'undefined',
      description: 'Automatic stoppage detection - awaiting categorization',
      startTime: currentTime,
      endTime: null,
      duration: 0,
      isPending: true
    });

    hourData.status = 'unclassified_stoppage';
    
    await productionRecord.save();

    // Emit socket event for pending stoppage
    io.emit('pending-stoppage-detected', {
      machineId: machineId.toString(),
      hour: currentHour,
      date: currentDate,
      stoppageStart: currentTime,
      pendingStoppageId,
      timestamp: currentTime
    });

    console.log(`Detected unclassified stoppage for machine ${machineId}`);

  } catch (error) {
    console.error('Error creating pending stoppage:', error);
  }
}

async function resolvePendingStoppage(machineId, currentTime, io) {
  try {
    const currentHour = currentTime.getHours();
    const currentDate = currentTime.toISOString().split('T')[0];
    
    // Find production record
    const productionRecord = await ProductionRecord.findOne({
      machineId,
      startTime: {
        $gte: new Date(currentDate + 'T00:00:00.000Z'),
        $lt: new Date(currentDate + 'T23:59:59.999Z')
      }
    });

    if (productionRecord) {
      const hourData = productionRecord.hourlyData.find(h => h.hour === currentHour);
      if (hourData) {
        // Find and remove pending stoppages
        hourData.stoppages = hourData.stoppages.filter(s => s.reason !== 'undefined');
        hourData.status = 'running';
        
        await productionRecord.save();
      }
    }

    // Emit stoppage resolved event
    io.emit('stoppage-resolved', {
      machineId: machineId.toString(),
      timestamp: currentTime
    });

  } catch (error) {
    console.error('Error resolving pending stoppage:', error);
  }
}

async function updateProductionRecord(machineId, currentTime, io) {
  try {
    const currentHour = currentTime.getHours();
    const currentDate = currentTime.toISOString().split('T')[0];
    
    // Find or create production record for today
    let productionRecord = await ProductionRecord.findOne({
      machineId,
      startTime: {
        $gte: new Date(currentDate + 'T00:00:00.000Z'),
        $lt: new Date(currentDate + 'T23:59:59.999Z')
      }
    }).populate('operatorId moldId');

    if (!productionRecord) {
      productionRecord = new ProductionRecord({
        machineId,
        startTime: new Date(currentDate + 'T00:00:00.000Z'),
        hourlyData: []
      });
    }

    // Find or create hourly data
    let hourData = productionRecord.hourlyData.find(h => h.hour === currentHour);
    if (!hourData) {
      hourData = {
        hour: currentHour,
        unitsProduced: 0,
        defectiveUnits: 0,
        status: 'running',
        runningMinutes: 0,
        stoppageMinutes: 0,
        stoppages: []
      };
      productionRecord.hourlyData.push(hourData);
    }

    // Increment units produced
    hourData.unitsProduced += 1;
    hourData.status = 'running';

    // Update total units produced
    productionRecord.unitsProduced = productionRecord.hourlyData.reduce(
      (sum, h) => sum + h.unitsProduced, 0
    );
    
    productionRecord.lastActivityTime = currentTime;
    await productionRecord.save();

    // Emit socket event for real-time updates
    io.emit('production-update', {
      machineId: machineId.toString(),
      hour: currentHour,
      date: currentDate,
      unitsProduced: hourData.unitsProduced,
      status: hourData.status,
      runningMinutes: hourData.runningMinutes,
      stoppageMinutes: hourData.stoppageMinutes,
      timestamp: currentTime
    });

    console.log(`Updated production for machine ${machineId}: +1 unit (total: ${hourData.unitsProduced})`);

  } catch (error) {
    console.error('Error updating production record:', error);
  }
}

// Get recent signals for a machine
router.get('/machine/:machineId/recent', auth, async (req, res) => {
  try {
    const { machineId } = req.params;
    const { limit = 100 } = req.query;

    const signals = await SignalData.find({ machineId })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .populate('sensorId');

    res.json(signals);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Add signal data (legacy endpoint)
router.post('/', async (req, res) => {
  try {
    const { sensorId, machineId, value, timestamp } = req.body;
    
    const signalData = new SignalData({
      sensorId,
      machineId,
      value,
      timestamp: timestamp ? new Date(timestamp) : new Date()
    });

    await signalData.save();
    res.status(201).json(signalData);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;