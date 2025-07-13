// File: routes/users.js
const express = require('express');
const User = require('../models/User');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();


// Get all users (Admin only)
router.get('/', auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find({})
      .populate('departmentId', 'name _id')
      .select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});


// Create user (Admin only)
router.post('/', auth, adminAuth, async (req, res) => {
  try {
    const { role, departmentId } = req.body;
    
    // Validate department for operators
    if (role === 'operator' && !departmentId) {
      return res.status(400).json({ message: 'Department is required for operators' });
    }
    
    // Remove departmentId for non-operators
    const userData = {
      ...req.body,
      departmentId: role === 'operator' ? departmentId : undefined
    };

    const user = new User(userData);
    await user.save();
    
    // Return user without password
    const userWithoutPassword = user.toObject();
    delete userWithoutPassword.password;
    
    res.status(201).json(userWithoutPassword);
  } catch (error) {
    let message = 'Server error';
    
    if (error.code === 11000) {
      if (error.keyPattern.username) {
        message = 'Username already exists';
      } else if (error.keyPattern.email) {
        message = 'Email already exists';
      }
    }
    
    res.status(500).json({ message, error: error.message });
  }
});

// Update user (Admin only)
router.put('/:id', auth, adminAuth, async (req, res) => {
  try {
    const { role, departmentId } = req.body;
    
    // Prepare update data
    const updateData = {
      ...req.body,
      departmentId: role === 'operator' ? departmentId : undefined
    };

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    )
    .populate('departmentId', 'name _id')
    .select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    let message = 'Server error';
    
    if (error.code === 11000) {
      if (error.keyPattern.username) {
        message = 'Username already exists';
      } else if (error.keyPattern.email) {
        message = 'Email already exists';
      }
    }
    
    res.status(500).json({ message, error: error.message });
  }
});


// Delete user (Admin only)
router.delete('/:id', auth, adminAuth, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;