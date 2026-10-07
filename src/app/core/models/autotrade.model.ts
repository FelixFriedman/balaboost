export type AutotradeStatus = 'stopped' | 'running' | 'paused';

export interface AutotradeRiskConfig {
  symbol: string;
  maxDailyLoss: number;            // Dollar limit (e.g. 500 = $500 max loss per day)
  stopLossMultiplier: number;      // e.g. 2.0 = exit if exit debit reaches 2x entry credit
  profitTargetPct: number;         // e.g. 50 = exit when 50% profit reached
  maxConcurrentPositions: number;  // Maximum active spreads allowed at once
  contractsPerTrade: number;       // Number of contracts to open per spread
  cooldownMinutes: number;         // Cooldown between new entries in minutes
  scanIntervalSeconds: number;     // How often to check for entry/exit
  orderTimeoutMinutes?: number;    // Timeout for working orders before auto-cancelling (TTL)
  autoResumeOnLaunch?: boolean;    // Auto-resume autotrade on startup if previously active
  maxSpreadWidth?: number;         // Maximum spread width in points (Hybrid strike cap)
}

export interface AutotradeLogEntry {
  id: string;
  timestamp: string;
  timeFormatted: string;
  level: 'info' | 'warn' | 'success' | 'error';
  message: string;
}

export interface AutotradeState {
  status: AutotradeStatus;
  config: AutotradeRiskConfig;
  circuitBreakerTripped: boolean;
  circuitBreakerReason: string | null;
  todayRealizedPnL: number;
  tradesExecutedToday: number;
  lastScanTime: string | null;
  lastTradeTime: string | null;
  lastScanDecision: string | null;
  activePositionsCount: number;
  logs: AutotradeLogEntry[];
}
