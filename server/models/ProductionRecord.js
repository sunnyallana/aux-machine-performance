const mongoose = require('mongoose');

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

module.exports = mongoose.model('ProductionRecord', productionRecordSchema);