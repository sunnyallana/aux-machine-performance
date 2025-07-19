const mongoose = require('mongoose');

const configSchema = new mongoose.Schema({
  plc: {
    ip: { type: String, default: '192.168.1.11' },
    rack: { type: Number, default: 0 },
    slot: { type: Number, default: 1 }
  },
  signalTimeouts: {
    powerSignalTimeout: { type: Number, default: 5 }, // minutes
    cycleSignalTimeout: { type: Number, default: 2 }  // minutes
  },
  shifts: [{
    name: { type: String, required: true },
    startTime: { type: String, required: true }, // HH:MM format
    endTime: { type: String, required: true },   // HH:MM format
    isActive: { type: Boolean, default: true }
  }],
  email: {
    senderEmail: { type: String, default: 'admin@dawlance.com' },
    senderPassword: { type: String, default: 'admin123' },
    recipients: [{ type: String }]
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Config', configSchema);