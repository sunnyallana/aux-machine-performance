const mongoose = require('mongoose');
const Machine = require('./Machine');

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

stoppageRecordSchema.pre('save', async function(next) {
  if (!mongoose.Types.ObjectId.isValid(this.machineId)) {
    const machineExists = await Machine.exists({ _id: this.machineId });
    if (!machineExists) {
      throw new Error('Invalid machine reference');
    }
  }
  next();
});

module.exports = mongoose.model('StoppageRecord', stoppageRecordSchema);