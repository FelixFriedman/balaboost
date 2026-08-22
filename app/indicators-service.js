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
exports.IndicatorsService = void 0;
const technicalindicators_1 = require("technicalindicators");
class IndicatorsService {
    constructor(tradierService) {
        this.tradierService = tradierService;
        this.cache = new Map();
        this.CACHE_DURATION_MS = 60 * 1000; // 1 minute cache
    }
    getIndicators(symbol_1) {
        return __awaiter(this, arguments, void 0, function* (symbol, interval = '15min') {
            const cacheKey = `${symbol}_${interval}`;
            const cached = this.cache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION_MS) {
                return cached.data;
            }
            const bars = yield this.fetchBars(symbol, interval);
            if (!bars || bars.length < 100) {
                throw new Error(`Not enough data points for ${symbol}. Needed 100, got ${bars ? bars.length : 0}`);
            }
            const data = this.calculateIndicators(bars);
            this.cache.set(cacheKey, { timestamp: Date.now(), data });
            return data;
        });
    }
    fetchBars(symbol, interval) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const baseUrl = this.tradierService.getEnvironment() === 'sandbox'
                ? 'https://sandbox.tradier.com/v1'
                : 'https://api.tradier.com/v1';
            // We fetch timesales for intraday. Note: for sandbox, timesales might be limited. 
            // We add start/end dates to get enough data. Let's get the last 7 days to be safe.
            const end = new Date();
            const start = new Date();
            start.setDate(end.getDate() - 14); // 14 days back to ensure enough 15m bars
            // Format: YYYY-MM-DD HH:MM
            const formatDate = (d) => d.toISOString().replace('T', ' ').substring(0, 16);
            const url = `${baseUrl}/markets/timesales?symbol=${symbol}&interval=${interval}&start=${formatDate(start)}&end=${formatDate(end)}`;
            console.log(`[IndicatorsService] Fetching ${interval} market data for ${symbol} from Tradier...`);
            const response = yield fetch(url, {
                method: 'GET',
                headers: {
                    // We need to grab the token from tradierService. Since getToken is private, we will just use process.env
                    'Authorization': `Bearer ${this.tradierService.getEnvironment() === 'sandbox' ? process.env.TRADIER_SANDBOX_TOKEN : process.env.TRADIER_PROD_TOKEN}`,
                    'Accept': 'application/json'
                }
            });
            if (!response.ok) {
                const errorBody = yield response.text();
                throw new Error(`Tradier API Error (${response.status}): ${errorBody}`);
            }
            const data = yield response.json();
            return ((_a = data === null || data === void 0 ? void 0 : data.series) === null || _a === void 0 ? void 0 : _a.data) || [];
        });
    }
    calculateIndicators(bars) {
        const closePrices = bars.map(b => b.close);
        const highPrices = bars.map(b => b.high);
        const lowPrices = bars.map(b => b.low);
        const ema8 = technicalindicators_1.EMA.calculate({ period: 8, values: closePrices });
        const ema9 = technicalindicators_1.EMA.calculate({ period: 9, values: closePrices });
        const ema20 = technicalindicators_1.EMA.calculate({ period: 20, values: closePrices });
        const ema21 = technicalindicators_1.EMA.calculate({ period: 21, values: closePrices });
        const ema100 = technicalindicators_1.EMA.calculate({ period: 100, values: closePrices });
        // STOCH (5, 3, 3, EMA)
        // technicalindicators stoch defaults to SMA. To use EMA, we might need a custom approach or just use the default SMA smoothing for now.
        const stoch = technicalindicators_1.Stochastic.calculate({
            high: highPrices,
            low: lowPrices,
            close: closePrices,
            period: 5,
            signalPeriod: 3
        });
        const adx = technicalindicators_1.ADX.calculate({
            high: highPrices,
            low: lowPrices,
            close: closePrices,
            period: 14
        });
        const rsi = technicalindicators_1.RSI.calculate({ period: 14, values: closePrices });
        const cci = technicalindicators_1.CCI.calculate({
            high: highPrices,
            low: lowPrices,
            close: closePrices,
            period: 14
        });
        const macd = technicalindicators_1.MACD.calculate({
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
    padArray(arr, targetLength) {
        const diff = targetLength - arr.length;
        const padding = new Array(diff).fill(null);
        return [...padding, ...arr];
    }
}
exports.IndicatorsService = IndicatorsService;
//# sourceMappingURL=indicators-service.js.map