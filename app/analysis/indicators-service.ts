import { IBrokerMarketData } from '../brokers/broker.interface';
import { EMA, Stochastic, ADX, RSI, CCI, MACD } from 'technicalindicators';

export interface OHLCV {
  time: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CalculatedIndicators {
  bars: OHLCV[];
  ema8: number[];
  ema9: number[];
  ema20: number[];
  ema21: number[];
  ema100: number[];
  stoch: { k: number, d: number }[];
  adx: { adx: number, pdi: number, mdi: number }[];
  rsi: number[];
  cci: number[];
  macd: { MACD?: number, signal?: number, histogram?: number }[];
}

/**
 * Fetches OHLCV market data via the broker interface and computes
 * technical indicators (EMA, MACD, RSI, CCI, Stochastic, ADX).
 *
 * Key refactor: now depends on IBrokerMarketData.getTimesales() instead of
 * duplicating the Tradier HTTP call and token access internally.
 */
export class IndicatorsService {
  private cache: Map<string, { timestamp: number, data: CalculatedIndicators }> = new Map();
  private CACHE_DURATION_MS = 60 * 1000; // 1 minute cache

  constructor(private broker: IBrokerMarketData) {}

  public async getIndicators(symbol: string, interval: string = '15min', forceRefresh: boolean = false): Promise<CalculatedIndicators> {
    const cacheKey = `${symbol}_${interval}`;
    const cached = this.cache.get(cacheKey);

    if (!forceRefresh && cached && Date.now() - cached.timestamp < this.CACHE_DURATION_MS) {
      return cached.data;
    }

    const bars = await this.fetchBars(symbol, interval);
    if (!bars || bars.length < 100) {
      throw new Error(`Not enough data points for ${symbol}. Needed 100, got ${bars ? bars.length : 0}`);
    }

    const data = this.calculateIndicators(bars);
    this.cache.set(cacheKey, { timestamp: Date.now(), data });
    return data;
  }

  private async fetchBars(symbol: string, interval: string): Promise<OHLCV[]> {
    // Build date range: 14 days back to ensure enough 15m bars
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 14);

    const formatDate = (d: Date) => d.toISOString().replace('T', ' ').substring(0, 16);

    console.log(`[IndicatorsService] Fetching ${interval} market data for ${symbol}...`);

    return this.broker.getTimesales(symbol, interval, formatDate(start), formatDate(end));
  }

  private calculateIndicators(bars: OHLCV[]): CalculatedIndicators {
    const closePrices = bars.map(b => b.close);
    const highPrices = bars.map(b => b.high);
    const lowPrices = bars.map(b => b.low);

    const ema8 = EMA.calculate({ period: 8, values: closePrices });
    const ema9 = EMA.calculate({ period: 9, values: closePrices });
    const ema20 = EMA.calculate({ period: 20, values: closePrices });
    const ema21 = EMA.calculate({ period: 21, values: closePrices });
    const ema100 = EMA.calculate({ period: 100, values: closePrices });

    // STOCH (5, 3, 3, EMA)
    const stoch = Stochastic.calculate({
      high: highPrices,
      low: lowPrices,
      close: closePrices,
      period: 5,
      signalPeriod: 3
    });

    const adx = ADX.calculate({
      high: highPrices,
      low: lowPrices,
      close: closePrices,
      period: 14
    });

    const rsi = RSI.calculate({ period: 14, values: closePrices });

    const cci = CCI.calculate({
      high: highPrices,
      low: lowPrices,
      close: closePrices,
      period: 14
    });

    const macd = MACD.calculate({
      values: closePrices,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    });

    console.log(`[IndicatorsService] Successfully calculated all technical indicators for ${bars.length} periods.`);

    return {
      bars,
      ema8: this.padArray(ema8, bars.length),
      ema9: this.padArray(ema9, bars.length),
      ema20: this.padArray(ema20, bars.length),
      ema21: this.padArray(ema21, bars.length),
      ema100: this.padArray(ema100, bars.length),
      stoch: this.padArray(stoch, bars.length),
      adx: this.padArray(adx, bars.length),
      rsi: this.padArray(rsi, bars.length),
      cci: this.padArray(cci, bars.length),
      macd: this.padArray(macd, bars.length),
    };
  }

  // Helper to align calculated arrays with the original bars array length
  // Since e.g. a 14-period RSI will have 14 fewer elements than the input prices
  private padArray<T>(arr: T[], targetLength: number): (T | null)[] {
    const diff = targetLength - arr.length;
    const padding = new Array(diff).fill(null);
    return [...padding, ...arr];
  }
}
