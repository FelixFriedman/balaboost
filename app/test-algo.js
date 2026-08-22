"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var market_tagger_1 = require("./market-tagger");
var indicators_service_1 = require("./indicators-service");
var dotenv = __importStar(require("dotenv"));
dotenv.config({ path: '.env' });
var MockTradierService = /** @class */ (function () {
    function MockTradierService() {
    }
    MockTradierService.prototype.getEnvironment = function () { return 'sandbox'; };
    return MockTradierService;
}());
function run() {
    return __awaiter(this, void 0, void 0, function () {
        var tradier, indicatorsService, tagger, symbol, originalFetchBars, indicators, _loop_1, N, e_1;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('Testing Market Tagger Algorithm for a significant drop...');
                    tradier = new MockTradierService();
                    indicatorsService = new indicators_service_1.IndicatorsService(tradier);
                    tagger = new market_tagger_1.MarketTagger();
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    symbol = 'SPX';
                    originalFetchBars = indicatorsService.fetchBars.bind(indicatorsService);
                    indicatorsService.fetchBars = function (sym, interval) { return __awaiter(_this, void 0, void 0, function () {
                        var baseUrl, start, end, url, response, data;
                        var _a;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    baseUrl = 'https://sandbox.tradier.com/v1';
                                    start = '2026-06-23 00:00';
                                    end = '2026-07-03 23:59';
                                    url = "".concat(baseUrl, "/markets/timesales?symbol=").concat(sym, "&interval=").concat(interval, "&start=").concat(start, "&end=").concat(end);
                                    console.log('Fetching:', url);
                                    return [4 /*yield*/, fetch(url, {
                                            method: 'GET',
                                            headers: {
                                                'Authorization': "Bearer ".concat(process.env.TRADIER_SANDBOX_TOKEN),
                                                'Accept': 'application/json'
                                            }
                                        })];
                                case 1:
                                    response = _b.sent();
                                    return [4 /*yield*/, response.json()];
                                case 2:
                                    data = _b.sent();
                                    return [2 /*return*/, ((_a = data === null || data === void 0 ? void 0 : data.series) === null || _a === void 0 ? void 0 : _a.data) || []];
                            }
                        });
                    }); };
                    console.log("Fetching 15min indicators for ".concat(symbol, " ending on 2026-07-03..."));
                    return [4 /*yield*/, indicatorsService.getIndicators(symbol, '15min')];
                case 2:
                    indicators = _a.sent();
                    console.log("\nEvaluating tags for historical points during the drop:");
                    _loop_1 = function (N) {
                        var trim = function (arr) { return arr.slice(0, arr.length - N); };
                        var historicalIndicators = {
                            bars: trim(indicators.bars),
                            ema8: trim(indicators.ema8),
                            ema9: trim(indicators.ema9),
                            ema20: trim(indicators.ema20),
                            ema21: trim(indicators.ema21),
                            ema100: trim(indicators.ema100),
                            stoch: trim(indicators.stoch),
                            adx: trim(indicators.adx),
                            rsi: trim(indicators.rsi),
                            cci: trim(indicators.cci),
                            macd: trim(indicators.macd)
                        };
                        var tags = tagger.evaluate(historicalIndicators);
                        var latestBar = historicalIndicators.bars[historicalIndicators.bars.length - 1];
                        var dateStr = latestBar.time || latestBar.date;
                        var price = latestBar.close;
                        console.log("\nDate: ".concat(dateStr, " | Close Price: ").concat(price, " (").concat(N, " periods before end)"));
                        console.log(tags);
                    };
                    // Let's evaluate the last 5 bars of March 27, 2026
                    for (N = 1; N <= 5; N++) {
                        _loop_1(N);
                    }
                    return [3 /*break*/, 4];
                case 3:
                    e_1 = _a.sent();
                    console.error('Error during test:', e_1);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
run();
