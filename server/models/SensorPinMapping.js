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
  }
}, {
  timestamps: true
});

// Only enforce unique pinId for active mappings
sensorPinMappingSchema.index(
  { pinId: 1 }, 
  { 
    unique: true, 
  }
);

module.exports = mongoose.model('SensorPinMapping', sensorPinMappingSchema);