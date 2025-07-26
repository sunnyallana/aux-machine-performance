const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['admin', 'operator'],
    required: true
  },
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: function() {
      return this.role === 'operator';
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      if (ret.departmentId && typeof ret.departmentId === 'object') {
        ret.departmentId = ret.departmentId._id;
      }
      return ret;
    }
  }
});

userSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

userSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret._id;
    delete ret.__v;
  }
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  // Only hash if password is modified
  if (this.password && this.password.trim() !== '') {
    this.password = await bcrypt.hash(this.password, 12);
  }
  next();
});


userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);