const mongoose = require('mongoose');

const configSchema = new mongoose.Schema({
  plc: {
    ip: { type: String, required: true },
    rack: { type: Number, required: true },
    slot: { type: Number, required: true }
  },
  email: {
    senderEmail: { type: String, required: true },
    senderPassword: { type: String, required: true },
    recipients: [{ type: String }]
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Config', configSchema);