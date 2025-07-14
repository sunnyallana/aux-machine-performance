const mongoose = require('mongoose');

const signalDataSchema = new mongoose.Schema({
  sensorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sensor',
    required: true
  },
  machineId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Machine',
    required: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  metadata: {
    pin: String,
    sensorType: String,
    source: String
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
signalDataSchema.index({ sensorId: 1, timestamp: -1 });
signalDataSchema.index({ machineId: 1, timestamp: -1 });
signalDataSchema.index({ timestamp: -1 });

module.exports = mongoose.model('SignalData', signalDataSchema);