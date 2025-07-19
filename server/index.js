const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const socketIo = require('socket.io');

const authRoutes = require('./routes/auth');
const departmentRoutes = require('./routes/departments');
const machineRoutes = require('./routes/machines');
const sensorRoutes = require('./routes/sensors');
const signalRoutes = require('./routes/signals');
const configRoutes = require('./routes/config');
const analyticsRoutes = require('./routes/analytics');
const userRoutes = require('./routes/users');
const moldRoutes = require('./routes/molds.js');
const reportRoutes = require('./routes/reports');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Make io available to routes
app.set('io', io);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/industrial_iot')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
  
  // Join machine-specific rooms for targeted updates
  socket.on('join-machine', (machineId) => {
    socket.join(`machine-${machineId}`);
    console.log(`Socket ${socket.id} joined machine-${machineId}`);
  });
  
  socket.on('leave-machine', (machineId) => {
    socket.leave(`machine-${machineId}`);
    console.log(`Socket ${socket.id} left machine-${machineId}`);
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/machines', machineRoutes);
app.use('/api/sensors', sensorRoutes);
app.use('/api/signals', signalRoutes);
app.use('/api/config', configRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/users', userRoutes);
app.use('/api/molds', moldRoutes);
app.use('/api/reports', reportRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});