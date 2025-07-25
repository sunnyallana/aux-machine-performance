const express = require('express');
const mongoose = require('mongoose');
const Report = require('../models/Report');
const ProductionRecord = require('../models/ProductionRecord');
const Machine = require('../models/Machine');
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

// Delete report
router.delete('/:id', auth, adminAuth, async (req, res) => {
  try {
    const report = await Report.findByIdAndDelete(req.params.id);
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }
    res.json({ message: 'Report deleted successfully' });
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
  .populate('machineId operatorId')
  .populate({
    path: 'hourlyData.moldId',
    model: 'Mold'
  });

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

function calculateMetrics(productionRecords, shifts) {
  let totalUnitsProduced = 0;
  let totalDefectiveUnits = 0;
  let totalRunningMinutes = 0;
  let totalStoppageMinutes = 0;
  let totalExpectedUnits = 0;
  let totalStoppages = 0;
  let breakdownStoppages = 0;
  let totalBreakdownMinutes = 0;

  const shiftMetrics = {};
  
  // Initialize shift metrics
  shifts.forEach(shift => {
    shiftMetrics[shift.name] = {
      shiftName: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      metrics: {
        unitsProduced: 0,
        defectiveUnits: 0,
        runningMinutes: 0,
        stoppageMinutes: 0,
        expectedUnits: 0
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

      // Calculate expected units based on mold capacity
      if (hourData.moldId?.productionCapacityPerHour) {
        const capacityPerMinute = hourData.moldId.productionCapacityPerHour / 60;
        const expectedUnits = capacityPerMinute * (hourData.runningMinutes || 0);
        totalExpectedUnits += expectedUnits;
      }

      // Count breakdown stoppages
      hourData.stoppages?.forEach(stoppage => {
        if (stoppage.reason === 'breakdown') {
          breakdownStoppages++;
          totalBreakdownMinutes += stoppage.duration || 0;
        }
      });

      // Calculate shift-wise metrics
      const hour = hourData.hour;
      const shift = getShiftForHour(hour, shifts);
      if (shift && shiftMetrics[shift.name]) {
        shiftMetrics[shift.name].metrics.unitsProduced += hourData.unitsProduced || 0;
        shiftMetrics[shift.name].metrics.defectiveUnits += hourData.defectiveUnits || 0;
        shiftMetrics[shift.name].metrics.runningMinutes += hourData.runningMinutes || 0;
        shiftMetrics[shift.name].metrics.stoppageMinutes += hourData.stoppageMinutes || 0;
        
        // Calculate expected units for shift
        if (hourData.moldId?.productionCapacityPerHour) {
          const capacityPerMinute = hourData.moldId.productionCapacityPerHour / 60;
          shiftMetrics[shift.name].metrics.expectedUnits += 
            capacityPerMinute * (hourData.runningMinutes || 0);
        }
      }
    });
  });

  // Calculate overall metrics
  const totalMinutes = totalRunningMinutes + totalStoppageMinutes;
  const availability = totalMinutes > 0 ? (totalRunningMinutes / totalMinutes) : 0;
  const quality = totalUnitsProduced > 0 ? 
    (totalUnitsProduced - totalDefectiveUnits) / totalUnitsProduced : 0;
  const performance = totalExpectedUnits > 0 ? 
    (totalUnitsProduced / totalExpectedUnits) : 0;
  const oee = availability * quality * performance;

  // Calculate MTBF and MTTR based on breakdowns only
  const mtbf = breakdownStoppages > 0 ? totalRunningMinutes / breakdownStoppages : 0;
  const mttr = breakdownStoppages > 0 ? totalBreakdownMinutes / breakdownStoppages : 0;

  // Calculate shift OEE
  const shiftData = Object.values(shiftMetrics).map(shiftInfo => {
    const shiftMetricsData = shiftInfo.metrics;
    const shiftTotalMinutes = shiftMetricsData.runningMinutes + shiftMetricsData.stoppageMinutes;
    const shiftAvailability = shiftTotalMinutes > 0 ? 
      (shiftMetricsData.runningMinutes / shiftTotalMinutes) : 0;
    const shiftQuality = shiftMetricsData.unitsProduced > 0 ? 
      (shiftMetricsData.unitsProduced - shiftMetricsData.defectiveUnits) / shiftMetricsData.unitsProduced : 0;
    const shiftPerformance = shiftMetricsData.expectedUnits > 0 ? 
      (shiftMetricsData.unitsProduced / shiftMetricsData.expectedUnits) : 0;
    const shiftOEE = shiftAvailability * shiftQuality * shiftPerformance;

    return {
      shiftName: shiftInfo.shiftName,
      startTime: shiftInfo.startTime,
      endTime: shiftInfo.endTime,
      metrics: {
        oee: Math.round(shiftOEE * 100),
        unitsProduced: shiftMetricsData.unitsProduced,
        defectiveUnits: shiftMetricsData.defectiveUnits,
        runningMinutes: shiftMetricsData.runningMinutes,
        stoppageMinutes: shiftMetricsData.stoppageMinutes
      }
    };
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
    shiftData
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

  const transporter = nodemailer.createTransport({
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
  return new Promise(async (resolve, reject) => {
    try {
      // Pre-fetch configuration once
      const config = await Config.findOne();

      const doc = new PDFDocument({ 
        margin: 40,
        size: 'A4'
      });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      // Page dimensions
      const pageWidth = doc.page.width - 80; // Account for margins
      const pageHeight = doc.page.height - 80;

      // Header with logo (compact)
      const logoPath = path.join(__dirname, '../assets/dawlance-logo.png');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 
          doc.page.width / 2 - 100,
          0, 
          { width: 210 }
        );
        doc.y = 85;
      } else {
        doc.fontSize(14).fillColor('#1e40af').text('DAWLANCE', { align: 'center' });
        doc.y = 60;
      }

      // Title section
      doc.fontSize(16).fillColor('#1e40af').text(`${report.type.toUpperCase()} PRODUCTION REPORT`, { align: 'center' });
      doc.fontSize(8).fillColor('#6b7280')
         .text(`Period: ${report.period.start.toDateString()} - ${report.period.end.toDateString()}`, { align: 'center' });
      doc.moveDown(0.3);
      doc.text(`Generated: ${new Date().toDateString()} by ${report.generatedBy.username}`, { align: 'center' });
      
      // Decorative line
      doc.strokeColor('#3b82f6').lineWidth(1)
         .moveTo(40, doc.y + 8)
         .lineTo(pageWidth + 40, doc.y + 8)
         .stroke();
      
      doc.y += 18;

      // Layout columns
      const leftCol = 50;
      const rightCol = 320;
      const colWidth = 240;
      const startY = doc.y;

      // === LEFT COLUMN - Key Metrics ===
      doc.fontSize(11).fillColor('#1f2937').font('Helvetica-Bold')
         .text('KEY PERFORMANCE INDICATORS', leftCol, startY);
      
      let currentY = startY + 20;

      // OEE Highlight Box
      const oeeColor = getOEEColor(report.metrics.oee, config);
      doc.roundedRect(leftCol - 5, currentY - 5, colWidth - 20, 35, 4)
         .fillColor('#f8fafc').fill()
         .strokeColor(oeeColor).lineWidth(2).stroke();
      
      doc.fontSize(9).fillColor('#6b7280').font('Helvetica').text('Overall Equipment Effectiveness', leftCol + 5, currentY);
      doc.fontSize(20).fillColor(oeeColor).font('Helvetica-Bold').text(`${report.metrics.oee}%`, leftCol + 5, currentY + 12);
      doc.fontSize(7).fillColor('#6b7280').font('Helvetica').text(getOEEStatus(report.metrics.oee, config), leftCol + 80, currentY + 20);
      
      currentY += 45;

      // Performance Metrics Grid
      doc.fontSize(10).fillColor('#1f2937').font('Helvetica-Bold').text('PERFORMANCE BREAKDOWN', leftCol, currentY);
      currentY += 18;

      const perfMetrics = [
        { name: 'Availability', value: `${report.metrics.availability}%`, color: '#10b981' },
        { name: 'Quality', value: `${report.metrics.quality}%`, color: '#3b82f6' },
        { name: 'Performance', value: `${report.metrics.performance}%`, color: '#f59e0b' }
      ];

      perfMetrics.forEach((metric, i) => {
        const x = leftCol + (i % 3) * 70;
        const y = currentY + Math.floor(i / 3) * 35;
        
        // Metric card
        doc.roundedRect(x - 2, y - 2, 65, 28, 2)
           .fillColor('#ffffff').fill()
           .strokeColor('#e5e7eb').lineWidth(1).stroke();
        
        doc.fontSize(7).fillColor('#6b7280').font('Helvetica').text(metric.name, x + 2, y + 2);
        doc.fontSize(12).fillColor(metric.color).font('Helvetica-Bold').text(metric.value, x + 2, y + 12);
      });

      currentY += 45;

      // RELIABILITY METRICS SECTION (MTTR & MTBF)
      doc.fontSize(10).fillColor('#1f2937').font('Helvetica-Bold').text('RELIABILITY METRICS', leftCol, currentY);
      currentY += 18;

      // MTBF Card
      doc.roundedRect(leftCol - 5, currentY - 5, (colWidth - 30) / 2, 45, 4)
         .fillColor('#f0fdf4').fill()
         .strokeColor('#10b981').lineWidth(2).stroke();
      
      doc.fontSize(8).fillColor('#059669').font('Helvetica-Bold').text('MTBF', leftCol, currentY);
      doc.fontSize(7).fillColor('#6b7280').font('Helvetica').text('Mean Time Between Failures', leftCol, currentY + 10);
      doc.fontSize(14).fillColor('#059669').font('Helvetica-Bold').text(`${report.metrics.mtbf}`, leftCol, currentY + 20);
      doc.fontSize(6).fillColor('#6b7280').font('Helvetica').text('minutes', leftCol + 45, currentY + 28);

      // MTTR Card
      const mttrX = leftCol + (colWidth - 20) / 2;
      doc.roundedRect(mttrX - 5, currentY - 5, (colWidth - 30) / 2, 45, 4)
         .fillColor('#fef2f2').fill()
         .strokeColor('#ef4444').lineWidth(2).stroke();
      
      doc.fontSize(8).fillColor('#dc2626').font('Helvetica-Bold').text('MTTR', mttrX, currentY);
      doc.fontSize(7).fillColor('#6b7280').font('Helvetica').text('Mean Time To Repair', mttrX, currentY + 10);
      doc.fontSize(14).fillColor('#dc2626').font('Helvetica-Bold').text(`${report.metrics.mttr}`, mttrX, currentY + 20);
      doc.fontSize(6).fillColor('#6b7280').font('Helvetica').text('minutes', mttrX + 35, currentY + 28);

      currentY += 55;

      // MTBF/MTTR Ratio Indicator
      const reliabilityRatio = report.metrics.mttr > 0 ? (report.metrics.mtbf / report.metrics.mttr) : 0;
      const ratioColor = getReliabilityColor(reliabilityRatio, config);
      const ratioStatus = getReliabilityStatus(reliabilityRatio, config);
      
      doc.roundedRect(leftCol - 5, currentY - 5, colWidth - 20, 30, 4)
         .fillColor('#f8fafc').fill()
         .strokeColor(ratioColor).lineWidth(1).stroke();
      
      doc.fontSize(8).fillColor('#374151').font('Helvetica').text('Reliability Ratio (MTBF/MTTR)', leftCol, currentY);
      doc.fontSize(12).fillColor(ratioColor).font('Helvetica-Bold').text(`${reliabilityRatio.toFixed(1)}:1`, leftCol, currentY + 10);
      doc.fontSize(7).fillColor(ratioColor).font('Helvetica').text(ratioStatus, leftCol + 80, currentY + 15);

      currentY += 40;

      // Production Summary
      doc.fontSize(10).fillColor('#1f2937').font('Helvetica-Bold').text('PRODUCTION SUMMARY', leftCol, currentY);
      currentY += 18;

      const prodSummary = [
        { name: 'Units Produced', value: report.metrics.totalUnitsProduced.toLocaleString(), color: '#059669', icon: '📦' },
        { name: 'Defective Units', value: report.metrics.totalDefectiveUnits.toLocaleString(), color: '#dc2626', icon: '⚠️' },
        { name: 'Quality Rate', value: `${Math.round(((report.metrics.totalUnitsProduced - report.metrics.totalDefectiveUnits) / report.metrics.totalUnitsProduced) * 100)}%`, color: '#2563eb', icon: '✓' },
        { name: 'Total Stoppages', value: report.metrics.totalStoppages.toLocaleString(), color: '#f97316', icon: '⏹️' }
      ];

      prodSummary.forEach((item, i) => {
        doc.rect(leftCol - 5, currentY - 3, colWidth - 20, 20)
           .fillColor(i % 2 === 0 ? '#f1f5f9' : '#ffffff').fill();
        
        doc.fontSize(8).fillColor('#374151').font('Helvetica').text(item.name, leftCol, currentY);
        doc.fontSize(9).fillColor(item.color).font('Helvetica-Bold').text(item.value, leftCol + 150, currentY);
        
        currentY += 22;
      });

      // === RIGHT COLUMN - Shift Performance Details ===
      doc.fontSize(11).fillColor('#1f2937').font('Helvetica-Bold')
         .text('SHIFT PERFORMANCE ANALYSIS', rightCol, startY);

      let rightY = startY + 25;

      // Enhanced shift performance with detailed metrics
      if (report.shiftData && report.shiftData.length > 0) {
        report.shiftData.slice(0, 3).forEach((shift, index) => {
          const shiftOEE = shift.metrics?.oee || 0;
          const shiftColor = getShiftColor(index);
          const cardHeight = 85;
          
          // Shift header card
          doc.roundedRect(rightCol - 5, rightY - 5, 240, cardHeight, 6)
             .fillColor('#ffffff').fill()
             .strokeColor(shiftColor).lineWidth(2).stroke();
          
          // Shift name and time
          doc.fontSize(9).fillColor(shiftColor).font('Helvetica-Bold')
             .text(`${shift.shiftName || `Shift ${index + 1}`}`, rightCol, rightY);
          doc.fontSize(7).fillColor('#6b7280').font('Helvetica')
             .text(`${shift.startTime || '00:00'} - ${shift.endTime || '08:00'}`, rightCol + 120, rightY);
          
          // OEE badge
          doc.roundedRect(rightCol + 180, rightY - 2, 45, 16, 8)
             .fillColor(getOEEColor(shiftOEE, config)).fill();
          doc.fontSize(7).fillColor('#ffffff').font('Helvetica-Bold')
             .text(`${shiftOEE}%`, rightCol + 190, rightY + 2);
          
          rightY += 18;
          
          // Metrics grid (2x2 layout)
          const metrics = [
            { 
              name: 'Units Produced', 
              value: (shift.metrics?.unitsProduced || 0).toLocaleString(), 
              color: '#059669',
              icon: '📦'
            },
            { 
              name: 'Defective Units', 
              value: (shift.metrics?.defectiveUnits || 0).toLocaleString(), 
              color: '#dc2626',
              icon: '❌'
            },
            { 
              name: 'Running Time', 
              value: formatTime(shift.metrics?.runningMinutes || 0), 
              color: '#10b981',
              icon: '▶️'
            },
            { 
              name: 'Stoppage Time', 
              value: formatTime(shift.metrics?.stoppageMinutes || 0), 
              color: '#ef4444',
              icon: '⏸️'
            }
          ];
          
          metrics.forEach((metric, metricIndex) => {
            const col = metricIndex % 2;
            const row = Math.floor(metricIndex / 2);
            const x = rightCol + (col * 115);
            const y = rightY + (row * 22);
            
            // Metric item background
            doc.roundedRect(x - 2, y - 2, 110, 18, 2)
               .fillColor(col === 0 ? '#f8fafc' : '#ffffff').fill()
               .strokeColor('#e5e7eb').lineWidth(0.5).stroke();
            
            doc.fontSize(6).fillColor('#6b7280').font('Helvetica').text(metric.name, x + 2, y);
            doc.fontSize(8).fillColor(metric.color).font('Helvetica-Bold').text(metric.value, x + 2, y + 8);
          });
          
          // Quality rate bar for this shift
          rightY += 50;
          const qualityRate = (shift.metrics?.unitsProduced || 0) > 0 
            ? Math.round(((shift.metrics.unitsProduced - (shift.metrics?.defectiveUnits || 0)) / shift.metrics.unitsProduced) * 100) 
            : 0;
          
          doc.fontSize(7).fillColor('#374151').font('Helvetica').text('Quality Rate', rightCol, rightY);
          
          // Quality bar
          const barWidth = 200;
          const barHeight = 8;
          doc.roundedRect(rightCol, rightY + 10, barWidth, barHeight, 2)
             .fillColor('#f3f4f6').fill();
          doc.roundedRect(rightCol, rightY + 10, (qualityRate / 100) * barWidth, barHeight, 2)
             .fillColor(getQualityColor(qualityRate, config)).fill();
          
          doc.fontSize(7).fillColor('#1f2937').font('Helvetica-Bold')
             .text(`${qualityRate}%`, rightCol + barWidth + 5, rightY + 8);
          
          rightY += 30;
        });
      }

      // Time breakdown summary at bottom right
      if (rightY + 80 < pageHeight) {
        rightY += 10;
        doc.fontSize(10).fillColor('#1f2937').font('Helvetica-Bold')
           .text('TOTAL TIME BREAKDOWN', rightCol, rightY);
        
        rightY += 20;
        const totalMinutes = report.metrics.totalRunningMinutes + report.metrics.totalStoppageMinutes;
        const runningPercent = totalMinutes > 0 ? (report.metrics.totalRunningMinutes / totalMinutes) * 100 : 0;
        const stoppagePercent = totalMinutes > 0 ? (report.metrics.totalStoppageMinutes / totalMinutes) * 100 : 0;

        // Time visualization
        const timeBarWidth = 200;
        const timeBarHeight = 20;
        
        // Background
        doc.roundedRect(rightCol, rightY, timeBarWidth, timeBarHeight, 4)
           .fillColor('#f3f4f6').fill()
           .strokeColor('#d1d5db').lineWidth(1).stroke();
        
        // Running time segment
        const runningWidth = (runningPercent / 100) * timeBarWidth;
        if (runningWidth > 0) {
          doc.roundedRect(rightCol, rightY, runningWidth, timeBarHeight, 4)
             .fillColor('#10b981').fill();
        }
        
        // Labels
        rightY += 25;
        doc.fontSize(7).fillColor('#10b981').font('Helvetica')
           .text(`● Running: ${formatTime(report.metrics.totalRunningMinutes)} (${Math.round(runningPercent)}%)`, rightCol, rightY);
        doc.fontSize(7).fillColor('#ef4444').font('Helvetica')
           .text(`● Stoppage: ${formatTime(report.metrics.totalStoppageMinutes)} (${Math.round(stoppagePercent)}%)`, rightCol, rightY + 12);
      }

      // Footer - positioned at bottom of page
      doc.fontSize(7).fillColor('#9ca3af').font('Helvetica')
         .text('Dawlance - LineSentry', 40, doc.page.height - 30)
         .text(`Generated: ${new Date().toLocaleString()}`, 40, doc.page.height - 30, { 
           align: 'right', 
           width: pageWidth 
         });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// Updated helper functions (synchronous)
function getOEEColor(oee, config) {
  if (!config?.metricsThresholds?.oee) return '#ef4444';
  if (oee >= config.metricsThresholds.oee.excellent) return '#10b981';
  if (oee >= config.metricsThresholds.oee.good) return '#f59e0b';
  if (oee >= config.metricsThresholds.oee.fair) return '#f97316';
  return '#ef4444';
}

function getOEEStatus(oee, config) {
  if (!config?.metricsThresholds?.oee) return 'NEEDS IMPROVEMENT';
  if (oee >= config.metricsThresholds.oee.excellent) return 'EXCELLENT';
  if (oee >= config.metricsThresholds.oee.good) return 'GOOD';
  if (oee >= config.metricsThresholds.oee.fair) return 'FAIR';
  return 'NEEDS IMPROVEMENT';
}

function getShiftColor(index) {
  const colors = ['#3b82f6', '#8b5cf6', '#06b6d4']; // Blue, Purple, Cyan
  return colors[index % colors.length];
}

function getQualityColor(qualityRate, config) {
  if (!config?.metricsThresholds?.quality) return '#ef4444';
  if (qualityRate >= config.metricsThresholds.quality.excellent) return '#10b981';
  if (qualityRate >= config.metricsThresholds.quality.good) return '#f59e0b';
  if (qualityRate >= config.metricsThresholds.quality.fair) return '#f97316';
  return '#ef4444';
}

function getReliabilityColor(ratio, config) {
  if (!config?.metricsThresholds?.reliability) return '#ef4444';
  if (ratio >= config.metricsThresholds.reliability.excellent) return '#10b981';
  if (ratio >= config.metricsThresholds.reliability.good) return '#f59e0b';
  if (ratio >= config.metricsThresholds.reliability.fair) return '#f97316';
  return '#ef4444';
}

function getReliabilityStatus(ratio, config) {
  if (!config?.metricsThresholds?.reliability) return 'POOR RELIABILITY';
  if (ratio >= config.metricsThresholds.reliability.excellent) return 'EXCELLENT RELIABILITY';
  if (ratio >= config.metricsThresholds.reliability.good) return 'GOOD RELIABILITY';
  if (ratio >= config.metricsThresholds.reliability.fair) return 'FAIR RELIABILITY';
  return 'POOR RELIABILITY';
}

function formatTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

module.exports = router;