const express = require('express');
const mongoose = require('mongoose');
const Report = require('../models/Report');
const ProductionRecord = require('../models/ProductionRecord');
const Machine = require('../models/Machine');
const Department = require('../models/Department');
const Config = require('../models/Config');
const { auth, adminAuth } = require('../middleware/auth');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');


const router = express.Router();

// Generate report
router.post('/generate', auth, async (req, res) => {
  try {
    const { type, startDate, endDate, departmentId, machineId } = req.body;
    
    const report = await generateReport({
      type,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      departmentId,
      machineId,
      generatedBy: req.user._id
    });

    res.json(report);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get reports
router.get('/', auth, async (req, res) => {
  try {
    const { type, departmentId, machineId } = req.query;
    
    const query = {};
    if (type) query.type = type;
    if (departmentId) query.departmentId = departmentId;
    if (machineId) query.machineId = machineId;

    const reports = await Report.find(query)
      .populate('departmentId machineId generatedBy')
      .sort({ createdAt: -1 });

    res.json(reports);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Email report
router.post('/:id/email', auth, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate('departmentId machineId generatedBy');
    
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    await emailReport(report);
    
    report.emailSent = true;
    report.emailSentAt = new Date();
    await report.save();

    res.json({ message: 'Report emailed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Download report as PDF
router.get('/:id/pdf', auth, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate('departmentId machineId generatedBy');
    
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    const pdfBuffer = await generatePDF(report);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${report.type}-report-${report.period.start.toISOString().split('T')[0]}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

async function generateReport({ type, startDate, endDate, departmentId, machineId, generatedBy }) {
  // Validate ObjectIds
  if (departmentId && !mongoose.Types.ObjectId.isValid(departmentId)) {
    throw new Error('Invalid department ID');
  }
  if (machineId && !mongoose.Types.ObjectId.isValid(machineId)) {
    throw new Error('Invalid machine ID');
  }
  
  const query = {
    startTime: { $gte: startDate, $lte: endDate }
  };
  
  if (departmentId) {
    const machines = await Machine.find({ departmentId });
    query.machineId = { $in: machines.map(m => m._id) };
  }
  
  if (machineId) {
    query.machineId = machineId;
  }

  const productionRecords = await ProductionRecord.find(query)
    .populate('machineId operatorId moldId');

  // Get shifts configuration
  const config = await Config.findOne();
  const shifts = config?.shifts || [];

  // Calculate metrics
  const metrics = calculateMetrics(productionRecords, shifts, startDate, endDate);

  const report = new Report({
    type,
    period: { start: startDate, end: endDate },
    departmentId: departmentId ? new mongoose.Types.ObjectId(departmentId) : undefined,
    machineId: machineId ? new mongoose.Types.ObjectId(machineId) : undefined,
    metrics,
    shiftData: metrics.shiftData,
    generatedBy
  });

  await report.save();
  return report;
}

function calculateMetrics(productionRecords, shifts, startDate, endDate) {
  let totalUnitsProduced = 0;
  let totalDefectiveUnits = 0;
  let totalRunningMinutes = 0;
  let totalStoppageMinutes = 0;
  let totalStoppages = 0;

  const shiftMetrics = {};
  
  // Initialize shift metrics
  shifts.forEach(shift => {
    shiftMetrics[shift.name] = {
      shiftName: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      metrics: {
        oee: 0,
        unitsProduced: 0,
        defectiveUnits: 0,
        runningMinutes: 0,
        stoppageMinutes: 0
      }
    };
  });

  productionRecords.forEach(record => {
    totalUnitsProduced += record.unitsProduced || 0;
    totalDefectiveUnits += record.defectiveUnits || 0;

    record.hourlyData.forEach(hourData => {
      totalRunningMinutes += hourData.runningMinutes || 0;
      totalStoppageMinutes += hourData.stoppageMinutes || 0;
      totalStoppages += hourData.stoppages?.length || 0;

      // Calculate shift-wise metrics
      const hour = hourData.hour;
      const shift = getShiftForHour(hour, shifts);
      if (shift && shiftMetrics[shift.name]) {
        shiftMetrics[shift.name].metrics.unitsProduced += hourData.unitsProduced || 0;
        shiftMetrics[shift.name].metrics.defectiveUnits += hourData.defectiveUnits || 0;
        shiftMetrics[shift.name].metrics.runningMinutes += hourData.runningMinutes || 0;
        shiftMetrics[shift.name].metrics.stoppageMinutes += hourData.stoppageMinutes || 0;
      }
    });
  });

  // Calculate overall metrics
  const totalMinutes = totalRunningMinutes + totalStoppageMinutes;
  const availability = totalMinutes > 0 ? (totalRunningMinutes / totalMinutes) : 0;
  const quality = totalUnitsProduced > 0 ? (totalUnitsProduced - totalDefectiveUnits) / totalUnitsProduced : 0;
  const performance = 0.85; // This should be calculated based on ideal cycle time
  const oee = availability * quality * performance;

  const mtbf = totalStoppages > 0 ? totalRunningMinutes / totalStoppages : 0;
  const mttr = totalStoppages > 0 ? totalStoppageMinutes / totalStoppages : 0;

  // Calculate shift OEE
  Object.values(shiftMetrics).forEach(shiftData => {
    const shiftTotalMinutes = shiftData.metrics.runningMinutes + shiftData.metrics.stoppageMinutes;
    const shiftAvailability = shiftTotalMinutes > 0 ? (shiftData.metrics.runningMinutes / shiftTotalMinutes) : 0;
    const shiftQuality = shiftData.metrics.unitsProduced > 0 ? 
      (shiftData.metrics.unitsProduced - shiftData.metrics.defectiveUnits) / shiftData.metrics.unitsProduced : 0;
    shiftData.metrics.oee = Math.round(shiftAvailability * shiftQuality * performance * 100);
  });

  return {
    oee: Math.round(oee * 100),
    mtbf: Math.round(mtbf),
    mttr: Math.round(mttr),
    availability: Math.round(availability * 100),
    quality: Math.round(quality * 100),
    performance: Math.round(performance * 100),
    totalUnitsProduced,
    totalDefectiveUnits,
    totalRunningMinutes,
    totalStoppageMinutes,
    totalStoppages,
    shiftData: Object.values(shiftMetrics)
  };
}

function getShiftForHour(hour, shifts) {
  return shifts.find(shift => {
    const startHour = parseInt(shift.startTime.split(':')[0]);
    const endHour = parseInt(shift.endTime.split(':')[0]);
    
    if (startHour <= endHour) {
      return hour >= startHour && hour < endHour;
    } else {
      // Night shift crossing midnight
      return hour >= startHour || hour < endHour;
    }
  });
}

async function emailReport(report) {
  const config = await Config.findOne();
  if (!config || !config.email.recipients.length) {
    throw new Error('Email configuration not found');
  }

  const transporter = nodemailer.createTransporter({
    service: 'gmail',
    auth: {
      user: config.email.senderEmail,
      pass: config.email.senderPassword
    }
  });

  const pdfBuffer = await generatePDF(report);

  const mailOptions = {
    from: config.email.senderEmail,
    to: config.email.recipients.join(','),
    subject: `${report.type.toUpperCase()} Production Report - ${report.period.start.toDateString()}`,
    html: generateEmailHTML(report),
    attachments: [{
      filename: `${report.type}-report-${report.period.start.toISOString().split('T')[0]}.pdf`,
      content: pdfBuffer
    }]
  };

  await transporter.sendMail(mailOptions);
}

function generateEmailHTML(report) {
  return `
    <h2>${report.type.toUpperCase()} Production Report</h2>
    <p><strong>Period:</strong> ${report.period.start.toDateString()} to ${report.period.end.toDateString()}</p>
    <p><strong>Generated by:</strong> ${report.generatedBy.username}</p>
    
    <h3>Key Metrics</h3>
    <ul>
      <li><strong>OEE:</strong> ${report.metrics.oee}%</li>
      <li><strong>MTBF:</strong> ${report.metrics.mtbf} minutes</li>
      <li><strong>MTTR:</strong> ${report.metrics.mttr} minutes</li>
      <li><strong>Total Units Produced:</strong> ${report.metrics.totalUnitsProduced}</li>
      <li><strong>Defective Units:</strong> ${report.metrics.totalDefectiveUnits}</li>
    </ul>
    
    <p>Please find the detailed PDF report attached.</p>
  `;
}


async function generatePDF(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const buffers = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      resolve(pdfData);
    });

    // Add Dawlance logo at the top center
    const logoPath = path.join(__dirname, '../assets/dawlance-logo.png');
    
    // Header with logo
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 
        doc.page.width / 2 - 100, // Center horizontally
        50, 
        { width: 200, align: 'center' }
      );
      doc.moveDown(2);
    } else {
      doc.fontSize(20).text('Dawlance', { align: 'center' });
      doc.moveDown();
    }

    // Report title and details
    doc.fontSize(20).text(`${report.type.toUpperCase()} Production Report`, { align: 'center' });
    doc.fontSize(12).text(`Period: ${report.period.start.toDateString()} to ${report.period.end.toDateString()}`, { align: 'center' });
    doc.text(`Generated: ${new Date().toDateString()}`, { align: 'center' });
    doc.text(`Generated by: ${report.generatedBy.username}`, { align: 'center' });
    doc.moveDown(2);

    // Add a horizontal line
    doc.moveTo(50, doc.y)
       .lineTo(doc.page.width - 50, doc.y)
       .stroke();
    doc.moveDown();

    // Metrics section
    doc.fontSize(16).text('Key Metrics', { align: 'left' });
    doc.moveDown();

    // Create a metrics table
    const metricsStartY = doc.y;
    const col1 = 50;
    const col2 = 250;
    const rowHeight = 25;

    // Table headers
    doc.font('Helvetica-Bold');
    doc.text('Metric', col1, metricsStartY);
    doc.text('Value', col2, metricsStartY);
    doc.font('Helvetica');

    // Table rows
    const metrics = [
      { name: 'OEE', value: `${report.metrics.oee}%` },
      { name: 'MTBF', value: `${report.metrics.mtbf} minutes` },
      { name: 'MTTR', value: `${report.metrics.mttr} minutes` },
      { name: 'Availability', value: `${report.metrics.availability}%` },
      { name: 'Quality', value: `${report.metrics.quality}%` },
      { name: 'Performance', value: `${report.metrics.performance}%` },
      { name: 'Total Units Produced', value: report.metrics.totalUnitsProduced },
      { name: 'Defective Units', value: report.metrics.totalDefectiveUnits },
      { name: 'Running Time', value: `${Math.floor(report.metrics.totalRunningMinutes / 60)}h ${report.metrics.totalRunningMinutes % 60}m` },
      { name: 'Stoppage Time', value: `${Math.floor(report.metrics.totalStoppageMinutes / 60)}h ${report.metrics.totalStoppageMinutes % 60}m` }
    ];

    metrics.forEach((metric, i) => {
      const y = metricsStartY + (i + 1) * rowHeight;
      doc.text(metric.name, col1, y);
      doc.text(metric.value, col2, y);
    });

    // Shift Data section
    if (report.shiftData && report.shiftData.length > 0) {
      // Check if we need a new page
      if (doc.y + 300 > doc.page.height) {
        doc.addPage();
      } else {
        doc.moveDown(2);
      }

      doc.fontSize(16).text('Shift-wise Performance', { align: 'left' });
      doc.moveDown();

      // Create shift performance tables
      report.shiftData.forEach((shift, index) => {
        // Check if we need a new page before adding shift
        if (doc.y + 200 > doc.page.height) {
          doc.addPage();
        }

        const shiftTitle = `${shift.shiftName} (${shift.startTime} - ${shift.endTime})`;
        doc.fontSize(14).text(shiftTitle);
        doc.moveDown(0.5);

        // Shift metrics table
        const shiftMetrics = [
          { name: 'OEE', value: `${shift.metrics.oee}%` },
          { name: 'Units Produced', value: shift.metrics.unitsProduced },
          { name: 'Defective Units', value: shift.metrics.defectiveUnits },
          { name: 'Running Time', value: `${Math.floor(shift.metrics.runningMinutes / 60)}h ${shift.metrics.runningMinutes % 60}m` },
          { name: 'Stoppage Time', value: `${Math.floor(shift.metrics.stoppageMinutes / 60)}h ${shift.metrics.stoppageMinutes % 60}m` }
        ];

        const shiftStartY = doc.y;
        shiftMetrics.forEach((metric, i) => {
          const y = shiftStartY + i * rowHeight;
          doc.text(metric.name, col1, y);
          doc.text(metric.value, col2, y);
        });

        doc.moveDown(shiftMetrics.length + 1);
      });
    }

    // Add footer after all content is added
    // Use PDFKit's built-in bufferedPageRange to get actual page info
    const range = doc.bufferedPageRange();
    for (let pageNum = range.start; pageNum < range.start + range.count; pageNum++) {
      doc.switchToPage(pageNum);
      doc.fontSize(10).text(
        `Page ${pageNum - range.start + 1} of ${range.count}`,
        doc.page.width - 100,
        doc.page.height - 30,
        { align: 'right' }
      );
    }

    doc.end();
  });
}

module.exports = router;