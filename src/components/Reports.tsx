import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Department, Machine } from '../types';
import apiService from '../services/api';
import { 
  FileText, 
  Download, 
  Mail, 
  Calendar, 
  TrendingUp,
  Clock,
  AlertTriangle,
  Building2,
  Activity,
  Filter,
  RefreshCw
} from 'lucide-react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

interface Report {
  _id: string;
  type: 'daily' | 'weekly' | 'monthly' | 'yearly';
  period: {
    start: string;
    end: string;
  };
  departmentId?: Department;
  machineId?: Machine;
  metrics: {
    oee: number;
    mttr: number;
    mtbf: number;
    availability: number;
    quality: number;
    performance: number;
    totalUnitsProduced: number;
    totalDefectiveUnits: number;
    totalRunningMinutes: number;
    totalStoppageMinutes: number;
    totalStoppages: number;
  };
  shiftData: Array<{
    shiftName: string;
    startTime: string;
    endTime: string;
    metrics: {
      oee: number;
      unitsProduced: number;
      defectiveUnits: number;
      runningMinutes: number;
      stoppageMinutes: number;
    };
  }>;
  generatedBy: {
    username: string;
  };
  emailSent: boolean;
  emailSentAt?: string;
  createdAt: string;
}

const Reports: React.FC = () => {
  const { isAdmin } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [filters, setFilters] = useState({
    type: '',
    departmentId: '',
    machineId: ''
  });
  const [reportForm, setReportForm] = useState({
    type: 'daily' as 'daily' | 'weekly' | 'monthly' | 'yearly',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    departmentId: '',
    machineId: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    fetchReports();
  }, [filters]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [reportsData, departmentsData, machinesData] = await Promise.all([
        apiService.getReports(),
        apiService.getDepartments(),
        apiService.getMachines()
      ]);
      
      setReports(reportsData);
      setDepartments(departmentsData);
      setMachines(machinesData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch data';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const fetchReports = async () => {
    try {
      const reportsData = await apiService.getReports(filters);
      setReports(reportsData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch reports';
      toast.error(message);
    }
  };

  const handleGenerateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!reportForm.startDate || !reportForm.endDate) {
      toast.error('Please select both start and end dates');
      return;
    }
    
    if (new Date(reportForm.startDate) > new Date(reportForm.endDate)) {
      toast.error('Start date cannot be after end date');
      return;
    }
    
    try {
      setGenerating(true);
      const report = await apiService.generateReport(reportForm);
      setReports([report, ...reports]);
      toast.success('Report generated successfully');
      
      // Reset form
      setReportForm({
        type: 'daily',
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        departmentId: '',
        machineId: ''
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate report';
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  };

  const handleEmailReport = async (reportId: string) => {
    try {
      await apiService.emailReport(reportId);
      setReports(reports.map(r => 
        r._id === reportId 
          ? { ...r, emailSent: true, emailSentAt: new Date().toISOString() }
          : r
      ));
      toast.success('Report emailed successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to email report';
      toast.error(message);
    }
  };

  const handleDownloadPDF = async (reportId: string, reportType: string, startDate: string) => {
    try {
      const response = await fetch(`http://localhost:3001/api/reports/${reportId}/pdf`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) throw new Error('Failed to download PDF');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `${reportType}-report-${startDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast.success('PDF downloaded successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to download PDF';
      toast.error(message);
    }
  };

  const getReportTypeColor = (type: string) => {
    switch (type) {
      case 'daily': return 'bg-blue-900/50 text-blue-400';
      case 'weekly': return 'bg-green-900/50 text-green-400';
      case 'monthly': return 'bg-yellow-900/50 text-yellow-400';
      case 'yearly': return 'bg-purple-900/50 text-purple-400';
      default: return 'bg-gray-900/50 text-gray-400';
    }
  };

  if (!isAdmin) {
    return (
      <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-3 rounded-md">
        <div className="flex items-center">
          <AlertTriangle className="h-4 w-4 mr-2" />
          <span>Access denied. Admin privileges required.</span>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />
      
      {/* Header */}
      <div className="flex items-center space-x-4">
        <FileText className="h-8 w-8 text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Production Reports</h1>
          <p className="text-gray-400">Generate and manage OEE, MTTR, and MTBF reports</p>
        </div>
      </div>

      {/* Generate Report Form */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Generate New Report</h2>
        
        <form onSubmit={handleGenerateReport} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Report Type
              </label>
              <select
                value={reportForm.type}
                onChange={(e) => setReportForm({...reportForm, type: e.target.value as any})}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={reportForm.startDate}
                onChange={(e) => setReportForm({...reportForm, startDate: e.target.value})}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                End Date
              </label>
              <input
                type="date"
                value={reportForm.endDate}
                onChange={(e) => setReportForm({...reportForm, endDate: e.target.value})}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Department (Optional)
              </label>
              <select
                value={reportForm.departmentId}
                onChange={(e) => setReportForm({...reportForm, departmentId: e.target.value})}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept._id} value={dept._id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Machine (Optional)
              </label>
              <select
                value={reportForm.machineId}
                onChange={(e) => setReportForm({...reportForm, machineId: e.target.value})}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Machines</option>
                {machines.map((machine) => (
                  <option key={machine._id} value={machine._id}>
                    {machine.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={generating}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {generating ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              <span>{generating ? 'Generating...' : 'Generate Report'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Filters */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
        <div className="flex items-center space-x-4">
          <Filter className="h-5 w-5 text-gray-400" />
          <div className="flex space-x-4 flex-1">
            <select
              value={filters.type}
              onChange={(e) => setFilters({...filters, type: e.target.value})}
              className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Types</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>

            <select
              value={filters.departmentId}
              onChange={(e) => setFilters({...filters, departmentId: e.target.value})}
              className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Departments</option>
              {departments.map((dept) => (
                <option key={dept._id} value={dept._id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Reports List */}
      <div className="bg-gray-800 rounded-lg border border-gray-700">
        <div className="p-6 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Generated Reports</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-750">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Report
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Period
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Key Metrics
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Generated
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {reports.map((report) => (
                <tr key={report._id} className="hover:bg-gray-750">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <FileText className="h-8 w-8 text-blue-400" />
                      </div>
                      <div className="ml-4">
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getReportTypeColor(report.type)}`}>
                            {report.type.toUpperCase()}
                          </span>
                          {report.emailSent && (
                            <span className="px-2 py-1 text-xs bg-green-900/50 text-green-400 rounded-full">
                              Emailed
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-400 mt-1">
                          {report.departmentId?.name || 'All Departments'} • {report.machineId?.name || 'All Machines'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-white">
                      {new Date(report.period.start).toLocaleDateString()} - {new Date(report.period.end).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="text-center">
                        <div className="text-yellow-400 font-semibold">{report.metrics.oee}%</div>
                        <div className="text-gray-400">OEE</div>
                      </div>
                      <div className="text-center">
                        <div className="text-blue-400 font-semibold">{report.metrics.mtbf}m</div>
                        <div className="text-gray-400">MTBF</div>
                      </div>
                      <div className="text-center">
                        <div className="text-purple-400 font-semibold">{report.metrics.mttr}m</div>
                        <div className="text-gray-400">MTTR</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-300">
                      {new Date(report.createdAt).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-gray-400">
                      by {report.generatedBy.username}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={() => handleDownloadPDF(report._id, report.type, report.period.start.split('T')[0])}
                        className="text-blue-400 hover:text-blue-300 p-1 rounded-md hover:bg-gray-700"
                        title="Download PDF"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleEmailReport(report._id)}
                        className="text-green-400 hover:text-green-300 p-1 rounded-md hover:bg-gray-700"
                        title="Email Report"
                      >
                        <Mail className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {reports.length === 0 && (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-400 mb-2">No reports found</h3>
              <p className="text-gray-500">Generate your first report to get started</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Reports;