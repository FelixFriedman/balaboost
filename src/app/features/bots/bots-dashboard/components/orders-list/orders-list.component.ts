/**
 * @file orders-list.component.ts
 * @description Component displaying active, filled, pending, and canceled Tradier orders.
 * Accurately parses OCC option symbols, multileg spread quantities, financial collateral,
 * target profit amounts, and provides order cancellation and close-position initiation.
 */

import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TradierOrder } from '../../../../../core/models/options-trading.model';
import {
  calculateExpectedProfit,
  calculateMaxCollateralHeld,
  calculateOrderSpreadWidth,
  calculateReturnOnCapital,
  formatOccOptionSymbol,
  formatOrderSide,
  getSpreadCountFromOrder
} from '../../../../../core/utils/options-math.util';

@Component({
  selector: 'app-orders-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './orders-list.component.html',
  styleUrl: './orders-list.component.scss'
})
export class OrdersListComponent {
  /** Complete list of orders from the broker */
  @Input() orders: TradierOrder[] = [];

  /** Loading state during network fetch */
  @Input() isLoading: boolean = false;

  /** Active filter tab ('all' | 'pending' | 'filled' | 'canceled') */
  @Input() activeFilter: 'all' | 'pending' | 'filled' | 'canceled' = 'all';

  /** Whether canceled and rejected orders are hidden from active tabs */
  @Input() hideCanceledAndRejected: boolean = false;

  /** Set of order IDs manually dismissed by the user */
  @Input() dismissedOrderIds: Set<number> = new Set<number>();

  /** ID of order currently undergoing broker cancellation */
  @Input() cancellingOrderId: number | null = null;

  /** Success notification message after cancelling an order */
  @Input() cancelMessage: string | null = null;

  /** Target profit percentage configured in risk settings (e.g., 50%) */
  @Input() profitTargetPct: number = 50;

  /** Emitted when filter tab changes */
  @Output() filterChanged = new EventEmitter<'all' | 'pending' | 'filled' | 'canceled'>();

  /** Emitted when hide canceled/rejected checkbox is toggled */
  @Output() hideCanceledToggled = new EventEmitter<boolean>();

  /** Emitted when user dismisses a terminal state order */
  @Output() orderDismissed = new EventEmitter<number>();

  /** Emitted when user restores all dismissed orders */
  @Output() allDismissedCleared = new EventEmitter<void>();

  /** Emitted when user requests manual order refresh */
  @Output() refreshRequested = new EventEmitter<void>();

  /** Emitted when user clicks Cancel on a working order */
  @Output() cancelRequested = new EventEmitter<number>();

  /** Emitted when user requests opening the close modal for a filled position */
  @Output() closeModalRequested = new EventEmitter<TradierOrder>();

  /**
   * Filtered list of orders based on current view tab, dismissed set, and hide settings.
   */
  get filteredOrders(): TradierOrder[] {
    if (!this.orders || !Array.isArray(this.orders)) {
      return [];
    }

    // Filter out locally dismissed orders
    let list = this.orders.filter(order => !this.dismissedOrderIds.has(order.id));

    // When hideCanceledAndRejected is true, hide canceled/rejected/expired orders across non-canceled views
    if (this.hideCanceledAndRejected && this.activeFilter !== 'canceled') {
      list = list.filter(order => order.status !== 'canceled' && order.status !== 'rejected' && order.status !== 'expired');
    }

    if (this.activeFilter === 'pending') {
      return list.filter(order =>
        order.status === 'pending' ||
        order.status === 'open' ||
        order.status === 'submitted' ||
        order.status === 'accepted' ||
        order.status === 'queued' ||
        order.status === 'held' ||
        order.status === 'partially_filled'
      );
    }

    if (this.activeFilter === 'filled') {
      return list.filter(order => order.status === 'filled');
    }

    if (this.activeFilter === 'canceled') {
      return this.orders.filter(order =>
        order.status === 'canceled' || order.status === 'rejected' || order.status === 'expired'
      );
    }

    return list;
  }

  /**
   * Number of orders currently hidden from view.
   */
  get hiddenOrdersCount(): number {
    if (!this.orders || !Array.isArray(this.orders)) {
      return 0;
    }
    return this.orders.filter(order =>
      this.dismissedOrderIds.has(order.id) ||
      (this.hideCanceledAndRejected &&
        this.activeFilter !== 'canceled' &&
        (order.status === 'canceled' || order.status === 'rejected' || order.status === 'expired'))
    ).length;
  }

  /**
   * Select a filter tab and emit event.
   */
  selectFilter(filter: 'all' | 'pending' | 'filled' | 'canceled'): void {
    this.filterChanged.emit(filter);
  }

  /**
   * Toggle the hide canceled/rejected preference and emit event.
   */
  toggleHideCanceled(value: boolean): void {
    this.hideCanceledToggled.emit(value);
  }

  /**
   * Extract actual spread units accounting for Tradier's 2-leg quantity quirks.
   */
  getSpreadCount(order: TradierOrder): number {
    return getSpreadCountFromOrder(order);
  }

  /**
   * Calculate width in points between legs for a 2-leg spread order.
   */
  getOrderSpreadWidth(order: TradierOrder): number {
    return calculateOrderSpreadWidth(order);
  }

  /**
   * Calculate total credit received in dollars upon fill.
   */
  getOrderTotalCredit(order: TradierOrder): number {
    const limitPrice = order.price || 0;
    const spreads = this.getSpreadCount(order);
    return limitPrice * spreads * 100;
  }

  /**
   * Calculate target profit in dollars based on configured target percentage.
   */
  getOrderExpectedProfit(order: TradierOrder): number {
    const totalCredit = this.getOrderTotalCredit(order);
    return calculateExpectedProfit(totalCredit, this.profitTargetPct);
  }

  /**
   * Calculate cash held as collateral (Capital at Risk).
   */
  getOrderMaxCollateral(order: TradierOrder): number {
    const spreadWidth = this.getOrderSpreadWidth(order);
    const limitPrice = order.price || 0;
    const spreads = this.getSpreadCount(order);
    return calculateMaxCollateralHeld(spreadWidth, limitPrice, spreads);
  }

  /**
   * Target Return on Capital percentage for this order.
   */
  getOrderReturnOnCapital(order: TradierOrder): number {
    const profit = this.getOrderExpectedProfit(order);
    const collateral = this.getOrderMaxCollateral(order);
    return calculateReturnOnCapital(profit, collateral);
  }

  /**
   * Format human-readable option string from OCC symbol.
   */
  formatOptionSymbol(symbol: string): string {
    return formatOccOptionSymbol(symbol);
  }

  /**
   * Format order side for display.
   */
  formatSide(side: string): string {
    return formatOrderSide(side);
  }
}
