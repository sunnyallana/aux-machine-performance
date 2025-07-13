export interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'operator';
  department?: Department;
}

export interface Department {
  _id: string;
  name: string;
  description?: string;
  layout?: any;
  machines?: Machine[];
  machineCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Machine {
  _id: string;
  name: string;
  description?: string;
  departmentId: string | Department;
  position: { x: number; y: number };
  status: 'running' | 'stopped' | 'maintenance' | 'error';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Sensor {
  _id: string;
  name: string;
  description?: string;
  machineId: string | Machine;
  sensorType: 'power' | 'unit-cycle';
  isActive: boolean;
}

export interface ProductionTimelineDay {
  date: string;
  hours: ProductionHour[];
}

export interface ProductionHour {
  hour: number;
  unitsProduced: number;
  defectiveUnits: number;
  status: string;
  operator?: User;
  mold?: Mold;
  stoppages: StoppageRecord[];
}

export interface StoppageRecord {
  id: string;
  reason: 'planned' | 'mold_change' | 'breakdown' | 'maintenance' | 'material_shortage' | 'other';
  description?: string;
  duration?: number;
  startTime: string;
  endTime?: string;
  reportedBy?: User;
}

export interface Mold {
  _id: string;
  name: string;
  description?: string;
  productionCapacityPerHour: number;
  departmentId: string | { _id: string; name: string };
  isActive: boolean;
}

export interface MachineStats {
  totalUnitsProduced: number;
  totalDefectiveUnits: number;
  oee: number;
  mtbf: number;
  mttr: number;
  availability: number;
  quality: number;
  performance: number;
  currentStatus: string;
}

export interface Config {
  _id?: string;
  plc: {
    ip: string;
    rack: number;
    slot: number;
  };
  email: {
    senderEmail: string;
    senderPassword: string;
    recipients: string[];
  };
}