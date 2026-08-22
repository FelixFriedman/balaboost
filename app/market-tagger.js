"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketTagger = void 0;
class MarketTagger {
    evaluate(indicators) {
        var _a, _b;
        const tags = new Set(['market direction wait']); // Default tag, will be removed by untag logic
        const len = indicators.bars.length;
        if (len === 0)
            return Array.from(tags);
        // Helper to get latest values
        const current = (arr) => arr[len - 1];
        // Helper to get values N days ago
        const ago = (arr, daysAgo) => arr[len - 1 - daysAgo];
        const price = current(indicators.bars).close;
        const ema9 = current(indicators.ema9);
        const ema20 = current(indicators.ema20);
        const ema8 = current(indicators.ema8);
        const ema21 = current(indicators.ema21);
        const ema100 = current(indicators.ema100);
        const stoch = current(indicators.stoch);
        const adx = current(indicators.adx);
        const rsi = current(indicators.rsi);
        const cci = current(indicators.cci);
        const macd = current(indicators.macd);
        const ema8_8daysAgo = ago(indicators.ema8, 8);
        const ema21_8daysAgo = ago(indicators.ema21, 8);
        console.log(`\n[MarketTagger] Evaluating logic for bar with close price: ${price}`);
        console.log(`[MarketTagger] Metrics -> EMA9: ${ema9 === null || ema9 === void 0 ? void 0 : ema9.toFixed(2)}, EMA20: ${ema20 === null || ema20 === void 0 ? void 0 : ema20.toFixed(2)}, EMA8: ${ema8 === null || ema8 === void 0 ? void 0 : ema8.toFixed(2)}, EMA21: ${ema21 === null || ema21 === void 0 ? void 0 : ema21.toFixed(2)}`);
        console.log(`[MarketTagger] Metrics -> STOCH.k: ${(_a = stoch === null || stoch === void 0 ? void 0 : stoch.k) === null || _a === void 0 ? void 0 : _a.toFixed(2)}, ADX: ${(_b = adx === null || adx === void 0 ? void 0 : adx.adx) === null || _b === void 0 ? void 0 : _b.toFixed(2)}, RSI: ${rsi === null || rsi === void 0 ? void 0 : rsi.toFixed(2)}, CCI: ${cci === null || cci === void 0 ? void 0 : cci.toFixed(2)}`);
        console.log(`[MarketTagger] Metrics -> 8 days ago EMA8: ${ema8_8daysAgo === null || ema8_8daysAgo === void 0 ? void 0 : ema8_8daysAgo.toFixed(2)}, EMA21: ${ema21_8daysAgo === null || ema21_8daysAgo === void 0 ? void 0 : ema21_8daysAgo.toFixed(2)}\n`);
        // Initial Condition
        if (this.didCrossSince(indicators.ema8, indicators.ema21, 2, 'over')) {
            tags.add('8ema above 21ema');
        }
        // Main Branch 1
        if ((ema8_8daysAgo && ema21_8daysAgo && ema8_8daysAgo > ema21_8daysAgo) || (ema9 && ema20 && price > ema9 && price > ema20)) {
            tags.add('neutral bull market');
            tags.delete('market direction wait');
        }
        else {
            tags.add('bull market confirmation wait');
            tags.delete('market direction wait');
        }
        // Main Branch 2
        if (ema9 && ema20 && price > ema9 && price > ema20) {
            tags.add('neutral bull market');
            tags.delete('market direction wait');
        }
        // Main Branch 3
        if (stoch && stoch.k < 40) {
            tags.add('neutral bear market');
            tags.delete('market direction wait');
            if (ema8 && ema21 && ema8 < ema21) {
                if (ema8_8daysAgo && ema21_8daysAgo && ema8_8daysAgo < ema21_8daysAgo) {
                    if (adx && adx.adx > 25) {
                        tags.add('bear market');
                        tags.delete('neutral bear market');
                        if (this.didCrossSince(indicators.ema8, indicators.ema21, 2, 'under')) {
                            tags.add('8ema under 21ema');
                        }
                    }
                    else {
                        tags.add('bear market confirmation wait');
                        tags.delete('neutral bear market');
                    }
                }
            }
        }
        // Main Branch 4
        if (ema8 && ema21 && ema8 > ema21) {
            tags.add('neutral bull market');
            tags.delete('market direction wait');
        }
        // Main Branch 5
        if (ema100 && price < ema100 && ((rsi && rsi > 30) || (cci && cci > -100))) {
            if (macd && macd.MACD !== undefined && macd.signal !== undefined && macd.MACD < macd.signal) {
                if (ema8 && ema21 && ema8 < ema21) {
                    const ema8_10daysAgo = ago(indicators.ema8, 10);
                    const ema21_10daysAgo = ago(indicators.ema21, 10);
                    if (ema8_10daysAgo && ema21_10daysAgo && ema8_10daysAgo < ema21_10daysAgo) {
                        tags.add('bear market');
                        tags.delete('market direction wait');
                        if (this.didCrossSince(indicators.ema8, indicators.ema21, 2, 'under')) {
                            tags.add('8ema under 21ema');
                        }
                    }
                    else {
                        if ((ema8_8daysAgo && ema21_8daysAgo && ema8_8daysAgo < ema21_8daysAgo) ||
                            (ema9 && ema20 && price < ema9 && price < ema20)) {
                            tags.add('neutral bear market');
                            tags.delete('market direction wait');
                        }
                        else {
                            tags.add('bear market confirmation wait');
                            tags.delete('market direction wait');
                        }
                    }
                }
            }
        }
        // Main Branch 6
        if (ema9 && ema20 && price < ema9 && price < ema20) {
            tags.add('neutral bear market');
            tags.delete('market direction wait');
        }
        // Main Branch 7
        if (stoch && stoch.k > 40) {
            tags.add('neutral bull market');
            tags.delete('market direction wait');
            if (ema8 && ema21 && ema8 > ema21) {
                if (ema8_8daysAgo && ema21_8daysAgo && ema8_8daysAgo > ema21_8daysAgo) {
                    if (adx && adx.adx > 25) {
                        tags.add('bull market');
                        tags.delete('neutral bull market');
                        if (this.didCrossSince(indicators.ema8, indicators.ema21, 2, 'over')) {
                            tags.add('8ema above 21ema');
                        }
                    }
                    else {
                        tags.add('bull market confirmation wait');
                        tags.delete('neutral bull market');
                    }
                }
            }
        }
        // Main Branch 8
        if (ema8 && ema21 && ema8 < ema21) {
            tags.add('neutral bear market');
            tags.delete('market direction wait');
        }
        // Main Branch 9
        if (rsi && rsi > 75 && cci && cci > 100) {
            tags.add('overbought market');
            tags.delete('market direction wait');
        }
        // Main Branch 10
        if (rsi && rsi < 30 && cci && cci < -100) {
            tags.add('oversold market');
            tags.delete('market direction wait');
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
            if (direction === 'over' && past1 < past2)
                return true;
            if (direction === 'under' && past1 > past2)
                return true;
        }
        return false;
    }
}
exports.MarketTagger = MarketTagger;
//# sourceMappingURL=market-tagger.js.map