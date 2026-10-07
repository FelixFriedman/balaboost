import { TradierBroker } from '../brokers/tradier/tradier-broker';
import { SpreadOrderRequest } from '../brokers/broker.interface';
import { IndicatorsService } from '../analysis/indicators-service';
import { MarketTagger } from '../analysis/market-tagger';
import { OptionsPricingEngine } from './options-pricing-engine';
import { TradingHoursFilter } from './trading-hours-filter';

export type AutotradeStatus = 'stopped' | 'running' | 'paused';

export interface AutotradeRiskConfig {
  symbol: string;
  maxDailyLoss: number;            // Dollar limit (e.g. 500 = $500 max loss per day)
  stopLossMultiplier: number;      // e.g. 2.0 = exit if exit debit reaches 2x entry credit
  profitTargetPct: number;         // e.g. 50 = exit when 50% profit reached (0.5x entry credit)
  maxConcurrentPositions: number;  // Maximum active spreads allowed at once (e.g. 2)
  contractsPerTrade: number;       // Number of contracts to open per spread (e.g. 1)
  cooldownMinutes: number;         // Cooldown between new entries (e.g. 15 min)
  scanIntervalSeconds: number;     // How often to check for entry/exit (default 30s)
  orderTimeoutMinutes: number;     // Timeout for working orders before auto-cancelling (TTL)
  autoResumeOnLaunch?: boolean;    // Auto-resume autotrading on launch if previously active
  maxSpreadWidth?: number;         // Maximum strike width in points (caps long wing to contain collateral)
}

export interface AutotradeLogEntry {
  id: string;
  timestamp: string; // ISO string
  timeFormatted: string; // HH:MM:SS ET
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

export class AutotradeEngine {
  private status: AutotradeStatus = 'stopped';
  private timer: NodeJS.Timeout | null = null;
  private isScanning: boolean = false;

  private config: AutotradeRiskConfig = {
    symbol: 'SPX',
    maxDailyLoss: 500,           // Max $500 daily loss before circuit breaker
    stopLossMultiplier: 2.0,     // 2x credit stop loss
    profitTargetPct: 50,         // 50% profit target
    maxConcurrentPositions: 2,   // Max 2 spreads at once
    contractsPerTrade: 1,        // 1 contract
    cooldownMinutes: 15,         // 15 min cooldown
    scanIntervalSeconds: 30,     // Scan every 30 seconds
    orderTimeoutMinutes: 15,     // Auto-cancel unfilled entry orders after 15 minutes (industry standard limit discovery)
    autoResumeOnLaunch: true,    // Auto-resume on app launch
    maxSpreadWidth: 20           // 20-point max spread width cap (Hybrid strike selection)
  };

  private circuitBreakerTripped = false;
  private circuitBreakerReason: string | null = null;
  private todayRealizedPnL = 0;
  private activePositionsCount = 0;
  private tradesExecutedToday = 0;
  private lastScanTime: string | null = null;
  private lastTradeTime: string | null = null;
  private lastScanDecision: string | null = null;
  private logs: AutotradeLogEntry[] = [];

  constructor(
    private broker: TradierBroker,
    private indicatorsService: IndicatorsService,
    private marketTagger: MarketTagger,
    private pricingEngine: OptionsPricingEngine,
    private hoursFilter: TradingHoursFilter,
    initialConfig?: Partial<AutotradeRiskConfig>
  ) {
    if (initialConfig) {
      this.config = { ...this.config, ...initialConfig };
    }
    this.addLog('info', `Autotrade engine initialized (Max loss: $${this.config.maxDailyLoss}, Stop: ${this.config.stopLossMultiplier}x, Target: ${this.config.profitTargetPct}%).`);
  }


  public getState(): AutotradeState {
    return {
      status: this.status,
      config: { ...this.config },
      circuitBreakerTripped: this.circuitBreakerTripped,
      circuitBreakerReason: this.circuitBreakerReason,
      todayRealizedPnL: this.todayRealizedPnL,
      tradesExecutedToday: this.tradesExecutedToday,
      lastScanTime: this.lastScanTime,
      lastTradeTime: this.lastTradeTime,
      lastScanDecision: this.lastScanDecision,
      activePositionsCount: this.activePositionsCount,
      logs: [...this.logs]
    };
  }

  public setConfig(update: Partial<AutotradeRiskConfig>): AutotradeRiskConfig {
    this.config = { ...this.config, ...update };
    this.addLog('info', `Risk configuration updated: Max daily loss $${this.config.maxDailyLoss}, SL ${this.config.stopLossMultiplier}x, PT ${this.config.profitTargetPct}%, Max concurrent ${this.config.maxConcurrentPositions}`);
    
    // Restart timer if interval changed and currently running
    if (this.status === 'running' && update.scanIntervalSeconds) {
      this.stopTimer();
      this.startTimer();
    }
    return { ...this.config };
  }

  public start(): AutotradeState {
    if (this.circuitBreakerTripped) {
      this.addLog('error', 'Cannot start Autotrade: Circuit breaker is tripped. Reset circuit breaker first.');
      return this.getState();
    }

    this.status = 'running';
    this.addLog('success', `Autotrade started for ${this.config.symbol}. Scanning every ${this.config.scanIntervalSeconds}s.`);
    this.startTimer();
    // Run an immediate scan on start
    void this.scanAndEvaluate();
    return this.getState();
  }

  public pause(): AutotradeState {
    if (this.status !== 'running') return this.getState();
    this.status = 'paused';
    this.stopTimer();
    this.addLog('warn', 'Autotrade paused by user. Automated executions suspended.');
    return this.getState();
  }

  public resume(): AutotradeState {
    if (this.circuitBreakerTripped) {
      this.addLog('error', 'Cannot resume Autotrade: Circuit breaker is tripped.');
      return this.getState();
    }
    this.status = 'running';
    this.addLog('success', 'Autotrade resumed. Scanning resumed.');
    this.startTimer();
    void this.scanAndEvaluate();
    return this.getState();
  }

  public stop(): AutotradeState {
    this.status = 'stopped';
    this.stopTimer();
    this.addLog('info', 'Autotrade stopped.');
    return this.getState();
  }

  public resetCircuitBreaker(): AutotradeState {
    this.circuitBreakerTripped = false;
    this.circuitBreakerReason = null;
    this.addLog('warn', 'Circuit breaker reset. Trading limits cleared.');
    return this.getState();
  }

  public async triggerScan(): Promise<AutotradeState> {
    await this.scanAndEvaluate(true);
    return this.getState();
  }

  /**
   * Inspect all pending orders and auto-cancel any that exceed the orderTimeoutMinutes TTL.
   * This risk & collateral management task runs unconditionally, even when trading hours have ended
   * or before new trade evaluations.
   */
  public async checkAndCleanStaleOrders(): Promise<{ activePendingCount: number; activePositionsCount: number }> {
    const [orders, positions, balance] = await Promise.all([
      this.broker.getOrders().catch(() => []),
      this.broker.getPositions().catch(() => []),
      this.broker.getAccountBalance().catch(() => null)
    ]);

    // Synchronize realized PnL today from broker closed PnL
    if (balance && typeof balance.closePnL === 'number') {
      this.todayRealizedPnL = balance.closePnL;
    }

    // Each vertical credit spread consists of one short leg (quantity < 0)
    const shortPositions = Array.isArray(positions) ? positions.filter((p: any) => p.quantity < 0) : [];
    this.activePositionsCount = shortPositions.length;

    const pendingOrders = Array.isArray(orders) ? orders.filter((o: any) => 
      o.status === 'pending' || 
      o.status === 'open' || 
      o.status === 'submitted' || 
      o.status === 'accepted' || 
      o.status === 'queued' || 
      o.status === 'held' ||
      o.status === 'partially_filled'
    ) : [];

    let activePendingCount = 0;
    const timeoutLimit = this.config.orderTimeoutMinutes || 15;

    for (const pOrd of pendingOrders) {
      const orderDateStr = pOrd.create_date || pOrd.transaction_date;
      const createTime = orderDateStr ? new Date(orderDateStr).getTime() : Date.now();
      const ageMinutes = (Date.now() - createTime) / (1000 * 60);

      if (ageMinutes >= timeoutLimit) {
        this.addLog('warn', `⏱️ Stale Order Detected: #${pOrd.id} has been working for ${ageMinutes.toFixed(1)}m (exceeded ${timeoutLimit}m TTL). Auto-cancelling to release buying power.`);
        try {
          await this.broker.cancelOrder(pOrd.id);
          this.addLog('info', `Order #${pOrd.id} cancel request submitted to broker.`);
        } catch (err: any) {
          this.addLog('error', `Failed to auto-cancel timed out order #${pOrd.id}: ${err.message || String(err)}`);
        }
      } else {
        activePendingCount++;
        const remaining = (timeoutLimit - ageMinutes).toFixed(1);
        this.lastScanDecision = `Wait: Order #${pOrd.id} working (${ageMinutes.toFixed(1)}m/${timeoutLimit}m TTL, ~${remaining}m until auto-cancel).`;
      }
    }

    return { activePendingCount, activePositionsCount: this.activePositionsCount };
  }

  // ----- Automated Evaluation Loop -----

  private startTimer(): void {
    this.stopTimer();
    this.timer = setInterval(() => {
      void this.scanAndEvaluate(false);
    }, this.config.scanIntervalSeconds * 1000);
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async scanAndEvaluate(force: boolean = false): Promise<void> {
    if (this.isScanning) return;
    this.isScanning = true;
    this.lastScanTime = new Date().toISOString();

    try {
      if (this.status !== 'running' && !force) {
        return;
      }

      // 1. Risk Check: Pending Orders & Stale Order Timeout (TTL) Maintenance
      // Always inspect working orders to cancel stale orders and unlock buying power,
      // regardless of whether new trade execution hours have closed.
      const { activePendingCount, activePositionsCount } = await this.checkAndCleanStaleOrders();

      if (activePendingCount > 0) {
        return;
      }

      // 2. Risk Check: Circuit Breaker
      if (this.todayRealizedPnL <= -Math.abs(this.config.maxDailyLoss)) {
        this.circuitBreakerTripped = true;
        this.circuitBreakerReason = `Daily loss limit of -$${this.config.maxDailyLoss} reached (Current: -$${Math.abs(this.todayRealizedPnL).toFixed(2)})`;
        this.status = 'paused';
        this.stopTimer();
        this.addLog('error', `🚨 CIRCUIT BREAKER TRIPPED: ${this.circuitBreakerReason}. Autotrade paused.`);
        return;
      }

      // 3. Risk Check: Trading Hours Filter (Gate for New Trade Entry)
      const hoursStatus = this.hoursFilter.getStatus();
      if (!hoursStatus.canExecuteTrade) {
        this.lastScanDecision = `Paused: ${hoursStatus.reason}`;
        this.addLog('info', `Scan skipped: ${hoursStatus.reason}`);
        return;
      }

      // 4. Risk Check: Max Concurrent Positions
      if (activePositionsCount >= this.config.maxConcurrentPositions) {
        this.lastScanDecision = `Max concurrent positions limit reached (${activePositionsCount}/${this.config.maxConcurrentPositions}).`;
        return;
      }

      // 5. Cooldown Check
      if (this.lastTradeTime) {
        const diffMs = Date.now() - new Date(this.lastTradeTime).getTime();
        const diffMin = diffMs / (1000 * 60);
        if (diffMin < this.config.cooldownMinutes) {
          const remaining = (this.config.cooldownMinutes - diffMin).toFixed(1);
          this.lastScanDecision = `Cooldown active: ${remaining} min remaining before next trade.`;
          return;
        }
      }

      // 6. Indicator & Strategy Evaluation
      this.addLog('info', `Evaluating market signals for ${this.config.symbol}...`);
      const indicators = await this.indicatorsService.getIndicators(this.config.symbol);
      const tags = this.marketTagger.evaluate(indicators);

      const preview = await this.pricingEngine.calculateLimitPrice(
        this.config.symbol, 
        tags, 
        this.config.maxSpreadWidth ?? 10
      );

      if (preview.action === 'Halt') {
        this.lastScanDecision = `Halt: ${preview.reason || 'No clear trend'}`;
        this.addLog('info', `Scan result: Halt (${preview.reason})`);
        return;
      }

      // 6. Strategy Signal Verified -> Automated Execution
      this.lastScanDecision = `Signal Found: ${preview.strategy} @ limit $${preview.recommendedLimitPrice}`;
      this.addLog('success', `🎯 Signal Detected: ${preview.strategy} (${preview.shortLeg.strike}/${preview.longLeg.strike}) for $${preview.recommendedLimitPrice} credit.`);

      const orderRequest: SpreadOrderRequest = {
        symbol: this.config.symbol,
        strategy: preview.strategy,
        duration: 'day',
        orderType: 'credit',
        limitPrice: parseFloat(preview.recommendedLimitPrice),
        legs: [
          {
            optionSymbol: preview.shortLeg.symbol,
            side: 'sell_to_open',
            quantity: this.config.contractsPerTrade
          },
          {
            optionSymbol: preview.longLeg.symbol,
            side: 'buy_to_open',
            quantity: this.config.contractsPerTrade
          }
        ]
      };

      this.addLog('info', `Executing automated order: ${this.config.contractsPerTrade} contract(s)...`);
      const result = await this.broker.placeSpreadOrder(orderRequest);

      if (result.success) {
        this.tradesExecutedToday++;
        this.lastTradeTime = new Date().toISOString();
        this.addLog('success', `✅ Order #${result.confirmationNumber} placed successfully (${result.message})`);
      } else {
        this.addLog('error', `❌ Automated order rejected by broker: ${result.message}`);
      }

    } catch (e: any) {
      this.addLog('error', `Error during automated scan: ${e.message || String(e)}`);
    } finally {
      this.isScanning = false;
    }
  }

  private addLog(level: 'info' | 'warn' | 'success' | 'error', message: string): void {
    const now = new Date();
    const timeFormatted = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(now);

    const entry: AutotradeLogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: now.toISOString(),
      timeFormatted,
      level,
      message
    };

    this.logs.unshift(entry);
    if (this.logs.length > 80) {
      this.logs.pop();
    }
  }
}
