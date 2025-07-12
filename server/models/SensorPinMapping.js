const mongoose = require('mongoose');

const sensorPinMappingSchema = new mongoose.Schema({
  sensorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sensor',
    required: true
  },
  pinId: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

sensorPinMappingSchema.index({ pinId: 1 }, { unique: true });

module.exports = mongoose.model('SensorPinMapping', sensorPinMappingSchema);