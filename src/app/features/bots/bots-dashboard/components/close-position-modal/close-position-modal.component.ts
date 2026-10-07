/**
 * @file close-position-modal.component.ts
 * @description Dialog modal component for exiting active multileg credit spread positions.
 * Constructs the reversal spread order (Buy to Close short leg, Sell to Close long leg)
 * with user-configurable debit limit or market pricing.
 */

import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TradierOrder, TradierOrderLeg } from '../../../../../core/models/options-trading.model';
import {
  calculateBuyToCloseDebit,
  formatOccOptionSymbol,
  getSpreadCountFromOrder
} from '../../../../../core/utils/options-math.util';
import { TradierService } from '../../../../../core/services';

@Component({
  selector: 'app-close-position-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './close-position-modal.component.html',
  styleUrl: './close-position-modal.component.scss'
})
export class ClosePositionModalComponent implements OnInit {
  private tradierService = inject(TradierService);

  /**
   * The active multileg order/position being closed.
   */
  @Input({ required: true }) order!: TradierOrder;

  /**
   * Emitted when a closing order has been successfully placed with the broker.
   */
  @Output() orderPlaced = new EventEmitter<void>();

  /**
   * Emitted when the modal is dismissed or canceled by the user.
   */
  @Output() dismissed = new EventEmitter<void>();

  /** Number of spread units to buy back (default: all open units) */
  spreadQuantityToClose: number = 1;

  /** Closing order execution type: 'debit' limit or 'market' */
  closeOrderType: 'debit' | 'market' = 'debit';

  /** Maximum debit limit price per contract the trader is willing to pay to exit */
  closeLimitPrice: number = 0.50;

  /** Loading state indicator while communicating with broker */
  isSubmittingCloseOrder: boolean = false;

  /** Successful placement response details from Tradier */
  closeSuccessDetails: { confirmationNumber: string; message: string } | null = null;

  /** Error message if closing order is rejected */
  closeErrorMessage: string | null = null;

  ngOnInit(): void {
    this.spreadQuantityToClose = this.maxSpreadsAvailable;
    const entryCreditPrice = this.order.price ? Number(this.order.price) : 1.00;
    // Default to standard 50% profit target buy-to-close debit
    this.closeLimitPrice = calculateBuyToCloseDebit(entryCreditPrice, 50);
  }

  /**
   * Total number of open spread units available to close.
   */
  get maxSpreadsAvailable(): number {
    return getSpreadCountFromOrder(this.order);
  }

  /**
   * Identifies the short leg (original sell_to_open) that must now be bought back.
   */
  get shortLegToBuy(): TradierOrderLeg | undefined {
    return this.order.leg?.find(leg => leg.side?.toLowerCase().includes('sell'));
  }

  /**
   * Identifies the long protective wing (original buy_to_open) that must now be sold.
   */
  get longLegToSell(): TradierOrderLeg | undefined {
    return this.order.leg?.find(leg => leg.side?.toLowerCase().includes('buy'));
  }

  /**
   * Formats an OCC symbol into a readable string for the template.
   */
  formatSymbol(symbol: string | undefined): string {
    return symbol ? formatOccOptionSymbol(symbol) : '';
  }

  /**
   * Sets the closing debit limit to achieve a specific percentage of profit on the initial credit.
   *
   * @param profitTargetPercentage Desired profit percentage (e.g. 50 for 50%, 75 for 75%).
   */
  setProfitTarget(profitTargetPercentage: number): void {
    const entryCreditPrice = this.order.price ? Number(this.order.price) : 1.00;
    this.closeLimitPrice = calculateBuyToCloseDebit(entryCreditPrice, profitTargetPercentage);
  }

  /**
   * Dismisses the modal.
   */
  cancel(): void {
    this.dismissed.emit();
  }

  /**
   * Submits the 2-leg reversal order to the Tradier broker:
   * - Short leg: buy_to_close
   * - Long leg: sell_to_close
   */
  async submitCloseOrder(): Promise<void> {
    const shortLeg = this.shortLegToBuy;
    const longLeg = this.longLegToSell;

    if (!shortLeg || !longLeg) {
      this.closeErrorMessage = 'Could not identify both short and long legs for this vertical spread.';
      return;
    }

    this.isSubmittingCloseOrder = true;
    this.closeErrorMessage = null;
    this.closeSuccessDetails = null;

    try {
      const closeRequest = {
        symbol: this.order.symbol,
        shortLegSymbol: shortLeg.option_symbol,
        longLegSymbol: longLeg.option_symbol,
        quantity: this.spreadQuantityToClose,
        orderType: this.closeOrderType,
        limitPrice: this.closeOrderType === 'debit' ? this.closeLimitPrice : undefined
      };

      const result = await this.tradierService.closeSpreadPosition(closeRequest);

      if (result.success) {
        this.closeSuccessDetails = {
          confirmationNumber: result.orderId?.toString() || 'SUBMITTED',
          message: result.message || 'Closing order submitted successfully to exchange.'
        };
        this.orderPlaced.emit();
      } else {
        this.closeErrorMessage = result.message || 'Closing order was rejected by Tradier.';
      }
    } catch (error: any) {
      this.closeErrorMessage = error.message || 'An unexpected error occurred while placing the closing order.';
      console.error('Close spread error:', error);
    } finally {
      this.isSubmittingCloseOrder = false;
    }
  }
}
