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

// Get all sensors for admin (including inactive)
router.get('/admin/all', auth, adminAuth, async (req, res) => {
  try {
    const sensors = await Sensor.find({})
      .populate({
        path: 'machineId',
        populate: { path: 'departmentId' }
      });
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

// Update sensor (Admin only)
router.put('/:id', auth, adminAuth, async (req, res) => {
  try {
    const sensor = await Sensor.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    ).populate('machineId');
    
    if (!sensor) {
      return res.status(404).json({ message: 'Sensor not found' });
    }
    
    res.json(sensor);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/:id', auth, adminAuth, async (req, res) => {
  try {
    // Delete any pin mappings first
    await SensorPinMapping.deleteMany({ sensorId: req.params.id });
    
    // Then hard delete the sensor
    const sensor = await Sensor.findByIdAndDelete(req.params.id);
    
    if (!sensor) {
      return res.status(404).json({ message: 'Sensor not found' });
    }
    
    res.json({ message: 'Sensor permanently deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Map sensor to pin (Admin only)
router.post('/pin-mapping', auth, adminAuth, async (req, res) => {
  try {
    const { sensorId, pinId } = req.body;
    
    // Check if pin is already occupied
    const existingMapping = await SensorPinMapping.findOne({ pinId });
    if (existingMapping) {
      return res.status(400).json({ message: 'Pin is already occupied' });
    }

    // Check if sensor is already mapped
    const existingSensorMapping = await SensorPinMapping.findOne({ sensorId });
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
    const mappings = await SensorPinMapping.find({})
      .populate({
        path: 'sensorId',
        populate: { path: 'machineId' }  // Populate machineId for sensor
      });
    res.json(mappings);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete pin mapping (Admin only)
router.delete('/pin-mapping/:id', auth, adminAuth, async (req, res) => {
  try {
    const mapping = await SensorPinMapping.findByIdAndDelete(req.params.id);
    
    if (!mapping) {
      return res.status(404).json({ message: 'Pin mapping not found' });
    }
    
    res.json({ message: 'Pin mapping permanently deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;