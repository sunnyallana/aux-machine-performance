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
    status: String,
    operatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    moldId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Mold'
    },
    stoppages: [{
      reason: String,
      description: String,
      sapNotificationNumber: String, // For breakdown stoppages
      startTime: Date,
      endTime: Date,
      duration: Number,
      isPending: { type: Boolean, default: false },
      isClassified: { type: Boolean, default: false }
    }],
    runningMinutes: {
      type: Number,
      default: 0
    },
    stoppageMinutes: {
      type: Number,
      default: 0
    }
  }],
  lastActivityTime: {
    type: Date,
    default: Date.now
  }
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

productionRecordSchema.pre('save', function(next) {
  this.hourlyData.forEach(hour => {
    // Cap times at 60 minutes
    hour.runningMinutes = Math.min(60, hour.runningMinutes || 0);
    hour.stoppageMinutes = Math.min(60, hour.stoppageMinutes || 0);
    
    // Calculate from actual stoppages if needed
    if (hour.stoppages.length > 0) {
      const calculated = hour.stoppages.reduce(
        (sum, s) => sum + (s.duration || 0), 0
      );
      hour.stoppageMinutes = Math.min(60, calculated);
    }
  });
  next();
});

module.exports = mongoose.model('ProductionRecord', productionRecordSchema);