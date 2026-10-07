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
exports.OptionsPricingEngine = void 0;
class OptionsPricingEngine {
    constructor(broker) {
        this.broker = broker;
    }
    calculateLimitPrice(symbol_1, tags_1) {
        return __awaiter(this, arguments, void 0, function* (symbol, tags, maxSpreadWidth = 20) {
            var _a, _b, _c, _d, _e, _f;
            // Step A: Strategy Selection
            let strategy = 'Halt';
            if (tags.includes('bull market') || tags.includes('neutral bull market')) {
                strategy = 'Bull Put Spread';
            }
            else if (tags.includes('bear market') || tags.includes('neutral bear market')) {
                strategy = 'Bear Call Spread';
            }
            if (strategy === 'Halt' || tags.includes('market direction wait')) {
                return { action: 'Halt', reason: 'Market direction wait or no clear trend.' };
            }
            // Step B: Fetch Expirations and Chain
            const expirationsRes = yield this.broker.getExpirations(symbol);
            const expirations = (_a = expirationsRes === null || expirationsRes === void 0 ? void 0 : expirationsRes.expirations) === null || _a === void 0 ? void 0 : _a.date;
            if (!expirations || expirations.length === 0) {
                throw new Error(`No expirations found for ${symbol}`);
            }
            // Pick an expiration roughly 30 days out, or just use the first available for MVP
            const targetDate = expirations.find((d) => {
                const diff = new Date(d).getTime() - Date.now();
                const days = diff / (1000 * 3600 * 24);
                return days >= 25 && days <= 45;
            }) || expirations[0];
            const chainRes = yield this.broker.getOptionsChain(symbol, targetDate);
            const chain = (_b = chainRes === null || chainRes === void 0 ? void 0 : chainRes.options) === null || _b === void 0 ? void 0 : _b.option;
            if (!chain || chain.length === 0) {
                throw new Error(`No options chain found for ${symbol} on ${targetDate}`);
            }
            // Step B continued: Strike Selection (MVP based on distance from current stock price)
            const quoteRes = yield this.broker.getQuote(symbol);
            const quote = (_c = quoteRes === null || quoteRes === void 0 ? void 0 : quoteRes.quotes) === null || _c === void 0 ? void 0 : _c.quote;
            const currentPrice = Array.isArray(quote) ? (_d = quote[0]) === null || _d === void 0 ? void 0 : _d.last : quote === null || quote === void 0 ? void 0 : quote.last;
            if (!currentPrice) {
                throw new Error(`Could not fetch current price for ${symbol}`);
            }
            let shortLeg;
            let longLeg;
            let capApplied = false;
            if (strategy === 'Bull Put Spread') {
                // Look for puts and ensure greeks are available
                const puts = chain.filter((o) => o.option_type === 'put' && o.greeks && typeof o.greeks.delta === 'number');
                if (puts.length < 2) {
                    return { action: 'Halt', reason: `Insufficient put options with valid Greeks on ${targetDate}.` };
                }
                // Target ~15 Delta (delta for puts is negative, so we use Math.abs)
                const targetShortDelta = 0.15;
                shortLeg = puts.reduce((prev, curr) => Math.abs(Math.abs(curr.greeks.delta) - targetShortDelta) < Math.abs(Math.abs(prev.greeks.delta) - targetShortDelta) ? curr : prev);
                // Target ~10 Delta for long leg, strictly below the short put strike
                const eligibleLongPuts = puts.filter((p) => p.strike < shortLeg.strike);
                if (eligibleLongPuts.length === 0) {
                    return { action: 'Halt', reason: `No valid lower strike found for long put leg below strike ${shortLeg.strike}.` };
                }
                const targetLongDelta = 0.10;
                const deltaCandidate = eligibleLongPuts.reduce((prev, curr) => Math.abs(Math.abs(curr.greeks.delta) - targetLongDelta) < Math.abs(Math.abs(prev.greeks.delta) - targetLongDelta) ? curr : prev);
                // Option 2 Hybrid: Enforce maxSpreadWidth cap if specified
                if (maxSpreadWidth && maxSpreadWidth > 0) {
                    const minAllowedStrike = shortLeg.strike - maxSpreadWidth;
                    if (deltaCandidate.strike < minAllowedStrike) {
                        const cappedPuts = eligibleLongPuts.filter((p) => p.strike >= minAllowedStrike);
                        if (cappedPuts.length > 0) {
                            // Pick the strike closest to minAllowedStrike (furthest out within the cap)
                            longLeg = cappedPuts.reduce((prev, curr) => Math.abs(curr.strike - minAllowedStrike) < Math.abs(prev.strike - minAllowedStrike) ? curr : prev);
                            capApplied = true;
                        }
                        else {
                            // When chain spacing is wider than maxSpreadWidth (e.g. 25pt spacing vs 10pt cap),
                            // clamp to the closest available strike below shortLeg (tightest spread possible on the board)
                            longLeg = eligibleLongPuts.reduce((prev, curr) => curr.strike > prev.strike ? curr : prev);
                            capApplied = true;
                        }
                    }
                    else {
                        longLeg = deltaCandidate;
                    }
                }
                else {
                    longLeg = deltaCandidate;
                }
            }
            else {
                // Bear Call Spread: Look for calls and ensure greeks are available
                const calls = chain.filter((o) => o.option_type === 'call' && o.greeks && typeof o.greeks.delta === 'number');
                if (calls.length < 2) {
                    return { action: 'Halt', reason: `Insufficient call options with valid Greeks on ${targetDate}.` };
                }
                // Target ~15 Delta
                const targetShortDelta = 0.15;
                shortLeg = calls.reduce((prev, curr) => Math.abs(Math.abs(curr.greeks.delta) - targetShortDelta) < Math.abs(Math.abs(prev.greeks.delta) - targetShortDelta) ? curr : prev);
                // Target ~10 Delta for long leg, strictly above the short call strike
                const eligibleLongCalls = calls.filter((c) => c.strike > shortLeg.strike);
                if (eligibleLongCalls.length === 0) {
                    return { action: 'Halt', reason: `No valid higher strike found for long call leg above strike ${shortLeg.strike}.` };
                }
                const targetLongDelta = 0.10;
                const deltaCandidate = eligibleLongCalls.reduce((prev, curr) => Math.abs(Math.abs(curr.greeks.delta) - targetLongDelta) < Math.abs(Math.abs(prev.greeks.delta) - targetLongDelta) ? curr : prev);
                // Option 2 Hybrid: Enforce maxSpreadWidth cap if specified
                if (maxSpreadWidth && maxSpreadWidth > 0) {
                    const maxAllowedStrike = shortLeg.strike + maxSpreadWidth;
                    if (deltaCandidate.strike > maxAllowedStrike) {
                        const cappedCalls = eligibleLongCalls.filter((c) => c.strike <= maxAllowedStrike);
                        if (cappedCalls.length > 0) {
                            // Pick the strike closest to maxAllowedStrike (furthest out within the cap)
                            longLeg = cappedCalls.reduce((prev, curr) => Math.abs(curr.strike - maxAllowedStrike) < Math.abs(prev.strike - maxAllowedStrike) ? curr : prev);
                            capApplied = true;
                        }
                        else {
                            // When chain spacing is wider than maxSpreadWidth,
                            // clamp to the closest available strike above shortLeg (tightest spread possible on the board)
                            longLeg = eligibleLongCalls.reduce((prev, curr) => curr.strike < prev.strike ? curr : prev);
                            capApplied = true;
                        }
                    }
                    else {
                        longLeg = deltaCandidate;
                    }
                }
                else {
                    longLeg = deltaCandidate;
                }
            }
            // Step C: Fair Value (Mid Price)
            const shortMid = (shortLeg.bid + shortLeg.ask) / 2;
            const longMid = (longLeg.bid + longLeg.ask) / 2;
            const netCreditMid = shortMid - longMid;
            if (netCreditMid <= 0.10) {
                return {
                    action: 'Halt',
                    reason: `Calculated net credit ($${netCreditMid.toFixed(2)}) is insufficient for viable spread entry.`
                };
            }
            // Step D: Tag-Based Aggressiveness
            let limitPrice = netCreditMid;
            let aggressiveness = 'Neutral';
            if (tags.includes('bull market') || tags.includes('bear market')) {
                // Strong trend: Give up 5% to guarantee a fast fill
                limitPrice = netCreditMid * 0.95;
                aggressiveness = 'Aggressive (Strong Trend)';
            }
            else if (tags.includes('oversold market') || tags.includes('overbought market')) {
                // Extremes: Demand 10% more premium
                limitPrice = netCreditMid * 1.10;
                aggressiveness = 'Contrarian Premium (Extreme Market)';
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
                    delta: (_e = shortLeg.greeks) === null || _e === void 0 ? void 0 : _e.delta
                },
                longLeg: {
                    symbol: longLeg.symbol,
                    strike: longLeg.strike,
                    bid: longLeg.bid,
                    ask: longLeg.ask,
                    mid: longMid.toFixed(2),
                    delta: (_f = longLeg.greeks) === null || _f === void 0 ? void 0 : _f.delta
                },
                netCreditMid: netCreditMid.toFixed(2),
                recommendedLimitPrice: roundedLimitPrice,
                aggressiveness,
                spreadWidth,
                maxSpreadWidthCap: maxSpreadWidth,
                capApplied,
                tagsUsed: tags
            };
        });
    }
}
exports.OptionsPricingEngine = OptionsPricingEngine;
//# sourceMappingURL=options-pricing-engine.js.map