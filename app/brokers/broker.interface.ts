import { OHLCV } from '../analysis/indicators-service';

// ----- Market Data Types -----

export interface QuoteResponse {
  quotes: {
    quote: QuoteData | QuoteData[];
  };
}

export interface QuoteData {
  symbol: string;
  description: string;
  last: number;
  change: number;
  change_percentage: number;
  volume: number;
  open: number;
  high: number;
  low: number;
  close: number;
  bid: number;
  ask: number;
  bidsize: number;
  asksize: number;
  [key: string]: unknown;
}

export interface ExpirationsResponse {
  expirations: {
    date: string[];
  };
}

export interface OptionContract {
  symbol: string;
  option_type: 'call' | 'put';
  strike: number;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  open_interest: number;
  greeks?: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
    mid_iv: number;
  };
  [key: string]: unknown;
}

export interface OptionsChainResponse {
  options: {
    option: OptionContract[];
  };
}

// ----- Market Data Interface -----

/**
 * Interface for brokers that provide market data (quotes, options chains, timesales).
 * Implemented by TradierBroker. Any future market data provider (Schwab, IBKR, etc.)
 * would implement this same interface.
 */
export interface IBrokerMarketData {
  getQuote(symbol: string): Promise<QuoteResponse>;
  getExpirations(symbol: string): Promise<ExpirationsResponse>;
  getOptionsChain(symbol: string, expiration: string): Promise<OptionsChainResponse>;
  getTimesales(symbol: string, interval: string, start: string, end: string): Promise<OHLCV[]>;
}

// ----- Execution Types -----

export interface SpreadOrderLeg {
  side: 'buy_to_open' | 'sell_to_open' | 'buy_to_close' | 'sell_to_close';
  quantity: number;
  optionSymbol: string;
}

export interface SpreadOrderRequest {
  accountId?: string;
  symbol: string;
  strategy: 'Bull Put Spread' | 'Bear Call Spread';
  duration: 'day' | 'gtc';
  orderType: 'credit' | 'debit' | 'limit';
  limitPrice: number;
  legs: SpreadOrderLeg[];
}

export interface CloseSpreadRequest {
  accountId?: string;
  symbol: string;
  shortLegSymbol: string;
  longLegSymbol: string;
  quantity: number;
  orderType: 'debit' | 'market';
  limitPrice?: number;
}

export interface OrderResult {
  success: boolean;
  confirmationNumber?: string;
  message?: string;
  previewData?: Record<string, unknown>;
}

export interface Position {
  symbol: string;
  quantity: number;
  costBasis: number;
  currentValue: number;
  gainLoss: number;
}

export interface AccountBalance {
  totalValue: number;
  cashAvailable: number;
  buyingPower: number;
  optionBuyingPower?: number;
  closePnL?: number;
  openPnL?: number;
}

// ----- Execution Interface -----

/**
 * Interface for brokers that support trade execution.
 * Implemented by VanguardBroker (Phase 2) via Playwright automation.
 */
export interface IBrokerExecution {
  login(): Promise<void>;
  placeSpreadOrder(order: SpreadOrderRequest): Promise<OrderResult>;
  getPositions(): Promise<Position[]>;
  getAccountBalance(): Promise<AccountBalance>;
  disconnect(): Promise<void>;
}
