/**
 * @file trade-recommendation-card.component.ts
 * @description Recommendation ticket and execution panel for algorithmic options trades.
 * Displays the market tag-derived strategy, strike geometry, hybrid width cap status,
 * full financial breakdown (Total Premium, Target Profit, Collateral Held, ROC),
 * and provides one-click paper order submission.
 */

import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  TradeRecommendation,
  TradingHoursConfig,
  TradingHoursStatus
} from '../../../../../core/models/options-trading.model';
import {
  calculateExpectedProfit,
  calculateMaxCollateralHeld,
  calculateReturnOnCapital
} from '../../../../../core/utils/options-math.util';

@Component({
  selector: 'app-trade-recommendation-card',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './trade-recommendation-card.component.html',
  styleUrl: './trade-recommendation-card.component.scss'
})
export class TradeRecommendationCardComponent {
  /** The algorithmic trade preview from the Options Pricing Engine */
  @Input() tradePreview: TradeRecommendation | null = null;

  /** Loading state while evaluating market data and pricing chains */
  @Input() isLoading: boolean = false;

  /** Error message if trade analysis failed */
  @Input() errorMessage: string | null = null;

  /** Live evaluation status of the trading hours filter */
  @Input() hoursStatus: TradingHoursStatus | null = null;

  /** Active trading window configuration */
  @Input() hoursConfig: TradingHoursConfig | null = null;

  /** Target profit percentage configured in risk limits (e.g. 50%) */
  @Input() targetProfitPercentage: number = 50;

  /** Loading state while broker is submitting the order */
  @Input() isSubmittingOrder: boolean = false;

  /** Emitted when user clicks 'Refresh Analysis' */
  @Output() refreshRequested = new EventEmitter<void>();

  /** Emitted when user submits the paper trading order */
  @Output() orderSubmitted = new EventEmitter<{ quantity: number }>();

  /** Emitted when user toggles sandbox trading hours bypass */
  @Output() bypassToggled = new EventEmitter<boolean>();

  /** Number of spread contracts user wishes to execute */
  orderQuantity: number = 1;

  /**
   * Strike distance in points between short and long legs.
   */
  get spreadWidth(): number {
    if (!this.tradePreview?.shortLeg?.strike || !this.tradePreview?.longLeg?.strike) {
      return 0;
    }
    return Math.abs(this.tradePreview.shortLeg.strike - this.tradePreview.longLeg.strike);
  }

  /**
   * Recommended limit credit price per share.
   */
  get limitPrice(): number {
    return parseFloat(this.tradePreview?.recommendedLimitPrice || '0') || 0;
  }

  /**
   * Total premium collected in dollars upon opening the trade (Max Profit if expires worthless).
   * Formula: Limit Price * Contracts * 100
   */
  get totalPremiumDollars(): number {
    return this.limitPrice * (this.orderQuantity || 1) * 100;
  }

  /**
   * Target dollar profit based on configured profit target percentage (e.g. 50%).
   */
  get expectedProfitDollars(): number {
    return calculateExpectedProfit(this.totalPremiumDollars, this.targetProfitPercentage);
  }

  /**
   * Total cash held as margin collateral (Capital at Risk).
   * Formula: (Spread Width - Credit) * Contracts * 100
   */
  get collateralHeldDollars(): number {
    return calculateMaxCollateralHeld(this.spreadWidth, this.limitPrice, this.orderQuantity || 1);
  }

  /**
   * Expected Return on Capital (ROC) percentage at target exit.
   */
  get targetReturnOnCapitalPct(): number {
    return calculateReturnOnCapital(this.expectedProfitDollars, this.collateralHeldDollars);
  }

  /**
   * Maximum Return on Capital (ROC) percentage if trade expires worthless.
   */
  get maxReturnOnCapitalPct(): number {
    return calculateReturnOnCapital(this.totalPremiumDollars, this.collateralHeldDollars);
  }

  /**
   * Trigger order submission event.
   */
  submitOrder(): void {
    if (this.orderQuantity >= 1 && (!this.hoursStatus || this.hoursStatus.canExecuteTrade)) {
      this.orderSubmitted.emit({ quantity: this.orderQuantity });
    }
  }

  /**
   * Trigger sandbox bypass state change.
   */
  setBypass(enabled: boolean): void {
    this.bypassToggled.emit(enabled);
  }
}
