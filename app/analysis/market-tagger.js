"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketTagger = void 0;
class MarketTagger {
    evaluate(indicators) {
        var _a, _b, _c, _d;
        const tags = new Set();
        const len = indicators.bars.length;
        if (len === 0)
            return ['market direction wait'];
        // Helper to get latest values
        const current = (arr) => arr[len - 1];
        const price = (_a = current(indicators.bars)) === null || _a === void 0 ? void 0 : _a.close;
        const ema8 = current(indicators.ema8);
        const ema21 = current(indicators.ema21);
        const adx = current(indicators.adx);
        const rsi = current(indicators.rsi);
        const cci = current(indicators.cci);
        const macd = current(indicators.macd);
        console.log(`\n[MarketTagger] Evaluating logic for bar with close price: ${price}`);
        console.log(`[MarketTagger] Metrics -> EMA8: ${ema8 === null || ema8 === void 0 ? void 0 : ema8.toFixed(2)}, EMA21: ${ema21 === null || ema21 === void 0 ? void 0 : ema21.toFixed(2)}`);
        console.log(`[MarketTagger] Metrics -> ADX: ${(_b = adx === null || adx === void 0 ? void 0 : adx.adx) === null || _b === void 0 ? void 0 : _b.toFixed(2)}, RSI: ${rsi === null || rsi === void 0 ? void 0 : rsi.toFixed(2)}, CCI: ${cci === null || cci === void 0 ? void 0 : cci.toFixed(2)}`);
        console.log(`[MarketTagger] Metrics -> MACD: ${(_c = macd === null || macd === void 0 ? void 0 : macd.MACD) === null || _c === void 0 ? void 0 : _c.toFixed(2)}, Signal: ${(_d = macd === null || macd === void 0 ? void 0 : macd.signal) === null || _d === void 0 ? void 0 : _d.toFixed(2)}\n`);
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
            }
            else if (isStrongTrend) {
                tags.add('bull market');
            }
            else {
                tags.add('neutral bull market');
            }
        }
        else if (isBearishTrend) {
            if (!isMacdBearish) {
                tags.add('bear market confirmation wait');
            }
            else if (isStrongTrend) {
                tags.add('bear market');
            }
            else {
                tags.add('neutral bear market');
            }
        }
        else {
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
    didCrossSince(arr1, arr2, periods, direction) {
        const len = arr1.length;
        if (len < periods + 1)
            return false;
        // Check if current is crossed
        const current1 = arr1[len - 1];
        const current2 = arr2[len - 1];
        if (current1 === null || current2 === null)
            return false;
        const currentlyOver = current1 > current2;
        const currentlyUnder = current1 < current2;
        if (direction === 'over' && !currentlyOver)
            return false;
        if (direction === 'under' && !currentlyUnder)
            return false;
        // Check if it was on the other side N periods ago
        for (let i = 1; i <= periods; i++) {
            const past1 = arr1[len - 1 - i];
            const past2 = arr2[len - 1 - i];
            if (past1 === null || past2 === null)
                continue;
            if (direction === 'over' && past1 <= past2)
                return true;
            if (direction === 'under' && past1 >= past2)
                return true;
        }
        return false;
    }
}
exports.MarketTagger = MarketTagger;
//# sourceMappingURL=market-tagger.js.map