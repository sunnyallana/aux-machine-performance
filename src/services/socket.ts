import { io, Socket } from 'socket.io-client';

class SocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Function[]> = new Map();
  private eventQueue: Array<{event: string, data: any}> = [];
  private batchTimeout: NodeJS.Timeout | null = null;

  connect() {
    if (this.socket?.connected) return;

    this.socket = io('http://localhost:3001', {
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('Connected to server');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    // Re-register all listeners
    this.listeners.forEach((callbacks, event) => {
      callbacks.forEach(callback => {
        this.socket?.on(event, callback);
      });
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  on(event: string, callback: Function) {
    // Wrap callback to batch similar events
    const wrappedCallback = (data: any) => {
      // For high-frequency events, batch them
      if (['production-update', 'machine-state-update', 'stoppage-updated'].includes(event)) {
        this.queueEvent(event, data, callback);
      } else {
        callback(data);
      }
    };
    
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(wrappedCallback);

    if (this.socket?.connected) {
      this.socket.on(event, wrappedCallback as any);
    }
  }

  private queueEvent(event: string, data: any, callback: Function) {
    this.eventQueue.push({ event, data });
    
    // Clear existing timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }
    
    // Process queue after 500ms of no new events
    this.batchTimeout = setTimeout(() => {
      this.processBatchedEvents(callback);
      this.eventQueue = [];
      this.batchTimeout = null;
    }, 500);
  }

  private processBatchedEvents(callback: Function) {
    // Group events by machineId to avoid duplicate updates
    const groupedEvents = new Map<string, any>();
    
    this.eventQueue.forEach(({ event, data }) => {
      const key = `${event}-${data.machineId}`;
      groupedEvents.set(key, data);
    });
    
    // Process only the latest event for each machine
    groupedEvents.forEach(data => {
      callback(data);
    });
  }

  off(event: string, callback?: Function) {
    if (callback) {
      const callbacks = this.listeners.get(event) || [];
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
      if (this.socket?.connected) {
        this.socket.off(event, callback as any);
      }
    } else {
      this.listeners.delete(event);
      if (this.socket?.connected) {
        this.socket.off(event);
      }
    }
  }

  joinMachine(machineId: string) {
    if (this.socket?.connected) {
      this.socket.emit('join-machine', machineId);
    }
  }

  leaveMachine(machineId: string) {
    if (this.socket?.connected) {
      this.socket.emit('leave-machine', machineId);
    }
  }

  emit(event: string, data: any) {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    }
  }
}

export default new SocketService();