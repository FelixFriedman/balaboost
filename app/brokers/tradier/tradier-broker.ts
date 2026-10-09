import * as dotenv from 'dotenv';
import * as path from 'path';
import { AppEnvironment } from '../../environment';
import { TradierApiClient } from './tradier-api-client';
import {
  IBrokerMarketData,
  QuoteResponse,
  ExpirationsResponse,
  OptionsChainResponse,
  SpreadOrderRequest,
  CloseSpreadRequest,
  OrderResult,
  AccountBalance
} from '../broker.interface';
import { OHLCV } from '../../analysis/indicators-service';

// Load .env from the project root
dotenv.config({ path: path.join(__dirname, '../../../.env') });

const SANDBOX_BASE_URL = 'https://sandbox.tradier.com/v1';
const PROD_BASE_URL = 'https://api.tradier.com/v1';

/**
 * Tradier broker implementation for market data and order execution.
 * Wraps TradierApiClient and implements IBrokerMarketData.
 */
export class TradierBroker implements IBrokerMarketData {
  private currentEnvironment: AppEnvironment = 'sandbox';
  private apiClient: TradierApiClient;
  private cachedAccountId: string | null = null;

  constructor() {
    this.apiClient = new TradierApiClient(
      SANDBOX_BASE_URL,
      this.getToken()
    );
  }

  private getToken(): string {
    const token = this.currentEnvironment === 'sandbox'
      ? process.env.TRADIER_SANDBOX_TOKEN
      : process.env.TRADIER_PROD_TOKEN;

    if (!token) {
      throw new Error(`Tradier API token for ${this.currentEnvironment} is missing in .env`);
    }
    return token;
  }

  public setEnvironment(env: AppEnvironment): void {
    this.currentEnvironment = env;
    this.cachedAccountId = null;
    const baseUrl = env === 'sandbox' ? SANDBOX_BASE_URL : PROD_BASE_URL;
    this.apiClient.configure(baseUrl, this.getToken());
  }

  public getEnvironment(): AppEnvironment {
    return this.currentEnvironment;
  }

  // ----- Account & Orders (Execution) -----

  public async getPrimaryAccountId(): Promise<string> {
    if (this.cachedAccountId) {
      return this.cachedAccountId;
    }
    const profile = await this.apiClient.get<{ profile?: { account?: any } }>('/user/profile');
    const acc = profile?.profile?.account;
    const accountId = Array.isArray(acc) ? acc[0]?.account_number : acc?.account_number;
    if (!accountId) {
      throw new Error('Unable to retrieve Tradier account number from profile');
    }
    this.cachedAccountId = String(accountId);
    return this.cachedAccountId;
  }

  public async placeSpreadOrder(order: SpreadOrderRequest): Promise<OrderResult> {
    const accountId = order.accountId || (await this.getPrimaryAccountId());

    const body: Record<string, string> = {
      class: 'multileg',
      symbol: order.symbol,
      type: order.orderType || 'credit',
      duration: order.duration || 'day',
      price: typeof order.limitPrice === 'number' ? order.limitPrice.toFixed(2) : String(order.limitPrice),
    };

    order.legs.forEach((leg, index) => {
      body[`option_symbol[${index}]`] = leg.optionSymbol;
      body[`side[${index}]`] = leg.side;
      body[`quantity[${index}]`] = String(leg.quantity);
    });

    console.log(`[TradierBroker] Submitting multileg order to account ${accountId}:`, body);

    const res = await this.apiClient.post<{ order?: any; errors?: any }>(`/accounts/${accountId}/orders`, body);

    if (res.errors) {
      const err = typeof res.errors.error === 'string' ? res.errors.error : JSON.stringify(res.errors);
      return {
        success: false,
        message: err
      };
    }

    if (res.order && (res.order.status === 'ok' || res.order.id)) {
      return {
        success: true,
        confirmationNumber: String(res.order.id),
        message: `Order submitted (${res.order.status || 'pending'})`,
        previewData: res.order
      };
    }

    return {
      success: false,
      message: 'Unexpected response from Tradier: ' + JSON.stringify(res)
    };
  }

  public async closeSpreadPosition(order: CloseSpreadRequest): Promise<OrderResult> {
    const accountId = order.accountId || (await this.getPrimaryAccountId());

    const body: Record<string, string> = {
      class: 'multileg',
      symbol: order.symbol,
      type: order.orderType || 'market',
      duration: 'day',
      'option_symbol[0]': order.shortLegSymbol,
      'side[0]': 'buy_to_close',
      'quantity[0]': String(order.quantity),
      'option_symbol[1]': order.longLegSymbol,
      'side[1]': 'sell_to_close',
      'quantity[1]': String(order.quantity)
    };

    if (order.orderType === 'debit' && order.limitPrice != null) {
      body.price = order.limitPrice.toFixed(2);
    }

    console.log(`[TradierBroker] Closing multileg spread in account ${accountId}:`, body);

    const res = await this.apiClient.post<{ order?: any; errors?: any }>(`/accounts/${accountId}/orders`, body);

    if (res.errors) {
      const err = typeof res.errors.error === 'string' ? res.errors.error : JSON.stringify(res.errors);
      return {
        success: false,
        message: err
      };
    }

    if (res.order && (res.order.status === 'ok' || res.order.id)) {
      return {
        success: true,
        confirmationNumber: String(res.order.id),
        message: `Closing order submitted (${res.order.status || 'pending'})`,
        previewData: res.order
      };
    }

    return {
      success: false,
      message: 'Unexpected response from Tradier: ' + JSON.stringify(res)
    };
  }

  public async getAccountBalance(): Promise<AccountBalance> {
    const accountId = await this.getPrimaryAccountId();
    const res = await this.apiClient.get<{ balances?: any }>(`/accounts/${accountId}/balances`);
    const b = res?.balances;
    return {
      totalValue: Number(b?.total_equity || b?.equity || 0),
      cashAvailable: Number(b?.total_cash || 0),
      buyingPower: Number(b?.margin?.stock_buying_power || b?.total_cash || 0),
      optionBuyingPower: Number(b?.margin?.option_buying_power || 0),
      closePnL: Number(b?.close_pl || 0),
      openPnL: Number(b?.open_pl || 0)
    };
  }

  public async getOrders(): Promise<any[]> {
    const accountId = await this.getPrimaryAccountId();
    const [ordersRes, positionsRes] = await Promise.all([
      this.apiClient.get<{ orders?: any }>(`/accounts/${accountId}/orders`, { limit: '100' }).catch(() => ({ orders: null })),
      this.apiClient.get<{ positions?: any }>(`/accounts/${accountId}/positions`).catch(() => ({ positions: null }))
    ]);

    const rawOrders = ordersRes?.orders?.order;
    const todayOrders: any[] = !rawOrders ? [] : Array.isArray(rawOrders) ? rawOrders : [rawOrders];

    for (const ord of todayOrders) {
      if (ord.status === 'filled' && (!ord.price || ord.price === 0) && Array.isArray(ord.leg) && ord.leg.length === 2) {
        const p1 = Number(ord.leg[0].avg_fill_price || 0);
        const p2 = Number(ord.leg[1].avg_fill_price || 0);
        if (p1 > 0 && p2 > 0) {
          ord.price = Number(Math.abs(p1 - p2).toFixed(2));
        }
      }
    }

    const rawPositions = positionsRes?.positions?.position;
    const currentPositions: any[] = !rawPositions ? [] : Array.isArray(rawPositions) ? rawPositions : [rawPositions];

    const synthesizedOrders = this.synthesizeOrdersFromOpenPositions(currentPositions, todayOrders);

    return [...synthesizedOrders, ...todayOrders];
  }

  /**
   * Helper to parse 21-character OCC option symbol into root, expiration, type, and strike.
   */
  private parseOccSymbol(symbol: string): { root: string; exp: string; type: string; strike: number } | null {
    if (!symbol) return null;
    const match = symbol.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
    if (!match) return null;
    return {
      root: match[1],
      exp: match[2],
      type: match[3],
      strike: parseInt(match[4], 10) / 1000
    };
  }

  /**
   * Translates active portfolio positions from /accounts/{id}/positions into standard TradierOrder
   * structures for any positions not already represented in today's filled orders list.
   *
   * Tradier's /accounts/{id}/orders endpoint is strictly an intraday order book that resets
   * at each daily session roll. Completed orders from yesterday become open portfolio positions.
   * This synthesis ensures overnight positions remain visible in the Orders & Working Positions
   * panel with their true collateral, cost basis, and 1-click 'Close Position' functionality.
   */
  private synthesizeOrdersFromOpenPositions(positions: any[], todayOrders: any[]): any[] {
    if (!Array.isArray(positions) || positions.length === 0) return [];

    // Gather all option symbols that already have a filled order in today's order book
    const accountedSymbols = new Set<string>();
    if (Array.isArray(todayOrders)) {
      for (const ord of todayOrders) {
        if (ord.status === 'filled' && Array.isArray(ord.leg)) {
          for (const l of ord.leg) {
            if (l.option_symbol) accountedSymbols.add(l.option_symbol);
          }
        }
      }
    }

    const unrepresented = positions.filter((p: any) => !accountedSymbols.has(p.symbol));
    if (unrepresented.length === 0) return [];

    // Group options by underlying root, expiration date, and option type (Call / Put)
    const optionGroups = new Map<string, any[]>();
    const nonOptions: any[] = [];

    for (const pos of unrepresented) {
      const occ = this.parseOccSymbol(pos.symbol);
      if (!occ) {
        nonOptions.push(pos);
        continue;
      }
      const key = `${occ.root}-${occ.exp}-${occ.type}`;
      if (!optionGroups.has(key)) {
        optionGroups.set(key, []);
      }
      optionGroups.get(key)!.push({ ...pos, occ });
    }

    const synthesized: any[] = [];

    for (const [, items] of optionGroups.entries()) {
      const shorts = items.filter((i: any) => i.quantity < 0);
      const longs = items.filter((i: any) => i.quantity > 0);

      // Pair matching short and long legs into vertical spreads
      while (shorts.length > 0 && longs.length > 0) {
        const s = shorts.shift()!;
        const l = longs.shift()!;
        const spreadQty = Math.min(Math.abs(s.quantity), Math.abs(l.quantity));
        const netCreditPerShare = (Math.abs(s.cost_basis) - Math.abs(l.cost_basis)) / (spreadQty * 100);

        const isPut = s.occ.type === 'P';
        let strategy = 'Vertical Spread';
        if (isPut) {
          strategy = s.occ.strike > l.occ.strike ? 'Bull Put Spread' : 'Bear Put Spread';
        } else {
          strategy = s.occ.strike < l.occ.strike ? 'Bear Call Spread' : 'Bull Call Spread';
        }

        synthesized.push({
          id: s.id,
          type: netCreditPerShare >= 0 ? 'credit' : 'debit',
          symbol: s.occ.root.startsWith('SPX') ? 'SPX' : s.occ.root,
          class: 'multileg',
          num_legs: 2,
          strategy: strategy,
          status: 'filled',
          duration: 'gtc',
          create_date: s.date_acquired || l.date_acquired || new Date().toISOString(),
          transaction_date: s.date_acquired || l.date_acquired,
          price: netCreditPerShare > 0 ? Number(netCreditPerShare.toFixed(2)) : 0.50,
          quantity: spreadQty * 2,
          leg: [
            {
              id: s.id,
              symbol: s.occ.root.startsWith('SPX') ? 'SPX' : s.occ.root,
              option_symbol: s.symbol,
              side: 'sell_to_open',
              quantity: spreadQty
            },
            {
              id: l.id,
              symbol: l.occ.root.startsWith('SPX') ? 'SPX' : l.occ.root,
              option_symbol: l.symbol,
              side: 'buy_to_open',
              quantity: spreadQty
            }
          ]
        });

        if (Math.abs(s.quantity) > spreadQty) {
          shorts.unshift({ ...s, quantity: s.quantity + spreadQty });
        }
        if (Math.abs(l.quantity) > spreadQty) {
          longs.unshift({ ...l, quantity: l.quantity - spreadQty });
        }
      }

      // Any remaining single-leg option positions
      for (const rem of [...shorts, ...longs]) {
        synthesized.push({
          id: rem.id,
          type: rem.quantity < 0 ? 'credit' : 'debit',
          symbol: rem.occ.root.startsWith('SPX') ? 'SPX' : rem.occ.root,
          class: 'option',
          num_legs: 1,
          strategy: rem.occ.type === 'P' ? 'Put' : 'Call',
          status: 'filled',
          duration: 'gtc',
          create_date: rem.date_acquired || new Date().toISOString(),
          transaction_date: rem.date_acquired,
          price: Number((Math.abs(rem.cost_basis) / (Math.abs(rem.quantity) * 100)).toFixed(2)),
          quantity: Math.abs(rem.quantity),
          leg: [
            {
              id: rem.id,
              symbol: rem.occ.root.startsWith('SPX') ? 'SPX' : rem.occ.root,
              option_symbol: rem.symbol,
              side: rem.quantity < 0 ? 'sell_to_open' : 'buy_to_open',
              quantity: Math.abs(rem.quantity)
            }
          ]
        });
      }
    }

    // Any non-option equity positions
    for (const eq of nonOptions) {
      synthesized.push({
        id: eq.id,
        type: 'equity',
        symbol: eq.symbol,
        class: 'equity',
        num_legs: 1,
        strategy: 'Equity',
        status: 'filled',
        duration: 'gtc',
        create_date: eq.date_acquired || new Date().toISOString(),
        transaction_date: eq.date_acquired,
        price: Number((Math.abs(eq.cost_basis) / Math.abs(eq.quantity)).toFixed(2)),
        quantity: Math.abs(eq.quantity)
      });
    }

    return synthesized;
  }

  public async cancelOrder(orderId: string | number): Promise<any> {
    const accountId = await this.getPrimaryAccountId();
    console.log(`[TradierBroker] Canceling order ${orderId} in account ${accountId}`);
    return await this.apiClient.delete(`/accounts/${accountId}/orders/${orderId}`);
  }

  public async getPositions(): Promise<any[]> {
    const accountId = await this.getPrimaryAccountId();
    const res = await this.apiClient.get<{ positions?: any }>(`/accounts/${accountId}/positions`);
    const raw = res?.positions?.position;
    if (!raw) return [];
    return Array.isArray(raw) ? raw : [raw];
  }

  // ----- IBrokerMarketData Implementation -----

  public async getQuote(symbol: string): Promise<QuoteResponse> {
    return this.apiClient.get<QuoteResponse>('/markets/quotes', { symbols: symbol });
  }

  public async getExpirations(symbol: string): Promise<ExpirationsResponse> {
    return this.apiClient.get<ExpirationsResponse>('/markets/options/expirations', {
      symbol,
      includeAllRoots: 'true'
    });
  }

  public async getOptionsChain(symbol: string, expiration: string): Promise<OptionsChainResponse> {
    return this.apiClient.get<OptionsChainResponse>('/markets/options/chains', {
      symbol,
      expiration,
      greeks: 'true'
    });
  }

  public async getTimesales(symbol: string, interval: string, start: string, end: string): Promise<OHLCV[]> {
    const data = await this.apiClient.get<{ series?: { data?: OHLCV[] } }>('/markets/timesales', {
      symbol,
      interval,
      start,
      end
    });
    return data?.series?.data || [];
  }
}
