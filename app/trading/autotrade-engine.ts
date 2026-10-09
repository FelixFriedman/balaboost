import { TradierBroker } from '../brokers/tradier/tradier-broker';
import { SpreadOrderRequest } from '../brokers/broker.interface';
import { IndicatorsService } from '../analysis/indicators-service';
import { MarketTagger } from '../analysis/market-tagger';
import { OptionsPricingEngine, ExecutionMode } from './options-pricing-engine';
import { TradingHoursFilter } from './trading-hours-filter';

import { EngineLogger } from '../storage/engine-logger';

export type AutotradeStatus = 'stopped' | 'running' | 'paused';
export { ExecutionMode };

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
  executionMode?: ExecutionMode;   // 'adaptive_walk' (default), 'natural_fill', or 'strict_mid'
  walkStepSeconds?: number;       // Seconds between limit price walks (default: 45s)
  walkPriceStep?: number;         // Price concession step in dollars (default: 0.05)
  minCreditFloor?: number;        // Minimum acceptable credit floor in dollars (default: 0.50)
  repriceThresholdPoints?: number;// SPX point move to trigger dynamic cancel/replace (default: 5.0)
}

export interface WorkingOrderTracker {
  orderId: string | number;
  placedAt: number;
  lastWalkAt: number;
  initialLimitPrice: number;
  currentLimitPrice: number;
  entrySpxPrice: number;
  stepCount: number;
  request: SpreadOrderRequest;
  legs: { shortSymbol: string; longSymbol: string };
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
    maxSpreadWidth: 20,          // 20-point max spread width cap (Hybrid strike selection)
    executionMode: 'adaptive_walk', // Default: adaptive walking limit discovery
    walkStepSeconds: 45,         // Step limit every 45s toward natural market
    walkPriceStep: 0.05,         // 1 nickel per step
    minCreditFloor: 0.50,        // Do not sell spreads below $0.50 credit floor
    repriceThresholdPoints: 5.0  // Reprice if SPX moves >= 5 points while working
  };

  private workingOrders: Map<string, WorkingOrderTracker> = new Map();
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
    initialConfig?: Partial<AutotradeRiskConfig>,
    private logger?: EngineLogger
  ) {
    if (initialConfig) {
      this.config = { ...this.config, ...initialConfig };
    }
    if (this.logger) {
      const persisted = this.logger.getRecentLogs(300);
      if (persisted && persisted.length > 0) {
        this.logs = persisted;
      }
    }
    this.addLog('info', `Autotrade engine initialized (Max loss: $${this.config.maxDailyLoss}, Stop: ${this.config.stopLossMultiplier}x, Target: ${this.config.profitTargetPct}%).`);
  }

  public getLogFilePath(): string {
    return this.logger ? this.logger.getLogFilePath() : '';
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

    // 1. Detect any previously tracked order that was filled
    const pendingOrderIds = new Set(pendingOrders.map((o: any) => String(o.id)));
    for (const [trackedId, tracker] of this.workingOrders.entries()) {
      if (!pendingOrderIds.has(trackedId)) {
        const filledOrder = Array.isArray(orders) ? orders.find((o: any) => String(o.id) === trackedId && o.status === 'filled') : null;
        if (filledOrder) {
          this.addLog('success', `🎉 Order #${trackedId} filled @ $${tracker.currentLimitPrice.toFixed(2)} credit! (Step ${tracker.stepCount})`);
        }
        this.workingOrders.delete(trackedId);
      }
    }

    let activePendingCount = 0;
    const timeoutLimit = this.config.orderTimeoutMinutes || 15;

    for (const pOrd of pendingOrders) {
      const orderDateStr = pOrd.create_date || pOrd.transaction_date;
      const createTime = orderDateStr ? new Date(orderDateStr).getTime() : Date.now();
      const ageMinutes = (Date.now() - createTime) / (1000 * 60);

      // Timeout check (TTL): Hard safety auto-cancel
      if (ageMinutes >= timeoutLimit) {
        this.addLog('warn', `⏱️ Stale Order Detected: #${pOrd.id} has been working for ${ageMinutes.toFixed(1)}m (exceeded ${timeoutLimit}m TTL). Auto-cancelling to release buying power.`);
        this.workingOrders.delete(String(pOrd.id));
        try {
          await this.broker.cancelOrder(pOrd.id);
          this.addLog('info', `Order #${pOrd.id} cancel request submitted to broker.`);
        } catch (err: any) {
          this.addLog('error', `Failed to auto-cancel timed out order #${pOrd.id}: ${err.message || String(err)}`);
        }
        continue;
      }

      activePendingCount++;
      const remaining = (timeoutLimit - ageMinutes).toFixed(1);

      // Ensure tracker exists for this working order
      if (!this.workingOrders.has(String(pOrd.id))) {
        const pPrice = typeof pOrd.price === 'number' ? pOrd.price : parseFloat(pOrd.price || '0');
        const pLegs = Array.isArray(pOrd.leg) ? pOrd.leg : [];
        const shortLeg = pLegs.find((l: any) => l.side?.includes('sell')) || pLegs[0];
        const longLeg = pLegs.find((l: any) => l.side?.includes('buy')) || pLegs[1];
        const isPut = pLegs.some((l: any) => l.option_symbol?.includes('P'));
        const strat: 'Bull Put Spread' | 'Bear Call Spread' = isPut ? 'Bull Put Spread' : 'Bear Call Spread';

        this.workingOrders.set(String(pOrd.id), {
          orderId: String(pOrd.id),
          placedAt: createTime,
          lastWalkAt: Date.now(),
          initialLimitPrice: pPrice,
          currentLimitPrice: pPrice,
          entrySpxPrice: 0,
          stepCount: 0,
          request: {
            symbol: pOrd.symbol || 'SPX',
            strategy: strat,
            duration: 'day',
            orderType: 'credit',
            limitPrice: pPrice,
            legs: pLegs.map((l: any) => ({
              optionSymbol: l.option_symbol,
              side: l.side,
              quantity: l.quantity || 1
            }))
          },
          legs: {
            shortSymbol: shortLeg?.option_symbol || '',
            longSymbol: longLeg?.option_symbol || ''
          }
        });
      }

      const tracker = this.workingOrders.get(String(pOrd.id))!;
      let handledReprice = false;

      // 2. Dynamic Repricing: If SPX moves >= repriceThresholdPoints, re-anchor order at current fair value
      const repriceThreshold = this.config.repriceThresholdPoints ?? 5.0;
      if (repriceThreshold > 0 && tracker.entrySpxPrice > 0) {
        try {
          const quoteRes = await this.broker.getQuote(this.config.symbol);
          const quote = quoteRes?.quotes?.quote;
          const currentSpx = Array.isArray(quote) ? quote[0]?.last : quote?.last;
          if (currentSpx && Math.abs(currentSpx - tracker.entrySpxPrice) >= repriceThreshold) {
            handledReprice = true;
            const spxDiff = (currentSpx - tracker.entrySpxPrice).toFixed(1);
            this.addLog('info', `🔄 Market Move Detected: SPX moved ${Number(spxDiff) > 0 ? '+' : ''}${spxDiff} pts (from ${tracker.entrySpxPrice.toFixed(2)} to ${currentSpx.toFixed(2)}). Re-evaluating order #${pOrd.id}...`);

            const indicators = await this.indicatorsService.getIndicators(this.config.symbol);
            const tags = this.marketTagger.evaluate(indicators);
            const freshPreview = await this.pricingEngine.calculateLimitPrice(
              this.config.symbol,
              tags,
              this.config.maxSpreadWidth ?? 20,
              this.config.executionMode || 'adaptive_walk'
            );

            if (freshPreview.action === 'Trade') {
              const newLimit = parseFloat(freshPreview.recommendedLimitPrice);
              this.addLog('warn', `🔄 Dynamic Reprice: Canceling order #${pOrd.id} to re-anchor spread at fresh limit credit $${newLimit.toFixed(2)}.`);
              await this.broker.cancelOrder(pOrd.id);
              this.workingOrders.delete(String(pOrd.id));

              const repriceReq: SpreadOrderRequest = {
                symbol: this.config.symbol,
                strategy: freshPreview.strategy,
                duration: 'day',
                orderType: 'credit',
                limitPrice: newLimit,
                legs: [
                  { optionSymbol: freshPreview.shortLeg.symbol, side: 'sell_to_open', quantity: this.config.contractsPerTrade },
                  { optionSymbol: freshPreview.longLeg.symbol, side: 'buy_to_open', quantity: this.config.contractsPerTrade }
                ]
              };

              const repriceRes = await this.broker.placeSpreadOrder(repriceReq);
              if (repriceRes.success && repriceRes.confirmationNumber) {
                this.workingOrders.set(String(repriceRes.confirmationNumber), {
                  orderId: String(repriceRes.confirmationNumber),
                  placedAt: Date.now(),
                  lastWalkAt: Date.now(),
                  initialLimitPrice: newLimit,
                  currentLimitPrice: newLimit,
                  entrySpxPrice: currentSpx,
                  stepCount: 0,
                  request: repriceReq,
                  legs: { shortSymbol: freshPreview.shortLeg.symbol, longSymbol: freshPreview.longLeg.symbol }
                });
                this.addLog('success', `✅ Re-anchored Order #${repriceRes.confirmationNumber} placed @ $${newLimit.toFixed(2)} credit.`);
              }
            }
          }
        } catch (repriceErr: any) {
          console.warn('[AutotradeEngine] Error evaluating dynamic reprice:', repriceErr);
        }
      }

      // 3. Adaptive Walking Limit Discovery: Step price closer to natural market every walkStepSeconds
      const mode = this.config.executionMode || 'adaptive_walk';
      if (!handledReprice && mode === 'adaptive_walk') {
        const stepIntervalSec = this.config.walkStepSeconds || 45;
        const priceStep = this.config.walkPriceStep || 0.05;
        const floor = this.config.minCreditFloor ?? 0.50;
        const timeSinceLastWalkSec = (Date.now() - tracker.lastWalkAt) / 1000;

        if (timeSinceLastWalkSec >= stepIntervalSec) {
          const nextPrice = Math.round((tracker.currentLimitPrice - priceStep) * 100) / 100;
          if (nextPrice >= floor) {
            this.addLog('info', `🚶 Walking Limit Order: #${pOrd.id} working for ${Math.round(timeSinceLastWalkSec)}s. Stepping credit limit from $${tracker.currentLimitPrice.toFixed(2)} to $${nextPrice.toFixed(2)} (Step ${tracker.stepCount + 1}) to discover liquidity.`);
            try {
              await this.broker.cancelOrder(pOrd.id);
              this.workingOrders.delete(String(pOrd.id));

              const walkedReq: SpreadOrderRequest = {
                ...tracker.request,
                limitPrice: nextPrice
              };

              const walkedRes = await this.broker.placeSpreadOrder(walkedReq);
              if (walkedRes.success && walkedRes.confirmationNumber) {
                this.workingOrders.set(String(walkedRes.confirmationNumber), {
                  ...tracker,
                  orderId: String(walkedRes.confirmationNumber),
                  lastWalkAt: Date.now(),
                  currentLimitPrice: nextPrice,
                  stepCount: tracker.stepCount + 1,
                  request: walkedReq
                });
                this.addLog('success', `✅ Replacement order #${walkedRes.confirmationNumber} placed @ $${nextPrice.toFixed(2)} credit (Step ${tracker.stepCount + 1}).`);
              }
            } catch (walkErr: any) {
              this.addLog('error', `Failed to step walking limit order #${pOrd.id}: ${walkErr.message || String(walkErr)}`);
            }
          } else {
            this.lastScanDecision = `Wait: Order #${pOrd.id} working @ floor $${floor.toFixed(2)} (${ageMinutes.toFixed(1)}m/${timeoutLimit}m TTL).`;
          }
        } else {
          const walkRemaining = Math.max(0, Math.round(stepIntervalSec - timeSinceLastWalkSec));
          this.lastScanDecision = `Wait: Order #${pOrd.id} working @ $${tracker.currentLimitPrice.toFixed(2)} credit (Next step in ${walkRemaining}s, ~${remaining}m TTL).`;
        }
      } else {
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
        this.config.maxSpreadWidth ?? 20,
        this.config.executionMode || 'adaptive_walk'
      );

      if (preview.action === 'Halt') {
        this.lastScanDecision = `Halt: ${preview.reason || 'No clear trend'}`;
        this.addLog('info', `Scan result: Halt (${preview.reason})`);
        return;
      }

      // 6. Strategy Signal Verified -> Automated Execution
      this.lastScanDecision = `Signal Found: ${preview.strategy} @ limit $${preview.recommendedLimitPrice}`;
      this.addLog('success', `🎯 Signal Detected: ${preview.strategy} (${preview.shortLeg.strike}/${preview.longLeg.strike}) for $${preview.recommendedLimitPrice} credit [${preview.aggressiveness || this.config.executionMode}].`);

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

      if (result.success && result.confirmationNumber) {
        this.tradesExecutedToday++;
        this.lastTradeTime = new Date().toISOString();
        this.addLog('success', `✅ Order #${result.confirmationNumber} placed successfully (${result.message}) @ $${orderRequest.limitPrice.toFixed(2)} credit`);

        this.workingOrders.set(String(result.confirmationNumber), {
          orderId: String(result.confirmationNumber),
          placedAt: Date.now(),
          lastWalkAt: Date.now(),
          initialLimitPrice: orderRequest.limitPrice,
          currentLimitPrice: orderRequest.limitPrice,
          entrySpxPrice: preview.underlyingPrice || 0,
          stepCount: 0,
          request: orderRequest,
          legs: {
            shortSymbol: preview.shortLeg.symbol,
            longSymbol: preview.longLeg.symbol
          }
        });
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
    if (this.logs.length > 1000) {
      this.logs.pop();
    }

    if (this.logger) {
      this.logger.append(entry);
    }
  }
}
