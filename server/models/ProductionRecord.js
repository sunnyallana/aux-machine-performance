const mongoose = require('mongoose');
const Machine = require('./Machine');

const productionRecordSchema = new mongoose.Schema({
  machineId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Machine',
    required: true
  },
  operatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  moldId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Mold'
  },
  unitsProduced: {
    type: Number,
    default: 0
  },
  defectiveUnits: {
    type: Number,
    default: 0
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date
  },
  hourlyData: [{
    hour: Number,
    unitsProduced: Number,
    defectiveUnits: Number,
    status: String
  }]
}, {
  timestamps: true
});

productionRecordSchema.pre('save', async function(next) {
  if (!mongoose.Types.ObjectId.isValid(this.machineId)) {
    const machineExists = await Machine.exists({ _id: this.machineId });
    if (!machineExists) {
      throw new Error('Invalid machine reference');
    }
  }
  next();
});

module.exports = mongoose.model('ProductionRecord', productionRecordSchema);