import { IBrokerMarketData } from '../brokers/broker.interface';
import { MarketTag } from '../analysis/market-tagger';

export type ExecutionMode = 'adaptive_walk' | 'natural_fill' | 'strict_mid';

export class OptionsPricingEngine {
  constructor(private broker: IBrokerMarketData) {}

  public async calculateLimitPrice(
    symbol: string, 
    tags: MarketTag[], 
    maxSpreadWidth: number = 20,
    executionMode: ExecutionMode = 'adaptive_walk'
  ): Promise<any> {
    // Step A: Strategy Selection
    let strategy: 'Bull Put Spread' | 'Bear Call Spread' | 'Halt' = 'Halt';
    
    if (tags.includes('bull market') || tags.includes('neutral bull market')) {
      strategy = 'Bull Put Spread';
    } else if (tags.includes('bear market') || tags.includes('neutral bear market')) {
      strategy = 'Bear Call Spread';
    }

    if (strategy === 'Halt' || tags.includes('market direction wait')) {
      return { action: 'Halt', reason: 'Market direction wait or no clear trend.' };
    }

    // Step B: Fetch Expirations and Chain
    const expirationsRes = await this.broker.getExpirations(symbol);
    const expirations = expirationsRes?.expirations?.date;
    if (!expirations || expirations.length === 0) {
      throw new Error(`No expirations found for ${symbol}`);
    }

    // Pick an expiration roughly 30 days out, or just use the first available for MVP
    const targetDate = expirations.find((d: string) => {
        const diff = new Date(d).getTime() - Date.now();
        const days = diff / (1000 * 3600 * 24);
        return days >= 25 && days <= 45;
    }) || expirations[0];

    const chainRes = await this.broker.getOptionsChain(symbol, targetDate);
    const chain = chainRes?.options?.option;
    if (!chain || chain.length === 0) {
      throw new Error(`No options chain found for ${symbol} on ${targetDate}`);
    }

    // Step B continued: Strike Selection (MVP based on distance from current stock price)
    const quoteRes = await this.broker.getQuote(symbol);
    const quote = quoteRes?.quotes?.quote;
    const currentPrice = Array.isArray(quote) ? quote[0]?.last : quote?.last;
    if (!currentPrice) {
      throw new Error(`Could not fetch current price for ${symbol}`);
    }

    let shortLeg: any;
    let longLeg: any;
    let capApplied = false;

    if (strategy === 'Bull Put Spread') {
      // Look for puts and ensure greeks are available
      const puts = chain.filter((o: any) => o.option_type === 'put' && o.greeks && typeof o.greeks.delta === 'number');
      if (puts.length < 2) {
        return { action: 'Halt', reason: `Insufficient put options with valid Greeks on ${targetDate}.` };
      }
      
      // Target ~15 Delta (delta for puts is negative, so we use Math.abs)
      const targetShortDelta = 0.15;
      shortLeg = puts.reduce((prev: any, curr: any) => 
        Math.abs(Math.abs(curr.greeks.delta) - targetShortDelta) < Math.abs(Math.abs(prev.greeks.delta) - targetShortDelta) ? curr : prev
      );
      
      // Target ~10 Delta for long leg, strictly below the short put strike
      const eligibleLongPuts = puts.filter((p: any) => p.strike < shortLeg.strike);
      if (eligibleLongPuts.length === 0) {
        return { action: 'Halt', reason: `No valid lower strike found for long put leg below strike ${shortLeg.strike}.` };
      }

      const targetLongDelta = 0.10;
      const deltaCandidate = eligibleLongPuts.reduce((prev: any, curr: any) => 
        Math.abs(Math.abs(curr.greeks.delta) - targetLongDelta) < Math.abs(Math.abs(prev.greeks.delta) - targetLongDelta) ? curr : prev
      );

      // Option 2 Hybrid: Enforce maxSpreadWidth cap if specified
      if (maxSpreadWidth && maxSpreadWidth > 0) {
        const minAllowedStrike = shortLeg.strike - maxSpreadWidth;
        if (deltaCandidate.strike < minAllowedStrike) {
          const cappedPuts = eligibleLongPuts.filter((p: any) => p.strike >= minAllowedStrike);
          if (cappedPuts.length > 0) {
            // Pick the strike closest to minAllowedStrike (furthest out within the cap)
            longLeg = cappedPuts.reduce((prev: any, curr: any) => 
              Math.abs(curr.strike - minAllowedStrike) < Math.abs(prev.strike - minAllowedStrike) ? curr : prev
            );
            capApplied = true;
          } else {
            // When chain spacing is wider than maxSpreadWidth (e.g. 25pt spacing vs 10pt cap),
            // clamp to the closest available strike below shortLeg (tightest spread possible on the board)
            longLeg = eligibleLongPuts.reduce((prev: any, curr: any) => 
              curr.strike > prev.strike ? curr : prev
            );
            capApplied = true;
          }
        } else {
          longLeg = deltaCandidate;
        }
      } else {
        longLeg = deltaCandidate;
      }
    } else {
      // Bear Call Spread: Look for calls and ensure greeks are available
      const calls = chain.filter((o: any) => o.option_type === 'call' && o.greeks && typeof o.greeks.delta === 'number');
      if (calls.length < 2) {
        return { action: 'Halt', reason: `Insufficient call options with valid Greeks on ${targetDate}.` };
      }
      
      // Target ~15 Delta
      const targetShortDelta = 0.15;
      shortLeg = calls.reduce((prev: any, curr: any) => 
        Math.abs(Math.abs(curr.greeks.delta) - targetShortDelta) < Math.abs(Math.abs(prev.greeks.delta) - targetShortDelta) ? curr : prev
      );
      
      // Target ~10 Delta for long leg, strictly above the short call strike
      const eligibleLongCalls = calls.filter((c: any) => c.strike > shortLeg.strike);
      if (eligibleLongCalls.length === 0) {
        return { action: 'Halt', reason: `No valid higher strike found for long call leg above strike ${shortLeg.strike}.` };
      }

      const targetLongDelta = 0.10;
      const deltaCandidate = eligibleLongCalls.reduce((prev: any, curr: any) => 
        Math.abs(Math.abs(curr.greeks.delta) - targetLongDelta) < Math.abs(Math.abs(prev.greeks.delta) - targetLongDelta) ? curr : prev
      );

      // Option 2 Hybrid: Enforce maxSpreadWidth cap if specified
      if (maxSpreadWidth && maxSpreadWidth > 0) {
        const maxAllowedStrike = shortLeg.strike + maxSpreadWidth;
        if (deltaCandidate.strike > maxAllowedStrike) {
          const cappedCalls = eligibleLongCalls.filter((c: any) => c.strike <= maxAllowedStrike);
          if (cappedCalls.length > 0) {
            // Pick the strike closest to maxAllowedStrike (furthest out within the cap)
            longLeg = cappedCalls.reduce((prev: any, curr: any) => 
              Math.abs(curr.strike - maxAllowedStrike) < Math.abs(prev.strike - maxAllowedStrike) ? curr : prev
            );
            capApplied = true;
          } else {
            // When chain spacing is wider than maxSpreadWidth,
            // clamp to the closest available strike above shortLeg (tightest spread possible on the board)
            longLeg = eligibleLongCalls.reduce((prev: any, curr: any) => 
              curr.strike < prev.strike ? curr : prev
            );
            capApplied = true;
          }
        } else {
          longLeg = deltaCandidate;
        }
      } else {
        longLeg = deltaCandidate;
      }
    }

    // Step C: Fair Value (Mid Price) & Natural Market (Touch) Price
    const shortMid = (shortLeg.bid + shortLeg.ask) / 2;
    const longMid = (longLeg.bid + longLeg.ask) / 2;
    const netCreditMid = shortMid - longMid;

    // Natural Credit: Immediate cross at Market Bid (sell short) and Market Ask (buy long)
    const naturalCredit = Math.max(0.05, shortLeg.bid - longLeg.ask);

    if (netCreditMid <= 0.10) {
      return { 
        action: 'Halt', 
        reason: `Calculated net credit ($${netCreditMid.toFixed(2)}) is insufficient for viable spread entry.` 
      };
    }

    // Step D: Execution Mode & Tag-Based Aggressiveness
    let limitPrice = netCreditMid;
    let aggressiveness = 'Neutral';

    if (executionMode === 'natural_fill') {
      // Natural fill concession for instant paper execution / market fill
      limitPrice = naturalCredit;
      aggressiveness = 'Natural Fill (Instant Paper Execution)';
    } else if (executionMode === 'strict_mid') {
      limitPrice = netCreditMid;
      aggressiveness = 'Strict Mid-Price Limit';
    } else {
      // 'adaptive_walk' (default): Starts at Mid or slightly concessionary depending on market trend
      if (tags.includes('bull market') || tags.includes('bear market')) {
        // Strong trend: Start with 5% edge concession to accelerate discovery
        limitPrice = netCreditMid * 0.95;
        aggressiveness = 'Adaptive Walk (Strong Trend - 5% start)';
      } else if (tags.includes('oversold market') || tags.includes('overbought market')) {
        // Extremes: Demand 5% more premium as anchor
        limitPrice = netCreditMid * 1.05;
        aggressiveness = 'Adaptive Walk (Extreme Market - Premium Anchor)';
      } else {
        limitPrice = netCreditMid;
        aggressiveness = 'Adaptive Walk (Balanced Mid Discovery)';
      }
    }

    // Standard SPX options nickel rounding (nearest $0.05)
    const roundedLimitPrice = (Math.max(0.10, Math.round(limitPrice * 20) / 20)).toFixed(2);
    const spreadWidth = Math.abs(shortLeg.strike - longLeg.strike);

    return {
      action: 'Trade',
      symbol,
      strategy,
      expiration: targetDate,
      underlyingPrice: currentPrice,
      shortLeg: {
        symbol: shortLeg.symbol,
        strike: shortLeg.strike,
        bid: shortLeg.bid,
        ask: shortLeg.ask,
        mid: shortMid.toFixed(2),
        delta: shortLeg.greeks?.delta
      },
      longLeg: {
        symbol: longLeg.symbol,
        strike: longLeg.strike,
        bid: longLeg.bid,
        ask: longLeg.ask,
        mid: longMid.toFixed(2),
        delta: longLeg.greeks?.delta
      },
      netCreditMid: netCreditMid.toFixed(2),
      naturalCredit: naturalCredit.toFixed(2),
      recommendedLimitPrice: roundedLimitPrice,
      executionMode,
      aggressiveness,
      spreadWidth,
      maxSpreadWidthCap: maxSpreadWidth,
      capApplied,
      tagsUsed: tags
    };
  }
}
