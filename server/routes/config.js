const express = require('express');
const Config = require('../models/Config');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// Get configuration
router.get('/', auth, adminAuth, async (req, res) => {
  try {
    let config = await Config.findOne();
    if (!config) {
      config = new Config({
        plc: { ip: '192.168.1.100', rack: 0, slot: 1 },
        email: { 
          senderEmail: '', 
          senderPassword: '', 
          recipients: [] 
        }
      });
      await config.save();
    }
    res.json(config);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update configuration
router.put('/', auth, adminAuth, async (req, res) => {
  try {
    let config = await Config.findOne();
    if (!config) {
      config = new Config(req.body);
    } else {
      Object.assign(config, req.body);
    }
    await config.save();
    res.json(config);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;