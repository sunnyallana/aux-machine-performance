const express = require('express');
const SignalData = require('../models/SignalData');
const SensorPinMapping = require('../models/SensorPinMapping');
const ProductionRecord = require('../models/ProductionRecord');
const StoppageRecord = require('../models/StoppageRecord');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Store last activity times for machines
const machineLastActivity = new Map();
const machineLastCycleSignal = new Map();
const pendingStoppages = new Map(); // Track machines with pending stoppages
const machineLastPowerSignal = new Map();

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
        machineLastPowerSignal.set(machine._id.toString(), currentTime);
        
        // Emit power signal to frontend
        io.emit('power-signal', {
          machineId: machine._id.toString(),
          value: pinValue,
          timestamp: currentTime
        });
      }

      // Process based on sensor type
      if (sensor.sensorType === 'unit-cycle' && pinValue === 1) {
        // Unit cycle detected - update production
        await updateProductionRecord(machine._id, currentTime, io);
        processedMachines.add(machine._id.toString());
        
        // Update last cycle signal time and clear any pending stoppages
        machineLastCycleSignal.set(machine._id.toString(), currentTime);
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
    await checkForStoppages(pinMappings, currentTime, io);

    res.json({ 
      message: 'Pin data processed successfully',
      processedMachines: Array.from(processedMachines)
    });

  } catch (error) {
    console.error('Error processing pin data:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

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
    
    // Update running minutes (assume each cycle represents some running time)
    const lastActivity = machineLastActivity.get(machineId.toString());
    if (lastActivity) {
      const timeDiff = (currentTime - lastActivity) / (1000 * 60); // minutes
      if (timeDiff <= 5) { // Only count if within reasonable time
        hourData.runningMinutes = Math.min(60, hourData.runningMinutes + 1);
      }
    }

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

async function checkForStoppages(pinMappings, currentTime, io) {
  try {
    const twoMinutesAgo = new Date(currentTime.getTime() - 2 * 60 * 1000); // Changed to 2 minutes
    
    // Check power sensors
    const machinesWithPowerSensors = new Set();
    pinMappings.forEach(mapping => {
      if (mapping.sensorId && mapping.sensorId.sensorType === 'power') {
        machinesWithPowerSensors.add(mapping.sensorId.machineId._id.toString());
      }
    });

    for (const machineId of machinesWithPowerSensors) {
    const lastPowerTime = machineLastPowerSignal.get(machineId);
    if (lastPowerTime && lastPowerTime < twoMinutesAgo && !pendingStoppages.has(machineId)) {
      pendingStoppages.set(machineId, {
        startTime: lastPowerTime,
        detectedAt: currentTime
      });
      
      await recordPendingStoppage(machineId, lastPowerTime, currentTime, io);
    }
  }
    
    
    // Get all machines with unit-cycle sensors
    const machinesWithCycleSensors = new Set();
    pinMappings.forEach(mapping => {
      if (mapping.sensorId && mapping.sensorId.sensorType === 'unit-cycle') {
        machinesWithCycleSensors.add(mapping.sensorId.machineId._id.toString());
      }
    });

    for (const machineId of machinesWithCycleSensors) {
      const lastCycleTime = machineLastCycleSignal.get(machineId);
      
      if (lastCycleTime && lastCycleTime < twoMinutesAgo && !pendingStoppages.has(machineId)) {
        // Mark as pending stoppage and emit event for user to categorize
        pendingStoppages.set(machineId, {
          startTime: lastCycleTime,
          detectedAt: currentTime
        });

        await recordPendingStoppage(machineId, lastCycleTime, currentTime, io);
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