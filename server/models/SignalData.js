const mongoose = require('mongoose');
const Machine = require('./Machine');

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
  }
}, {
  timestamps: true
});

signalDataSchema.index({ sensorId: 1, timestamp: -1 });
signalDataSchema.index({ machineId: 1, timestamp: -1 });

signalDataSchema.pre('save', async function(next) {
  if (!mongoose.Types.ObjectId.isValid(this.machineId)) {
    const machineExists = await Machine.exists({ _id: this.machineId });
    if (!machineExists) {
      throw new Error('Invalid machine reference');
    }
  }
  next();
});

module.exports = mongoose.model('SignalData', signalDataSchema);