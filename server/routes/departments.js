const express = require('express');
const Department = require('../models/Department');
const Machine = require('../models/Machine');
const Molds = require('../models/Mold');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// Get all departments
router.get('/', auth, async (req, res) => {
  try {
    let query = { isActive: true };
    
    if (req.user.role === 'operator' && req.user.departmentId) {
      query._id = req.user.departmentId._id;
    }

    const departments = await Department.find(query).lean();
    
    // Add machine counts to each department
    const departmentsWithCounts = await Promise.all(departments.map(async dept => {
      const machineCount = await Machine.countDocuments({ 
        departmentId: dept._id, 
        isActive: true 
      });
      return { ...dept, machineCount };
    }));

    res.json(departmentsWithCounts);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get department by ID with machines
router.get('/:id', auth, async (req, res) => {
  try {
    // Check if operator is accessing their own department
    if (req.user.role === 'operator' && req.user.departmentId?._id.toString() !== req.params.id) {
      return res.status(403).json({ message: 'Access denied to this department' });
    }

    const department = await Department.findById(req.params.id);
    if (!department) {
      return res.status(404).json({ message: 'Department not found' });
    }

    const machines = await Machine.find({ departmentId: req.params.id, isActive: true });
    
    res.json({
      ...department.toObject(),
      machines
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create department (Admin only)
router.post('/', auth, adminAuth, async (req, res) => {
  try {
    const department = new Department(req.body);
    await department.save();
    res.status(201).json(department);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update department (Admin only)
router.put('/:id', auth, adminAuth, async (req, res) => {
  try {
    const department = await Department.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!department) {
      return res.status(404).json({ message: 'Department not found' });
    }
    res.json(department);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// New endpoint to get all departments (including inactive)
router.get('/admin/all', auth, adminAuth, async (req, res) => {
  try {
    const departments = await Department.find({}).lean();
    
    const departmentsWithCounts = await Promise.all(departments.map(async dept => {
      const machineCount = await Machine.countDocuments({ 
        departmentId: dept._id,
        isActive: true 
      });
      return { ...dept, machineCount };
    }));

    res.json(departmentsWithCounts);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete department (Admin only)
router.delete('/:id', auth, adminAuth, async (req, res) => {
  try {
    // Check if department exists
    const department = await Department.findById(req.params.id);
    if (!department) {
      return res.status(404).json({ message: 'Department not found' });
    }

    // Delete associated machines first
    await Machine.deleteMany({ departmentId: req.params.id });

    // Delete associated molds first
    await Molds.deleteMany({ departmentId: req.params.id });

    // Then delete department
    await Department.findByIdAndDelete(req.params.id);

    res.json({ message: 'Department, associated machines, and associated molds deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});


module.exports = router;