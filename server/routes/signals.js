const express = require('express');
const SignalData = require('../models/SignalData');
const { auth } = require('../middleware/auth');

const router = express.Router();

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

// Add signal data (this would be called by the Rust daemon)
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