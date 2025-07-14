const express = require('express');
const SignalData = require('../models/SignalData');
const SensorPinMapping = require('../models/SensorPinMapping');
const ProductionRecord = require('../models/ProductionRecord');
const Machine = require('../models/Machine');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Store for tracking production cycles
const productionTracker = {
  lastCycleStates: new Map(), // pin -> boolean
  hourlyCounts: new Map(),    // machineId -> count
  lastResetTime: new Date()
};

// Reset hourly counters
const resetHourlyCounters = () => {
  const now = new Date();
  const currentHour = now.getHours();
  const lastResetHour = productionTracker.lastResetTime.getHours();
  
  if (currentHour !== lastResetHour) {
    console.log(`Resetting hourly counters at ${now.toISOString()}`);
    productionTracker.hourlyCounts.clear();
    productionTracker.lastResetTime = now;
  }
};

// Process signal and update production
const processSignalForProduction = async (pinId, value, timestamp) => {
  try {
    // Find sensor mapping for this pin
    const mapping = await SensorPinMapping.findOne({ pinId })
      .populate({
        path: 'sensorId',
        populate: {
          path: 'machineId',
          populate: {
            path: 'departmentId'
          }
        }
      });

    if (!mapping || !mapping.sensorId) {
      console.log(`No sensor mapping found for pin ${pinId}`);
      return null;
    }

    const sensor = mapping.sensorId;
    const machine = sensor.machineId;
    
    if (!machine) {
      console.log(`No machine found for sensor ${sensor.name}`);
      return null;
    }

    // Only process unit-cycle sensors for production counting
    if (sensor.sensorType === 'unit-cycle') {
      const lastState = productionTracker.lastCycleStates.get(pinId) || false;
      
      // Detect rising edge (0 -> 1) for unit counting
      if (value === 1 && !lastState) {
        // Reset hourly counters if needed
        resetHourlyCounters();
        
        // Increment production count
        const currentCount = productionTracker.hourlyCounts.get(machine._id) || 0;
        productionTracker.hourlyCounts.set(machine._id, currentCount + 1);
        
        console.log(`Unit produced on machine ${machine.name} (${machine._id}). Total this hour: ${currentCount + 1}`);
        
        // Update or create production record
        await updateProductionRecord(machine._id, currentCount + 1, timestamp);
        
        // Update machine status to running
        await Machine.findByIdAndUpdate(machine._id, { status: 'running' });
      }
      
      // Update last state
      productionTracker.lastCycleStates.set(pinId, value === 1);
    }

    return {
      sensorId: sensor._id,
      machineId: machine._id,
      departmentId: machine.departmentId._id,
      sensorType: sensor.sensorType,
      sensorName: sensor.name,
      machineName: machine.name,
      departmentName: machine.departmentId.name
    };

  } catch (error) {
    console.error(`Error processing signal for pin ${pinId}:`, error);
    return null;
  }
};

// Update production record
const updateProductionRecord = async (machineId, unitsProduced, timestamp) => {
  try {
    const now = new Date(timestamp);
    const startOfHour = new Date(now);
    startOfHour.setMinutes(0, 0, 0);
    
    const endOfHour = new Date(startOfHour);
    endOfHour.setHours(endOfHour.getHours() + 1);

    // Find existing record for this hour
    let record = await ProductionRecord.findOne({
      machineId,
      startTime: { $gte: startOfHour, $lt: endOfHour }
    });

    const hourData = {
      hour: now.getHours(),
      unitsProduced,
      defectiveUnits: 0,
      status: 'running'
    };

    if (record) {
      // Update existing record
      record.unitsProduced = unitsProduced;
      record.updatedAt = now;
      
      // Update or add hourly data
      const existingHourIndex = record.hourlyData.findIndex(h => h.hour === now.getHours());
      if (existingHourIndex >= 0) {
        record.hourlyData[existingHourIndex] = hourData;
      } else {
        record.hourlyData.push(hourData);
      }
      
      await record.save();
    } else {
      // Create new record
      record = new ProductionRecord({
        machineId,
        unitsProduced,
        defectiveUnits: 0,
        startTime: startOfHour,
        hourlyData: [hourData],
        createdAt: now,
        updatedAt: now
      });
      
      await record.save();
    }

    console.log(`Updated production record for machine ${machineId}: ${unitsProduced} units`);
    return record;

  } catch (error) {
    console.error(`Error updating production record:`, error);
    throw error;
  }
};

// Batch signal processing endpoint (for daemon)
router.post('/batch', async (req, res) => {
  try {
    const { signals, source, timestamp } = req.body;
    
    if (!signals || !Array.isArray(signals)) {
      return res.status(400).json({ message: 'Invalid signals data' });
    }

    console.log(`Received ${signals.length} signals from ${source || 'unknown'}`);
    
    const processedSignals = [];
    const productionUpdates = [];

    for (const signal of signals) {
      const { pin, value, timestamp: signalTimestamp } = signal;
      
      if (!pin || value === undefined) {
        console.log('Skipping invalid signal:', signal);
        continue;
      }

      // Process signal for production tracking
      const processingResult = await processSignalForProduction(pin, value, signalTimestamp);
      
      if (processingResult) {
        // Store raw signal data
        const signalData = new SignalData({
          sensorId: processingResult.sensorId,
          machineId: processingResult.machineId,
          value: value,
          timestamp: new Date(signalTimestamp),
          metadata: {
            pin,
            sensorType: processingResult.sensorType,
            source: source || 'daemon'
          }
        });

        await signalData.save();
        processedSignals.push({
          pin,
          value,
          sensor: processingResult.sensorName,
          machine: processingResult.machineName,
          department: processingResult.departmentName
        });

        // Track production updates for response
        if (processingResult.sensorType === 'unit-cycle' && value === 1) {
          const currentCount = productionTracker.hourlyCounts.get(processingResult.machineId) || 0;
          productionUpdates.push({
            machineId: processingResult.machineId,
            machineName: processingResult.machineName,
            unitsProduced: currentCount
          });
        }
      }
    }

    res.status(201).json({
      message: `Processed ${processedSignals.length} signals successfully`,
      processedSignals,
      productionUpdates,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error processing batch signals:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

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

// Get current production status
router.get('/production/status', auth, async (req, res) => {
  try {
    resetHourlyCounters();
    
    const status = [];
    for (const [machineId, count] of productionTracker.hourlyCounts.entries()) {
      const machine = await Machine.findById(machineId).populate('departmentId');
      if (machine) {
        status.push({
          machineId,
          machineName: machine.name,
          departmentName: machine.departmentId.name,
          unitsThisHour: count,
          lastUpdate: new Date().toISOString()
        });
      }
    }

    res.json({
      currentHour: new Date().getHours(),
      lastReset: productionTracker.lastResetTime.toISOString(),
      machines: status
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Add signal data (this would be called by the Python daemon)
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