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
const pendingStoppages = new Map(); // Track machines with pending stoppages
const machineLastPowerSignal = new Map();
const machineStates = new Map(); // Track machine states

// Get configuration for timeouts
const getSignalTimeouts = async () => {
  try {
    const config = await Config.findOne();
    return {
      powerTimeout: (config?.signalTimeouts?.powerSignalTimeout || 2) * 60 * 1000, // Convert to milliseconds
      cycleTimeout: (config?.signalTimeouts?.cycleSignalTimeout || 2) * 60 * 1000
    };
  } catch (error) {
    console.error('Error getting signal timeouts:', error);
    return { powerTimeout: 2 * 60 * 1000, cycleTimeout: 2 * 60 * 1000 };
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

      if (sensor.sensorType === 'power') {
        if (pinValue === 1) {
          machineLastPowerSignal.set(machine._id.toString(), currentTime);
        }
        
        // Emit power signal to frontend
        io.emit('power-signal', {
          machineId: machine._id.toString(),
          value: pinValue,
          timestamp: currentTime
        });

        // Update machine state
        updateMachineState(machine._id.toString(), 'power', pinValue === 1, currentTime, io);
      }

      // Process based on sensor type
      if (sensor.sensorType === 'unit-cycle' && pinValue === 1) {
        // Unit cycle detected - update production
        await updateProductionRecord(machine._id, currentTime, io);
        processedMachines.add(machine._id.toString());
        
        // Update last cycle signal time and clear any pending stoppages
        machineLastCycleSignal.set(machine._id.toString(), currentTime);
        updateMachineState(machine._id.toString(), 'cycle', true, currentTime, io);
        
        if (pendingStoppages.has(machine._id.toString())) {
          pendingStoppages.delete(machine._id.toString());
          // Emit stoppage resolved event
          io.emit('stoppage-resolved', {
            machineId: machine._id.toString(),
            timestamp: currentTime
          });
        }
      }
      
      // Update machine last activity
      machineLastActivity.set(machine._id.toString(), currentTime);
    }

    // Check for stoppages (no unit-cycle for 2 minutes)
    await checkForStoppages(pinMappings, currentTime, io, timeouts);

    res.json({ 
      message: 'Pin data processed successfully',
      processedMachines: Array.from(processedMachines)
    });

  } catch (error) {
    console.error('Error processing pin data:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update machine state based on power and cycle signals
function updateMachineState(machineId, signalType, isActive, timestamp, io) {
  const currentState = machineStates.get(machineId) || { 
    power: false, 
    cycle: false, 
    lastUpdate: timestamp,
    state: 'inactive_not_producing'
  };

  if (signalType === 'power') {
    currentState.power = isActive;
  } else if (signalType === 'cycle') {
    currentState.cycle = isActive;
  }

  // Determine machine state
  let newState;
  if (currentState.power && currentState.cycle) {
    newState = 'running_producing';
  } else if (!currentState.power && currentState.cycle) {
    newState = 'inactive_producing';
  } else if (currentState.power && !currentState.cycle) {
    newState = 'running_not_producing';
  } else {
    newState = 'inactive_not_producing';
  }

  currentState.state = newState;
  currentState.lastUpdate = timestamp;
  machineStates.set(machineId, currentState);

  // Emit machine state update
  io.emit('machine-state-update', {
    machineId,
    state: newState,
    power: currentState.power,
    cycle: currentState.cycle,
    timestamp
  });
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
    
    // Don't automatically increment running minutes per unit
    // Running minutes should be calculated based on actual time periods

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

async function checkForStoppages(pinMappings, currentTime, io, timeouts) {
  try {
    const powerTimeoutAgo = new Date(currentTime.getTime() - timeouts.powerTimeout);
    const cycleTimeoutAgo = new Date(currentTime.getTime() - timeouts.cycleTimeout);
    
    // Check power sensors and update machine states
    const machinesWithPowerSensors = new Set();
    pinMappings.forEach(mapping => {
      if (mapping.sensorId && mapping.sensorId.sensorType === 'power') {
        machinesWithPowerSensors.add(mapping.sensorId.machineId._id.toString());
      }
    });

    for (const machineId of machinesWithPowerSensors) {
      const lastPowerTime = machineLastPowerSignal.get(machineId);
      if (lastPowerTime && lastPowerTime < powerTimeoutAgo) {
        // Update machine state to show power is off
        updateMachineState(machineId, 'power', false, currentTime, io);
        
        // Emit power timeout event
        io.emit('power-timeout', {
          machineId,
          lastPowerTime,
          timestamp: currentTime
        });
      } else if (!lastPowerTime) {
        // If we've never received a power signal, assume power is off
        updateMachineState(machineId, 'power', false, currentTime, io);
      }
    }
    
    // Check cycle sensors for stoppages
    const machinesWithCycleSensors = new Set();
    pinMappings.forEach(mapping => {
      if (mapping.sensorId && mapping.sensorId.sensorType === 'unit-cycle') {
        machinesWithCycleSensors.add(mapping.sensorId.machineId._id.toString());
      }
    });

    for (const machineId of machinesWithCycleSensors) {
      const lastCycleTime = machineLastCycleSignal.get(machineId);
      const lastPowerTime = machineLastPowerSignal.get(machineId);
      const hasPower = lastPowerTime && lastPowerTime >= powerTimeoutAgo;
      
      // Check for cycle timeout (only if machine has power)
      const shouldDetectStoppage = hasPower && (
        (lastCycleTime && lastCycleTime < cycleTimeoutAgo) || 
        (!lastCycleTime && machineLastActivity.has(machineId))
      );
      
      if (shouldDetectStoppage && !pendingStoppages.has(machineId)) {
        // Mark as pending stoppage and emit event for user to categorize
        const stoppageStartTime = lastCycleTime || new Date(currentTime.getTime() - timeouts.cycleTimeout);
        
        pendingStoppages.set(machineId, {
          startTime: stoppageStartTime,
          detectedAt: currentTime
        });

        await recordPendingStoppage(machineId, stoppageStartTime, currentTime, io);
      }
      
      // Update machine state for cycle signal
      if (lastCycleTime && lastCycleTime >= cycleTimeoutAgo) {
        updateMachineState(machineId, 'cycle', true, currentTime, io);
      } else {
        updateMachineState(machineId, 'cycle', false, currentTime, io);
      }
    }
  } catch (error) {
    console.error('Error checking for stoppages:', error);
  }
}

async function recordPendingStoppage(machineId, stoppageStart, currentTime, io) {
  try {
    const currentHour = stoppageStart.getHours();
    const currentDate = stoppageStart.toISOString().split('T')[0];
    
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

    // Calculate ongoing stoppage duration
    const stoppageDuration = Math.round((currentTime - stoppageStart) / (1000 * 60)); // minutes
    
    // Add pending stoppage record
    const pendingStoppageId = `pending_${Date.now()}`;
    hourData.stoppages.push({
      _id: pendingStoppageId,
      reason: 'undefined', // Special marker for pending stoppages
      description: 'Automatic stoppage detection - awaiting categorization',
      startTime: stoppageStart,
      endTime: null, // Ongoing
      duration: stoppageDuration,
      isPending: true
    });

    hourData.status = 'stopped';
    hourData.stoppageMinutes = Math.min(60, hourData.stoppageMinutes + stoppageDuration);
    
    await productionRecord.save();

    // Emit socket event for pending stoppage
    io.emit('pending-stoppage-detected', {
      machineId: machineId.toString(),
      hour: currentHour,
      date: currentDate,
      stoppageStart,
      duration: stoppageDuration,
      pendingStoppageId,
      timestamp: currentTime
    });

    console.log(`Detected pending stoppage for machine ${machineId}: ${stoppageDuration} minutes`);

  } catch (error) {
    console.error('Error recording pending stoppage:', error);
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