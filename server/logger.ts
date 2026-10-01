export interface ServerLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  source: string;
  message: string;
}

class ServerLogger {
  private logs: ServerLogEntry[] = [];
  private maxLogs = 300;

  constructor() {
    this.hookConsole();
  }

  public add(level: 'info' | 'warn' | 'error', source: string, message: string) {
    const entry: ServerLogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      level,
      source,
      message,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }

  public getLogs(): ServerLogEntry[] {
    return [...this.logs];
  }

  public clear() {
    this.logs = [];
  }

  private hookConsole() {
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;

    console.log = (...args: any[]) => {
      origLog(...args);
      const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
      this.add('info', 'server', msg);
    };

    console.warn = (...args: any[]) => {
      origWarn(...args);
      const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
      this.add('warn', 'server', msg);
    };

    console.error = (...args: any[]) => {
      origError(...args);
      const msg = args.map((a) => (typeof a === 'object' ? (a?.stack || JSON.stringify(a)) : String(a))).join(' ');
      this.add('error', 'server', msg);
    };
  }
}

export const serverLogger = new ServerLogger();
