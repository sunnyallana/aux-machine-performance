const mongoose = require('mongoose');

const sensorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  machineId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Machine',
    required: true
  },
  sensorType: {
    type: String,
    enum: ['power', 'unit-cycle', 'temperature', 'pressure', 'vibration'],
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Sensor', sensorSchema);