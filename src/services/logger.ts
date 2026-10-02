export interface AppLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  origin: 'frontend' | 'backend';
  source?: string;
  message: string;
}

class AppLogger {
  private logs: AppLogEntry[] = [];
  private maxLogs = 400;
  private listeners: Array<() => void> = [];

  constructor() {
    this.hookFrontendErrors();
  }

  public add(level: 'info' | 'warn' | 'error', origin: 'frontend' | 'backend', message: string, source?: string) {
    const entry: AppLogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      level,
      origin,
      source,
      message,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    this.notify();
  }

  public info(message: string, source?: string) {
    this.add('info', 'frontend', message, source);
  }

  public warn(message: string, source?: string) {
    this.add('warn', 'frontend', message, source);
  }

  public error(message: string, source?: string) {
    this.add('error', 'frontend', message, source);
  }

  public getLogs(): AppLogEntry[] {
    return [...this.logs];
  }

  public getErrorCount(): number {
    return this.logs.filter((l) => l.level === 'error').length;
  }

  public clear() {
    this.logs = [];
    this.notify();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => {
      try {
        l();
      } catch {}
    });
  }

  public async fetchBackendLogs(): Promise<void> {
    try {
      const res = await fetch('/api/logs');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.logs)) {
        // Merge backend logs without duplicating by id
        const existingBackendIds = new Set(this.logs.filter((l) => l.origin === 'backend').map((l) => l.id));
        for (const bLog of data.logs) {
          if (!existingBackendIds.has(bLog.id)) {
            this.logs.push({
              id: bLog.id,
              timestamp: bLog.timestamp,
              level: bLog.level,
              origin: 'backend',
              source: bLog.source || 'microservicio',
              message: bLog.message,
            });
          }
        }
        // Keep order by timestamp (or insertion)
        this.notify();
      }
    } catch {
      // Backend offline, ignore
    }
  }

  private hookFrontendErrors() {
    if (typeof window === 'undefined') return;

    window.addEventListener('error', (event) => {
      this.add('error', 'frontend', event.message || 'Error no capturado en ventana', event.filename);
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      const msg = reason instanceof Error ? reason.stack || reason.message : String(reason);
      this.add('error', 'frontend', `Promesa rechazada: ${msg}`);
    });

    const origError = console.error;
    console.error = (...args: any[]) => {
      origError(...args);
      const msg = args.map((a) => (typeof a === 'object' ? (a?.stack || JSON.stringify(a)) : String(a))).join(' ');
      this.add('error', 'frontend', msg);
    };

    const origWarn = console.warn;
    console.warn = (...args: any[]) => {
      origWarn(...args);
      const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
      this.add('warn', 'frontend', msg);
    };
  }
}

export const appLogger = new AppLogger();
