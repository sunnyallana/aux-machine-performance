const mongoose = require('mongoose');

const configSchema = new mongoose.Schema({
  plc: {
    ip: { type: String, default: '192.168.1.11' },
    rack: { type: Number, default: 0 },
    slot: { type: Number, default: 1 }
  },
  signalTimeouts: {
    powerSignalTimeout: { type: Number, default: 5 },
    cycleSignalTimeout: { type: Number, default: 2 }
  },
  shifts: [{
    name: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    isActive: { type: Boolean, default: true }
  }],
  email: {
    senderEmail: { type: String, default: 'admin@dawlance.com' },
    senderPassword: { type: String, default: 'admin123' },
    recipients: [{ type: String }]
  },

  metricsThresholds: {
    oee: {
      excellent: { type: Number, default: 85 },
      good: { type: Number, default: 70 },
      fair: { type: Number, default: 50 },
    },
    availability: {
      excellent: { type: Number, default: 90 },
      good: { type: Number, default: 80 },
      fair: { type: Number, default: 70 },
    },
    quality: {
      excellent: { type: Number, default: 95 },
      good: { type: Number, default: 90 },
      fair: { type: Number, default: 85 },
    },
    performance: {
      excellent: { type: Number, default: 90 },
      good: { type: Number, default: 80 },
      fair: { type: Number, default: 70 },
    },
    mtbf: {
      excellent: { type: Number, default: 500 },
      good: { type: Number, default: 300 },
      fair: { type: Number, default: 150 },
    },
    mttr: {
      excellent: { type: Number, default: 20 },
      good: { type: Number, default: 40 },
      fair: { type: Number, default: 60 },
    },
    reliability: {
      excellent: { type: Number, default: 10 },
      good: { type: Number, default: 5 },
      fair: { type: Number, default: 2 },
    }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Config', configSchema);