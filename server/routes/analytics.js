const express = require('express');
const SignalData = require('../models/SignalData');
const ProductionRecord = require('../models/ProductionRecord');
const StoppageRecord = require('../models/StoppageRecord');
const Machine = require('../models/Machine');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Get production timeline for a machine (7 days)
router.get('/production-timeline/:machineId', auth, async (req, res) => {
  try {
    const { machineId } = req.params;
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 7);

    // Check access permissions
    const machine = await Machine.findById(machineId).populate('departmentId');
    if (!machine) {
      return res.status(404).json({ message: 'Machine not found' });
    }

    if (req.user.role === 'operator' && req.user.departmentId?._id.toString() !== machine.departmentId._id.toString()) {
      return res.status(403).json({ message: 'Access denied to this machine' });
    }

    // Get production records
    const productionRecords = await ProductionRecord.find({
      machineId,
      startTime: { $gte: startDate, $lte: endDate }
    }).populate('operatorId moldId');

    // Get stoppage records
    const stoppageRecords = await StoppageRecord.find({
      machineId,
      startTime: { $gte: startDate, $lte: endDate }
    }).populate('reportedBy');

    // Generate timeline data
    const timeline = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dayStart = new Date(d);
      const dayEnd = new Date(d);
      dayEnd.setHours(23, 59, 59, 999);

      const dayData = {
        date: dayStart.toISOString().split('T')[0],
        hours: []
      };

      for (let hour = 0; hour < 24; hour++) {
        const hourStart = new Date(dayStart);
        hourStart.setHours(hour, 0, 0, 0);
        const hourEnd = new Date(dayStart);
        hourEnd.setHours(hour, 59, 59, 999);

        // Find production record for this hour
        const productionRecord = productionRecords.find(record => {
          return record.hourlyData?.some(hourData => 
            hourData.hour === hour &&
            new Date(record.startTime).toDateString() === dayStart.toDateString()
          );
        });

        // Find stoppage records for this hour
        const stoppages = stoppageRecords.filter(stoppage => {
          const stoppageStart = new Date(stoppage.startTime);
          const stoppageEnd = stoppage.endTime ? new Date(stoppage.endTime) : new Date();
          return stoppageStart <= hourEnd && stoppageEnd >= hourStart;
        });

        const hourData = productionRecord?.hourlyData?.find(h => h.hour === hour);

        dayData.hours.push({
          hour,
          unitsProduced: hourData?.unitsProduced || 0,
          defectiveUnits: hourData?.defectiveUnits || 0,
          status: hourData?.status || 'stopped',
          operator: productionRecord?.operatorId,
          mold: productionRecord?.moldId,
          stoppages: stoppages.map(s => ({
            id: s._id,
            reason: s.reason,
            description: s.description,
            startTime: s.startTime,
            endTime: s.endTime,
            reportedBy: s.reportedBy
          }))
        });
      }

      timeline.push(dayData);
    }

    res.json(timeline);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Add stoppage record
router.post('/stoppage', auth, async (req, res) => {
  try {
    const stoppage = new StoppageRecord({
      ...req.body,
      reportedBy: req.user._id
    });
    await stoppage.save();
    res.status(201).json(stoppage);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update stoppage record
router.put('/stoppage/:id', auth, async (req, res) => {
  try {
    const stoppage = await StoppageRecord.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!stoppage) {
      return res.status(404).json({ message: 'Stoppage record not found' });
    }
    res.json(stoppage);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get machine statistics
router.get('/machine-stats/:machineId', auth, async (req, res) => {
  try {
    const { machineId } = req.params;
    const { period = '24h' } = req.query;

    // Check access permissions
    const machine = await Machine.findById(machineId).populate('departmentId');
    if (!machine) {
      return res.status(404).json({ message: 'Machine not found' });
    }

    if (req.user.role === 'operator' && req.user.departmentId?._id.toString() !== machine.departmentId._id.toString()) {
      return res.status(403).json({ message: 'Access denied to this machine' });
    }

    const endDate = new Date();
    const startDate = new Date(endDate);
    
    if (period === '24h') {
      startDate.setHours(startDate.getHours() - 24);
    } else if (period === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === '30d') {
      startDate.setDate(startDate.getDate() - 30);
    }

    // Calculate production statistics
    const productionRecords = await ProductionRecord.find({
      machineId,
      startTime: { $gte: startDate, $lte: endDate }
    });

    const stoppageRecords = await StoppageRecord.find({
      machineId,
      startTime: { $gte: startDate, $lte: endDate }
    });

    const totalUnitsProduced = productionRecords.reduce((sum, record) => 
      sum + record.unitsProduced, 0
    );

    const totalDefectiveUnits = productionRecords.reduce((sum, record) => 
      sum + record.defectiveUnits, 0
    );

    // Calculate OEE, MTTR, MTBF
    const totalRunTime = productionRecords.reduce((sum, record) => {
      if (record.endTime) {
        return sum + (new Date(record.endTime) - new Date(record.startTime));
      }
      return sum;
    }, 0);

    const totalStoppageTime = stoppageRecords.reduce((sum, record) => {
      const endTime = record.endTime ? new Date(record.endTime) : new Date();
      return sum + (endTime - new Date(record.startTime));
    }, 0);

    const totalTime = endDate - startDate;
    const availability = totalRunTime / (totalTime - totalStoppageTime);
    const quality = totalUnitsProduced > 0 ? (totalUnitsProduced - totalDefectiveUnits) / totalUnitsProduced : 0;
    const performance = 0.8; // This would be calculated based on ideal cycle time
    const oee = availability * quality * performance;

    const mtbf = stoppageRecords.length > 0 ? totalRunTime / stoppageRecords.length : 0;
    const mttr = stoppageRecords.length > 0 ? totalStoppageTime / stoppageRecords.length : 0;

    res.json({
      totalUnitsProduced,
      totalDefectiveUnits,
      oee: Math.round(oee * 100),
      mtbf: Math.round(mtbf / (1000 * 60 * 60)), // Convert to hours
      mttr: Math.round(mttr / (1000 * 60)), // Convert to minutes
      availability: Math.round(availability * 100),
      quality: Math.round(quality * 100),
      performance: Math.round(performance * 100),
      currentStatus: machine.status
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;