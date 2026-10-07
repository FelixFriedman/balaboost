/**
 * @file bots-dashboard.component.ts
 * @description Master orchestrator component for the Balaboost Algorithmic Options Trading Dashboard.
 * Coordinates real-time market data streaming, Tradier broker communication, autotrade bot state management,
 * and delegates UI presentation to focused standalone child components:
 * - MarketChartComponent: Interactive TradingView OHLC chart with 8/21 EMA indicators.
 * - TradeRecommendationCardComponent: Algorithm recommendations and paper trading tickets.
 * - OrdersListComponent: Working, filled, and canceled Tradier orders.
 * - ClosePositionModalComponent: Multileg debit limit exit orders.
 * - RiskLimitsDrawerComponent: Circuit breaker, position sizing, and hybrid width caps.
 * - TradingHoursDrawerComponent: Peak liquidity window schedule and sandbox bypass.
 * - AutotradeTerminalComponent: Real-time decision logs and execution feed.
 */

import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TradierService, ElectronService } from '../../../core/services';
import { AutotradeState, AutotradeRiskConfig } from '../../../core/models/autotrade.model';
import {
  TradierOrder,
  TradierAccountBalance,
  TradeRecommendation,
  TradingHoursConfig,
  TradingHoursStatus
} from '../../../core/models/options-trading.model';

// Standalone Child Components
import { MarketChartComponent } from './components/market-chart/market-chart.component';
import { TradeRecommendationCardComponent } from './components/trade-recommendation-card/trade-recommendation-card.component';
import { OrdersListComponent } from './components/orders-list/orders-list.component';
import { ClosePositionModalComponent } from './components/close-position-modal/close-position-modal.component';
import { RiskLimitsDrawerComponent } from './components/risk-limits-drawer/risk-limits-drawer.component';
import { TradingHoursDrawerComponent } from './components/trading-hours-drawer/trading-hours-drawer.component';
import { AutotradeTerminalComponent } from './components/autotrade-terminal/autotrade-terminal.component';

@Component({
  selector: 'app-bots-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MarketChartComponent,
    TradeRecommendationCardComponent,
    OrdersListComponent,
    ClosePositionModalComponent,
    RiskLimitsDrawerComponent,
    TradingHoursDrawerComponent,
    AutotradeTerminalComponent
  ],
  templateUrl: './bots-dashboard.component.html',
  styleUrl: './bots-dashboard.component.scss'
})
export class BotsDashboardComponent implements OnInit, OnDestroy {
  private tradierService = inject(TradierService);
  private electronService = inject(ElectronService);

  /** Whether the application is running inside Electron desktop container */
  isElectron: boolean = false;

  /** Underlying stock quote data for SPX */
  quoteData: any = null;

  /** Dynamic technical market regime tags (e.g., BULLISH_TREND, HIGH_IV) */
  marketTags: string[] = [];

  /** Historical OHLC bars and technical indicators dataset for charting */
  chartIndicators: any = null;

  /** Algorithmic credit spread recommendation preview */
  tradePreview: TradeRecommendation | null = null;

  /** Loading state indicator while pricing options chains */
  tradePreviewLoading: boolean = false;

  /** Error message if algorithmic trade evaluation fails */
  tradePreviewError: string | null = null;

  // ===== Autotrade Mode State =====

  /** Live state of the automated trading engine (positions, P&L, circuit breaker) */
  autotradeState: AutotradeState | null = null;

  /** Loading state during engine lifecycle transitions */
  autotradeLoading: boolean = false;

  /** Drawer toggle for risk and loss limit configurations */
  showRiskSettings: boolean = false;

  /** Active risk parameters passed to the engine */
  riskConfig: AutotradeRiskConfig = {
    symbol: 'SPX',
    maxDailyLoss: 500,
    stopLossMultiplier: 2.0,
    profitTargetPct: 50,
    maxConcurrentPositions: 2,
    contractsPerTrade: 1,
    cooldownMinutes: 15,
    scanIntervalSeconds: 30,
    orderTimeoutMinutes: 15,
    autoResumeOnLaunch: true,
    maxSpreadWidth: 20
  };

  /** Toast feedback message after autotrade action (e.g. paused, started) */
  autotradeActionMessage: string | null = null;

  /** Polling timer handle for checking autotrade engine status */
  private autotradePollInterval: ReturnType<typeof setInterval> | null = null;

  // ===== Broker Account & Orders State =====

  /** Tradier account balance (cash, buying power, equity) */
  accountBalance: TradierAccountBalance | null = null;

  /** Loading state while querying account balance */
  accountBalanceLoading: boolean = false;

  /** Submitting state when manually placing paper orders */
  submittingOrder: boolean = false;

  /** List of broker orders */
  orders: TradierOrder[] = [];

  /** Loading state while querying order list */
  ordersLoading: boolean = false;

  /** Current orders tab filter */
  orderFilter: 'all' | 'pending' | 'filled' | 'canceled' = 'all';

  /** Whether to hide terminal canceled/rejected orders from active views */
  hideCanceledAndRejected: boolean = true;

  /** Set of order IDs manually hidden/dismissed by user */
  dismissedOrderIds: Set<number> = new Set<number>();

  /** ID of order currently undergoing broker cancellation */
  cancelingOrderId: number | null = null;

  /** Cancellation success notification */
  cancelMessage: string | null = null;

  // ===== Trading Hours Filter State =====

  /** Current Eastern Time status and market window validation */
  hoursStatus: TradingHoursStatus | null = null;

  /** Trading hours configuration rules */
  hoursConfig: TradingHoursConfig = {
    enabled: true,
    startTime: '10:00',
    endTime: '15:00',
    allowWeekend: false,
    allowOutsideHoursPaper: false
  };

  /** Drawer toggle for editing trading schedule */
  showHoursSettings: boolean = false;

  /** Interval handle for ticking clock */
  private clockInterval: ReturnType<typeof setInterval> | null = null;

  // ===== Close Position Modal State =====

  /** Currently selected multileg order being closed in modal */
  closingOrder: TradierOrder | null = null;

  ngOnInit(): void {
    this.isElectron = this.electronService.isElectron;
    this.restoreUserPreferences();

    void this.fetchHoursStatus();
    this.clockInterval = setInterval(() => void this.updateHoursClock(), 1000);

    void this.fetchAutotradeState();
    this.autotradePollInterval = setInterval(() => void this.fetchAutotradeState(), 3000);

    void this.fetchData();
    void this.fetchAccountBalance();
    void this.fetchOrders();
  }

  ngOnDestroy(): void {
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
    }
    if (this.autotradePollInterval) {
      clearInterval(this.autotradePollInterval);
    }
  }

  /**
   * Restores user preferences from localStorage (dismissed orders, filter tabs, risk limits, hours).
   */
  private restoreUserPreferences(): void {
    try {
      const storedDismissed = localStorage.getItem('balaboost_dismissed_orders');
      if (storedDismissed) {
        this.dismissedOrderIds = new Set(JSON.parse(storedDismissed));
      }
    } catch (e) {
      console.warn('Could not read dismissed orders:', e);
    }

    try {
      const storedHours = localStorage.getItem('balaboost_hours_config');
      if (storedHours) {
        this.hoursConfig = { ...this.hoursConfig, ...JSON.parse(storedHours) };
      }
    } catch (e) {
      console.warn('Could not read hours config:', e);
    }

    try {
      const storedRisk = localStorage.getItem('balaboost_risk_config');
      if (storedRisk) {
        const parsed = JSON.parse(storedRisk);
        if (parsed.orderTimeoutMinutes === 3) {
          parsed.orderTimeoutMinutes = 15;
        }
        if (parsed.maxSpreadWidth === 10) {
          parsed.maxSpreadWidth = 20;
        }
        this.riskConfig = { ...this.riskConfig, ...parsed };
        localStorage.setItem('balaboost_risk_config', JSON.stringify(this.riskConfig));
      }
    } catch (e) {
      console.warn('Could not read risk config:', e);
    }

    try {
      const storedHide = localStorage.getItem('balaboost_hide_canceled');
      if (storedHide !== null) {
        this.hideCanceledAndRejected = JSON.parse(storedHide);
      }
    } catch (e) {
      console.warn('Could not read hide canceled setting:', e);
    }

    try {
      const storedFilter = localStorage.getItem('balaboost_order_filter');
      if (storedFilter && ['all', 'pending', 'filled', 'canceled'].includes(storedFilter)) {
        this.orderFilter = storedFilter as 'all' | 'pending' | 'filled' | 'canceled';
      }
    } catch (e) {
      console.warn('Could not read order filter setting:', e);
    }
  }

  /**
   * Fetches quote data, market tags, indicators, and initializes trade recommendation.
   */
  private async fetchData(): Promise<void> {
    try {
      this.quoteData = await this.tradierService.getQuote('SPX');
      this.marketTags = await this.tradierService.getMarketTags('SPX');

      const indicators = await this.tradierService.getIndicators('SPX');
      if (indicators && indicators.bars) {
        this.chartIndicators = indicators;
      }

      await this.fetchTradePreview();
    } catch (e) {
      console.error('Failed to fetch market data:', e);
    }
  }

  /**
   * Queries broker account buying power and cash balance.
   */
  async fetchAccountBalance(): Promise<void> {
    this.accountBalanceLoading = true;
    try {
      this.accountBalance = await this.tradierService.getAccountBalance();
    } catch (e) {
      console.error('Failed to fetch account balance:', e);
    } finally {
      this.accountBalanceLoading = false;
    }
  }

  /**
   * Queries order history from Tradier Sandbox.
   *
   * @param silent If true, suppresses the loading spinner for background polling.
   */
  async fetchOrders(silent: boolean = false): Promise<void> {
    if (!silent) {
      this.ordersLoading = true;
    }
    try {
      const orders = await this.tradierService.getOrders();
      if (Array.isArray(orders)) {
        this.orders = orders;
      }
    } catch (e) {
      console.error('Failed to fetch orders:', e);
    } finally {
      if (!silent) {
        this.ordersLoading = false;
      }
    }
  }

  /**
   * Cancels a pending or open order via Tradier broker API.
   *
   * @param orderId The broker order identifier.
   */
  async cancelOrder(orderId: number): Promise<void> {
    this.cancelingOrderId = orderId;
    this.cancelMessage = null;
    try {
      const res = await this.tradierService.cancelOrder(orderId);
      if (res?.order?.status === 'ok') {
        this.cancelMessage = `Order #${orderId} was canceled successfully.`;
      }
      await this.fetchOrders();
      await this.fetchAccountBalance();
    } catch (e: any) {
      console.error('Failed to cancel order:', e);
    } finally {
      this.cancelingOrderId = null;
    }
  }

  /**
   * Evaluates market conditions and requests an algorithmic trade recommendation.
   */
  async fetchTradePreview(): Promise<void> {
    this.tradePreviewLoading = true;
    this.tradePreviewError = null;

    try {
      this.tradePreview = await this.tradierService.previewTrade('SPX');
    } catch (e: any) {
      this.tradePreviewError = e.message || 'Failed to generate trade preview';
      console.error('Trade preview error:', e);
    } finally {
      this.tradePreviewLoading = false;
    }
  }

  /**
   * Handles paper order submission from the recommendation card.
   *
   * @param event Object containing the requested contract quantity.
   */
  async handleOrderSubmitted(event: { quantity: number }): Promise<void> {
    if (
      !this.tradePreview ||
      this.tradePreview.action !== 'Trade' ||
      !this.tradePreview.shortLeg?.symbol ||
      !this.tradePreview.longLeg?.symbol ||
      !this.tradePreview.recommendedLimitPrice
    ) {
      return;
    }

    if (this.hoursStatus && !this.hoursStatus.canExecuteTrade) {
      alert(`Order blocked: ${this.hoursStatus.reason}.`);
      return;
    }

    this.submittingOrder = true;
    try {
      const orderRequest = {
        symbol: this.tradePreview.symbol || 'SPX',
        strategy: this.tradePreview.strategy,
        duration: 'day',
        orderType: 'credit',
        limitPrice: parseFloat(this.tradePreview.recommendedLimitPrice),
        legs: [
          {
            optionSymbol: this.tradePreview.shortLeg.symbol,
            side: 'sell_to_open',
            quantity: event.quantity
          },
          {
            optionSymbol: this.tradePreview.longLeg.symbol,
            side: 'buy_to_open',
            quantity: event.quantity
          }
        ]
      };

      const result = await this.tradierService.placeSpreadOrder(orderRequest);
      if (result.success) {
        await this.fetchAccountBalance();
        await this.fetchOrders();
      } else {
        alert(`Order was rejected: ${result.message}`);
      }
    } catch (e: any) {
      console.error('Order submission error:', e);
      alert(`Error submitting order: ${e.message}`);
    } finally {
      this.submittingOrder = false;
    }
  }

  // ===== Trading Hours Methods =====

  async fetchHoursStatus(): Promise<void> {
    try {
      this.hoursStatus = await this.tradierService.setTradingHoursConfig(this.hoursConfig);
    } catch (e) {
      console.error('Failed to fetch trading hours status:', e);
    }
  }

  async updateHoursClock(): Promise<void> {
    try {
      this.hoursStatus = await this.tradierService.getTradingHoursStatus();
    } catch (e) {
      // Background clock tick
    }
  }

  async saveTradingHours(updatedConfig: TradingHoursConfig): Promise<void> {
    this.hoursConfig = { ...updatedConfig };
    try {
      this.hoursStatus = await this.tradierService.setTradingHoursConfig(this.hoursConfig);
      localStorage.setItem('balaboost_hours_config', JSON.stringify(this.hoursConfig));
      this.showHoursSettings = false;
    } catch (e) {
      console.error('Failed to save hours config:', e);
    }
  }

  async handleSandboxBypass(enabled: boolean): Promise<void> {
    this.hoursConfig.allowOutsideHoursPaper = enabled;
    await this.saveTradingHours(this.hoursConfig);
  }

  toggleHoursSettings(): void {
    this.showHoursSettings = !this.showHoursSettings;
  }

  // ===== Order List Event Handlers =====

  handleFilterChange(filter: 'all' | 'pending' | 'filled' | 'canceled'): void {
    this.orderFilter = filter;
    if (filter === 'canceled') {
      this.hideCanceledAndRejected = false;
    }
    try {
      localStorage.setItem('balaboost_order_filter', filter);
      localStorage.setItem('balaboost_hide_canceled', JSON.stringify(this.hideCanceledAndRejected));
    } catch (e) {
      console.warn('Could not save filter preference:', e);
    }
  }

  handleHideCanceledChange(hidden: boolean): void {
    this.hideCanceledAndRejected = hidden;
    try {
      localStorage.setItem('balaboost_hide_canceled', JSON.stringify(this.hideCanceledAndRejected));
    } catch (e) {
      console.warn('Could not save hide canceled setting:', e);
    }
  }

  handleOrderDismissed(orderId: number): void {
    this.dismissedOrderIds.add(orderId);
    try {
      localStorage.setItem('balaboost_dismissed_orders', JSON.stringify(Array.from(this.dismissedOrderIds)));
    } catch (e) {
      console.warn('Could not save dismissed orders:', e);
    }
  }

  handleClearDismissed(): void {
    this.dismissedOrderIds.clear();
    try {
      localStorage.removeItem('balaboost_dismissed_orders');
    } catch (e) {
      console.warn('Could not clear dismissed orders:', e);
    }
  }

  // ===== Close Position Modal Handlers =====

  openCloseModal(order: TradierOrder): void {
    this.closingOrder = order;
  }

  closeClosingModal(): void {
    this.closingOrder = null;
  }

  async handleClosePositionPlaced(): Promise<void> {
    this.closingOrder = null;
    await this.fetchOrders();
    await this.fetchAccountBalance();
  }

  // ===== Autotrade Engine Control Methods =====

  async fetchAutotradeState(): Promise<void> {
    try {
      const state = await this.tradierService.getAutotradeState();
      if (state) {
        const previousTrades = this.autotradeState?.tradesExecutedToday ?? 0;
        this.autotradeState = state;
        if (!this.showRiskSettings && state.config) {
          this.riskConfig = { ...state.config };
        }
        if (state.tradesExecutedToday !== previousTrades) {
          void this.fetchAccountBalance();
        }
      } else if (!this.autotradeState) {
        this.autotradeState = {
          status: 'stopped',
          config: { ...this.riskConfig },
          circuitBreakerTripped: false,
          circuitBreakerReason: null,
          todayRealizedPnL: 0,
          tradesExecutedToday: 0,
          lastScanTime: null,
          lastTradeTime: null,
          lastScanDecision: 'Ready · Waiting for activation',
          activePositionsCount: 0,
          logs: [
            {
              id: 'init',
              timestamp: new Date().toISOString(),
              timeFormatted: new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York' }),
              level: 'info',
              message: 'Autotrade engine initialized with default risk parameters.'
            }
          ]
        };
      }
      void this.fetchOrders(true);
    } catch (e) {
      console.warn('Could not fetch autotrade state:', e);
    }
  }

  async startAutotrade(): Promise<void> {
    this.autotradeLoading = true;
    this.autotradeActionMessage = null;
    try {
      const state = await this.tradierService.startAutotrade();
      if (state) {
        this.autotradeState = state;
        this.autotradeActionMessage = 'Autotrade engine started.';
      }
    } catch (e: any) {
      this.autotradeActionMessage = `Error starting: ${e.message}`;
    } finally {
      this.autotradeLoading = false;
      this.clearActionMessageAfterDelay();
    }
  }

  async pauseAutotrade(): Promise<void> {
    this.autotradeLoading = true;
    this.autotradeActionMessage = null;
    try {
      const state = await this.tradierService.pauseAutotrade();
      if (state) {
        this.autotradeState = state;
        this.autotradeActionMessage = 'Autotrade paused. Automated orders suspended.';
      }
    } catch (e: any) {
      this.autotradeActionMessage = `Error pausing: ${e.message}`;
    } finally {
      this.autotradeLoading = false;
      this.clearActionMessageAfterDelay();
    }
  }

  async resumeAutotrade(): Promise<void> {
    this.autotradeLoading = true;
    this.autotradeActionMessage = null;
    try {
      const state = await this.tradierService.resumeAutotrade();
      if (state) {
        this.autotradeState = state;
        this.autotradeActionMessage = 'Autotrade resumed.';
      }
    } catch (e: any) {
      this.autotradeActionMessage = `Error resuming: ${e.message}`;
    } finally {
      this.autotradeLoading = false;
      this.clearActionMessageAfterDelay();
    }
  }

  async stopAutotrade(): Promise<void> {
    this.autotradeLoading = true;
    this.autotradeActionMessage = null;
    try {
      const state = await this.tradierService.stopAutotrade();
      if (state) {
        this.autotradeState = state;
        this.autotradeActionMessage = 'Autotrade stopped.';
      }
    } catch (e: any) {
      this.autotradeActionMessage = `Error stopping: ${e.message}`;
    } finally {
      this.autotradeLoading = false;
      this.clearActionMessageAfterDelay();
    }
  }

  async resetCircuitBreaker(): Promise<void> {
    this.autotradeLoading = true;
    try {
      const state = await this.tradierService.resetCircuitBreaker();
      if (state) {
        this.autotradeState = state;
        this.autotradeActionMessage = 'Circuit breaker reset. Daily risk limit restored.';
      }
    } catch (e: any) {
      this.autotradeActionMessage = `Error resetting circuit breaker: ${e.message}`;
    } finally {
      this.autotradeLoading = false;
      this.clearActionMessageAfterDelay();
    }
  }

  async triggerAutotradeScan(): Promise<void> {
    this.autotradeLoading = true;
    try {
      const state = await this.tradierService.triggerAutotradeScan();
      if (state) {
        this.autotradeState = state;
        await this.fetchOrders();
        await this.fetchAccountBalance();
      }
    } catch (e: any) {
      console.error('Trigger scan error:', e);
    } finally {
      this.autotradeLoading = false;
    }
  }

  toggleRiskSettings(): void {
    this.showRiskSettings = !this.showRiskSettings;
  }

  async saveRiskLimits(updatedConfig: AutotradeRiskConfig): Promise<void> {
    try {
      this.riskConfig = { ...updatedConfig };
      localStorage.setItem('balaboost_risk_config', JSON.stringify(this.riskConfig));

      const updated = await this.tradierService.setAutotradeConfig(this.riskConfig);
      if (updated) {
        this.riskConfig = { ...updated };
        if (this.autotradeState) {
          this.autotradeState.config = { ...updated };
        }
      }
      this.showRiskSettings = false;
      this.autotradeActionMessage = 'Risk limits saved across sessions.';
    } catch (e: any) {
      this.autotradeActionMessage = `Failed to save risk config: ${e.message}`;
    } finally {
      this.clearActionMessageAfterDelay();
    }
  }

  private clearActionMessageAfterDelay(): void {
    setTimeout(() => {
      this.autotradeActionMessage = null;
    }, 4000);
  }
}
