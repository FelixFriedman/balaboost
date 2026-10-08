"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutotradeEngine = void 0;
class AutotradeEngine {
    constructor(broker, indicatorsService, marketTagger, pricingEngine, hoursFilter, initialConfig, logger) {
        this.broker = broker;
        this.indicatorsService = indicatorsService;
        this.marketTagger = marketTagger;
        this.pricingEngine = pricingEngine;
        this.hoursFilter = hoursFilter;
        this.logger = logger;
        this.status = 'stopped';
        this.timer = null;
        this.isScanning = false;
        this.config = {
            symbol: 'SPX',
            maxDailyLoss: 500, // Max $500 daily loss before circuit breaker
            stopLossMultiplier: 2.0, // 2x credit stop loss
            profitTargetPct: 50, // 50% profit target
            maxConcurrentPositions: 2, // Max 2 spreads at once
            contractsPerTrade: 1, // 1 contract
            cooldownMinutes: 15, // 15 min cooldown
            scanIntervalSeconds: 30, // Scan every 30 seconds
            orderTimeoutMinutes: 15, // Auto-cancel unfilled entry orders after 15 minutes (industry standard limit discovery)
            autoResumeOnLaunch: true, // Auto-resume on app launch
            maxSpreadWidth: 20 // 20-point max spread width cap (Hybrid strike selection)
        };
        this.circuitBreakerTripped = false;
        this.circuitBreakerReason = null;
        this.todayRealizedPnL = 0;
        this.activePositionsCount = 0;
        this.tradesExecutedToday = 0;
        this.lastScanTime = null;
        this.lastTradeTime = null;
        this.lastScanDecision = null;
        this.logs = [];
        if (initialConfig) {
            this.config = Object.assign(Object.assign({}, this.config), initialConfig);
        }
        if (this.logger) {
            const persisted = this.logger.getRecentLogs(300);
            if (persisted && persisted.length > 0) {
                this.logs = persisted;
            }
        }
        this.addLog('info', `Autotrade engine initialized (Max loss: $${this.config.maxDailyLoss}, Stop: ${this.config.stopLossMultiplier}x, Target: ${this.config.profitTargetPct}%).`);
    }
    getLogFilePath() {
        return this.logger ? this.logger.getLogFilePath() : '';
    }
    getState() {
        return {
            status: this.status,
            config: Object.assign({}, this.config),
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
    setConfig(update) {
        this.config = Object.assign(Object.assign({}, this.config), update);
        this.addLog('info', `Risk configuration updated: Max daily loss $${this.config.maxDailyLoss}, SL ${this.config.stopLossMultiplier}x, PT ${this.config.profitTargetPct}%, Max concurrent ${this.config.maxConcurrentPositions}`);
        // Restart timer if interval changed and currently running
        if (this.status === 'running' && update.scanIntervalSeconds) {
            this.stopTimer();
            this.startTimer();
        }
        return Object.assign({}, this.config);
    }
    start() {
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
    pause() {
        if (this.status !== 'running')
            return this.getState();
        this.status = 'paused';
        this.stopTimer();
        this.addLog('warn', 'Autotrade paused by user. Automated executions suspended.');
        return this.getState();
    }
    resume() {
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
    stop() {
        this.status = 'stopped';
        this.stopTimer();
        this.addLog('info', 'Autotrade stopped.');
        return this.getState();
    }
    resetCircuitBreaker() {
        this.circuitBreakerTripped = false;
        this.circuitBreakerReason = null;
        this.addLog('warn', 'Circuit breaker reset. Trading limits cleared.');
        return this.getState();
    }
    triggerScan() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.scanAndEvaluate(true);
            return this.getState();
        });
    }
    /**
     * Inspect all pending orders and auto-cancel any that exceed the orderTimeoutMinutes TTL.
     * This risk & collateral management task runs unconditionally, even when trading hours have ended
     * or before new trade evaluations.
     */
    checkAndCleanStaleOrders() {
        return __awaiter(this, void 0, void 0, function* () {
            const [orders, positions, balance] = yield Promise.all([
                this.broker.getOrders().catch(() => []),
                this.broker.getPositions().catch(() => []),
                this.broker.getAccountBalance().catch(() => null)
            ]);
            // Synchronize realized PnL today from broker closed PnL
            if (balance && typeof balance.closePnL === 'number') {
                this.todayRealizedPnL = balance.closePnL;
            }
            // Each vertical credit spread consists of one short leg (quantity < 0)
            const shortPositions = Array.isArray(positions) ? positions.filter((p) => p.quantity < 0) : [];
            this.activePositionsCount = shortPositions.length;
            const pendingOrders = Array.isArray(orders) ? orders.filter((o) => o.status === 'pending' ||
                o.status === 'open' ||
                o.status === 'submitted' ||
                o.status === 'accepted' ||
                o.status === 'queued' ||
                o.status === 'held' ||
                o.status === 'partially_filled') : [];
            let activePendingCount = 0;
            const timeoutLimit = this.config.orderTimeoutMinutes || 15;
            for (const pOrd of pendingOrders) {
                const orderDateStr = pOrd.create_date || pOrd.transaction_date;
                const createTime = orderDateStr ? new Date(orderDateStr).getTime() : Date.now();
                const ageMinutes = (Date.now() - createTime) / (1000 * 60);
                if (ageMinutes >= timeoutLimit) {
                    this.addLog('warn', `⏱️ Stale Order Detected: #${pOrd.id} has been working for ${ageMinutes.toFixed(1)}m (exceeded ${timeoutLimit}m TTL). Auto-cancelling to release buying power.`);
                    try {
                        yield this.broker.cancelOrder(pOrd.id);
                        this.addLog('info', `Order #${pOrd.id} cancel request submitted to broker.`);
                    }
                    catch (err) {
                        this.addLog('error', `Failed to auto-cancel timed out order #${pOrd.id}: ${err.message || String(err)}`);
                    }
                }
                else {
                    activePendingCount++;
                    const remaining = (timeoutLimit - ageMinutes).toFixed(1);
                    this.lastScanDecision = `Wait: Order #${pOrd.id} working (${ageMinutes.toFixed(1)}m/${timeoutLimit}m TTL, ~${remaining}m until auto-cancel).`;
                }
            }
            return { activePendingCount, activePositionsCount: this.activePositionsCount };
        });
    }
    // ----- Automated Evaluation Loop -----
    startTimer() {
        this.stopTimer();
        this.timer = setInterval(() => {
            void this.scanAndEvaluate(false);
        }, this.config.scanIntervalSeconds * 1000);
    }
    stopTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    scanAndEvaluate() {
        return __awaiter(this, arguments, void 0, function* (force = false) {
            var _a;
            if (this.isScanning)
                return;
            this.isScanning = true;
            this.lastScanTime = new Date().toISOString();
            try {
                if (this.status !== 'running' && !force) {
                    return;
                }
                // 1. Risk Check: Pending Orders & Stale Order Timeout (TTL) Maintenance
                // Always inspect working orders to cancel stale orders and unlock buying power,
                // regardless of whether new trade execution hours have closed.
                const { activePendingCount, activePositionsCount } = yield this.checkAndCleanStaleOrders();
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
                const indicators = yield this.indicatorsService.getIndicators(this.config.symbol);
                const tags = this.marketTagger.evaluate(indicators);
                const preview = yield this.pricingEngine.calculateLimitPrice(this.config.symbol, tags, (_a = this.config.maxSpreadWidth) !== null && _a !== void 0 ? _a : 10);
                if (preview.action === 'Halt') {
                    this.lastScanDecision = `Halt: ${preview.reason || 'No clear trend'}`;
                    this.addLog('info', `Scan result: Halt (${preview.reason})`);
                    return;
                }
                // 6. Strategy Signal Verified -> Automated Execution
                this.lastScanDecision = `Signal Found: ${preview.strategy} @ limit $${preview.recommendedLimitPrice}`;
                this.addLog('success', `🎯 Signal Detected: ${preview.strategy} (${preview.shortLeg.strike}/${preview.longLeg.strike}) for $${preview.recommendedLimitPrice} credit.`);
                const orderRequest = {
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
                const result = yield this.broker.placeSpreadOrder(orderRequest);
                if (result.success) {
                    this.tradesExecutedToday++;
                    this.lastTradeTime = new Date().toISOString();
                    this.addLog('success', `✅ Order #${result.confirmationNumber} placed successfully (${result.message})`);
                }
                else {
                    this.addLog('error', `❌ Automated order rejected by broker: ${result.message}`);
                }
            }
            catch (e) {
                this.addLog('error', `Error during automated scan: ${e.message || String(e)}`);
            }
            finally {
                this.isScanning = false;
            }
        });
    }
    addLog(level, message) {
        const now = new Date();
        const timeFormatted = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).format(now);
        const entry = {
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
exports.AutotradeEngine = AutotradeEngine;
//# sourceMappingURL=autotrade-engine.js.map