const express = require('express');
const Sensor = require('../models/Sensor');
const SensorPinMapping = require('../models/SensorPinMapping');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// Get all sensors
router.get('/', auth, async (req, res) => {
  try {
    const sensors = await Sensor.find({ isActive: true }).populate('machineId');
    res.json(sensors);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get sensors by machine
router.get('/machine/:machineId', auth, async (req, res) => {
  try {
    const sensors = await Sensor.find({ 
      machineId: req.params.machineId, 
      isActive: true 
    }).populate('machineId');
    res.json(sensors);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create sensor (Admin only)
router.post('/', auth, adminAuth, async (req, res) => {
  try {
    const sensor = new Sensor(req.body);
    await sensor.save();
    res.status(201).json(sensor);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Map sensor to pin (Admin only)
router.post('/pin-mapping', auth, adminAuth, async (req, res) => {
  try {
    const { sensorId, pinId } = req.body;
    
    // Check if pin is already occupied
    const existingMapping = await SensorPinMapping.findOne({ pinId, isActive: true });
    if (existingMapping) {
      return res.status(400).json({ message: 'Pin is already occupied' });
    }

    // Check if sensor is already mapped
    const existingSensorMapping = await SensorPinMapping.findOne({ sensorId, isActive: true });
    if (existingSensorMapping) {
      return res.status(400).json({ message: 'Sensor is already mapped to a pin' });
    }

    const mapping = new SensorPinMapping({ sensorId, pinId });
    await mapping.save();
    res.status(201).json(mapping);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get pin mappings
router.get('/pin-mappings', auth, adminAuth, async (req, res) => {
  try {
    const mappings = await SensorPinMapping.find({ isActive: true })
      .populate('sensorId');
    res.json(mappings);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;