import { CalculatedIndicators } from './indicators-service';

export type MarketTag = 
  | 'neutral bull market'
  | 'market direction wait'
  | 'neutral bear market'
  | 'bear market'
  | '8ema under 21ema'
  | 'bear market confirmation wait'
  | 'bull market'
  | '8ema above 21ema'
  | 'bull market confirmation wait'
  | 'overbought market'
  | 'oversold market';

export class MarketTagger {
  
  public evaluate(indicators: CalculatedIndicators): MarketTag[] {
    const tags = new Set<MarketTag>();
    
    const len = indicators.bars.length;
    if (len === 0) return ['market direction wait'];
    
    // Helper to get latest values
    const current = (arr: (any | null)[]) => arr[len - 1];
    
    const price = current(indicators.bars)?.close;
    const ema8 = current(indicators.ema8);
    const ema21 = current(indicators.ema21);
    const adx = current(indicators.adx);
    const rsi = current(indicators.rsi);
    const cci = current(indicators.cci);
    const macd = current(indicators.macd);

    console.log(`\n[MarketTagger] Evaluating logic for bar with close price: ${price}`);
    console.log(`[MarketTagger] Metrics -> EMA8: ${ema8?.toFixed(2)}, EMA21: ${ema21?.toFixed(2)}`);
    console.log(`[MarketTagger] Metrics -> ADX: ${adx?.adx?.toFixed(2)}, RSI: ${rsi?.toFixed(2)}, CCI: ${cci?.toFixed(2)}`);
    console.log(`[MarketTagger] Metrics -> MACD: ${macd?.MACD?.toFixed(2)}, Signal: ${macd?.signal?.toFixed(2)}\n`);

    if (ema8 == null || ema21 == null) {
      return ['market direction wait'];
    }

    // Step 1: Base Trend (Bull vs Bear)
    const isBullishTrend = ema8 > ema21;
    const isBearishTrend = ema8 < ema21;
    
    // Step 2: Trend Strength (ADX > 25)
    const isStrongTrend = adx && adx.adx > 25;

    // Evaluate MACD Confirmation (Bullish if MACD > Signal, Bearish if MACD < Signal)
    const isMacdBullish = macd && macd.MACD !== undefined && macd.signal !== undefined && macd.MACD > macd.signal;
    const isMacdBearish = macd && macd.MACD !== undefined && macd.signal !== undefined && macd.MACD < macd.signal;

    if (isBullishTrend) {
      if (!isMacdBullish) {
        tags.add('bull market confirmation wait');
      } else if (isStrongTrend) {
        tags.add('bull market');
      } else {
        tags.add('neutral bull market');
      }
    } else if (isBearishTrend) {
      if (!isMacdBearish) {
        tags.add('bear market confirmation wait');
      } else if (isStrongTrend) {
        tags.add('bear market');
      } else {
        tags.add('neutral bear market');
      }
    } else {
      tags.add('market direction wait');
    }

    // Step 3: Crossovers
    if (this.didCrossSince(indicators.ema8, indicators.ema21, 2, 'over')) {
      tags.add('8ema above 21ema');
    }
    if (this.didCrossSince(indicators.ema8, indicators.ema21, 2, 'under')) {
      tags.add('8ema under 21ema');
    }

    // Step 4: Extremes (Overbought / Oversold)
    if (rsi && rsi > 75 && cci && cci > 100) {
      tags.add('overbought market');
    }
    if (rsi && rsi < 30 && cci && cci < -100) {
      tags.add('oversold market');
    }

    return Array.from(tags);
  }

  private didCrossSince(arr1: (number | null)[], arr2: (number | null)[], periods: number, direction: 'over' | 'under'): boolean {
    const len = arr1.length;
    if (len < periods + 1) return false;

    // Check if current is crossed
    const current1 = arr1[len - 1];
    const current2 = arr2[len - 1];
    
    if (current1 === null || current2 === null) return false;
    
    const currentlyOver = current1 > current2;
    const currentlyUnder = current1 < current2;
    
    if (direction === 'over' && !currentlyOver) return false;
    if (direction === 'under' && !currentlyUnder) return false;

    // Check if it was on the other side N periods ago
    for (let i = 1; i <= periods; i++) {
      const past1 = arr1[len - 1 - i];
      const past2 = arr2[len - 1 - i];
      if (past1 === null || past2 === null) continue;
      
      if (direction === 'over' && past1 <= past2) return true;
      if (direction === 'under' && past1 >= past2) return true;
    }

    return false;
  }
}
