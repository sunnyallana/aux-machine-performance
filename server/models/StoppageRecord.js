const mongoose = require('mongoose');

const stoppageRecordSchema = new mongoose.Schema({
  machineId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Machine',
    required: true
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date
  },
  reason: {
    type: String,
    enum: ['planned', 'mold_change', 'breakdown', 'maintenance', 'material_shortage', 'other'],
    required: true
  },
  description: {
    type: String,
    trim: true
  },
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('StoppageRecord', stoppageRecordSchema);