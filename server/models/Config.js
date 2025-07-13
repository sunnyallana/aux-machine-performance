const mongoose = require('mongoose');

const configSchema = new mongoose.Schema({
  plc: {
    ip: { type: String, default: '192.168.1.11' },
    rack: { type: Number, default: 0 },
    slot: { type: Number, default: 1 }
  },
  email: {
    senderEmail: { type: String, default: 'admin@dawlance.com' },
    senderPassword: { type: String, default: 'admin123' },
    recipients: [{ type: String }]
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Config', configSchema);