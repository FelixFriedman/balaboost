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
exports.registerIpcHandlers = registerIpcHandlers;
const electron_1 = require("electron");
const ipc_channels_1 = require("./ipc-channels");
const tradier_broker_1 = require("../brokers/tradier/tradier-broker");
const indicators_service_1 = require("../analysis/indicators-service");
const market_tagger_1 = require("../analysis/market-tagger");
const trading_1 = require("../trading");
const storage_1 = require("../storage");
/**
 * Registers all IPC handlers for the Electron main process.
 * Instantiates backend services and wires them to IPC channels.
 *
 * This function is called once from main.ts during app initialization.
 * All business logic lives in the service classes — this file is purely routing.
 */
function registerIpcHandlers() {
    const settingsStore = new storage_1.SettingsStore();
    const tradierBroker = new tradier_broker_1.TradierBroker();
    const indicatorsService = new indicators_service_1.IndicatorsService(tradierBroker);
    const marketTagger = new market_tagger_1.MarketTagger();
    const pricingEngine = new trading_1.OptionsPricingEngine(tradierBroker);
    const hoursFilter = new trading_1.TradingHoursFilter(settingsStore.getTradingHoursConfig());
    const autotradeEngine = new trading_1.AutotradeEngine(tradierBroker, indicatorsService, marketTagger, pricingEngine, hoursFilter, settingsStore.getAutotradeConfig());
    // Auto-resume engine if user previously had it running and autoResumeOnLaunch is enabled
    const storedSettings = settingsStore.getAll();
    if (storedSettings.autoResumeOnLaunch && storedSettings.autotradeActive) {
        console.log('[AutotradeEngine] Auto-resuming autotrade engine from persisted state...');
        setTimeout(() => {
            autotradeEngine.start();
        }, 1500);
    }
    // Also perform an initial order check on launch to auto-cancel any stale pending orders from previous sessions
    setTimeout(() => {
        void autotradeEngine.checkAndCleanStaleOrders().catch((err) => {
            console.error('[AutotradeEngine] Initial stale orders check error:', err);
        });
    }, 2000);
    // ----- App -----
    electron_1.ipcMain.handle(ipc_channels_1.IPC.APP_GET_VERSION, () => electron_1.app.getVersion());
    // ----- Tradier Market Data -----
    electron_1.ipcMain.handle(ipc_channels_1.IPC.TRADIER_GET_ENVIRONMENT, () => tradierBroker.getEnvironment());
    electron_1.ipcMain.handle(ipc_channels_1.IPC.TRADIER_SET_ENVIRONMENT, (_event, env) => {
        tradierBroker.setEnvironment(env);
        return tradierBroker.getEnvironment();
    });
    electron_1.ipcMain.handle(ipc_channels_1.IPC.TRADIER_GET_QUOTE, (_event, symbol) => __awaiter(this, void 0, void 0, function* () {
        return yield tradierBroker.getQuote(symbol);
    }));
    electron_1.ipcMain.handle(ipc_channels_1.IPC.TRADIER_GET_EXPIRATIONS, (_event, symbol) => __awaiter(this, void 0, void 0, function* () {
        return yield tradierBroker.getExpirations(symbol);
    }));
    electron_1.ipcMain.handle(ipc_channels_1.IPC.TRADIER_GET_OPTIONS_CHAIN, (_event, symbol, expiration) => __awaiter(this, void 0, void 0, function* () {
        return yield tradierBroker.getOptionsChain(symbol, expiration);
    }));
    electron_1.ipcMain.handle(ipc_channels_1.IPC.TRADIER_GET_MARKET_TAGS, (_event, symbol) => __awaiter(this, void 0, void 0, function* () {
        try {
            const indicators = yield indicatorsService.getIndicators(symbol);
            const tags = marketTagger.evaluate(indicators);
            return tags;
        }
        catch (e) {
            console.error('Error getting tags:', e);
            throw e;
        }
    }));
    electron_1.ipcMain.handle(ipc_channels_1.IPC.TRADIER_GET_INDICATORS, (_event, symbol) => __awaiter(this, void 0, void 0, function* () {
        return yield indicatorsService.getIndicators(symbol);
    }));
    // ----- Trading -----
    electron_1.ipcMain.handle(ipc_channels_1.IPC.TRADING_PREVIEW_ORDER, (_event, symbol) => __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const indicators = yield indicatorsService.getIndicators(symbol);
            const tags = marketTagger.evaluate(indicators);
            const riskConfig = autotradeEngine.getState().config;
            const preview = yield pricingEngine.calculateLimitPrice(symbol, tags, (_a = riskConfig === null || riskConfig === void 0 ? void 0 : riskConfig.maxSpreadWidth) !== null && _a !== void 0 ? _a : 20);
            return preview;
        }
        catch (e) {
            console.error('Error previewing trade:', e);
            throw e;
        }
    }));
    electron_1.ipcMain.handle(ipc_channels_1.IPC.TRADING_PLACE_ORDER, (_event, order) => __awaiter(this, void 0, void 0, function* () {
        try {
            return yield tradierBroker.placeSpreadOrder(order);
        }
        catch (e) {
            console.error('Error placing order:', e);
            throw e;
        }
    }));
    electron_1.ipcMain.handle(ipc_channels_1.IPC.TRADING_CLOSE_POSITION, (_event, order) => __awaiter(this, void 0, void 0, function* () {
        try {
            return yield tradierBroker.closeSpreadPosition(order);
        }
        catch (e) {
            console.error('Error closing position:', e);
            throw e;
        }
    }));
    electron_1.ipcMain.handle(ipc_channels_1.IPC.TRADING_GET_BALANCE, () => __awaiter(this, void 0, void 0, function* () {
        try {
            return yield tradierBroker.getAccountBalance();
        }
        catch (e) {
            console.error('Error fetching balance:', e);
            throw e;
        }
    }));
    electron_1.ipcMain.handle(ipc_channels_1.IPC.TRADING_GET_ORDERS, () => __awaiter(this, void 0, void 0, function* () {
        try {
            // Passively verify and auto-cancel any stale pending orders whenever orders are queried
            yield autotradeEngine.checkAndCleanStaleOrders().catch(() => { });
            return yield tradierBroker.getOrders();
        }
        catch (e) {
            console.error('Error fetching orders:', e);
            throw e;
        }
    }));
    electron_1.ipcMain.handle(ipc_channels_1.IPC.TRADING_CANCEL_ORDER, (_event, orderId) => __awaiter(this, void 0, void 0, function* () {
        try {
            return yield tradierBroker.cancelOrder(orderId);
        }
        catch (e) {
            console.error('Error canceling order:', e);
            throw e;
        }
    }));
    electron_1.ipcMain.handle(ipc_channels_1.IPC.TRADING_GET_POSITIONS, () => __awaiter(this, void 0, void 0, function* () {
        try {
            return yield tradierBroker.getPositions();
        }
        catch (e) {
            console.error('Error fetching positions:', e);
            throw e;
        }
    }));
    // ----- Trading Hours Filter -----
    electron_1.ipcMain.handle(ipc_channels_1.IPC.TRADING_GET_HOURS_STATUS, () => {
        return hoursFilter.getStatus();
    });
    electron_1.ipcMain.handle(ipc_channels_1.IPC.TRADING_SET_HOURS_CONFIG, (_event, config) => {
        hoursFilter.setConfig(config);
        settingsStore.saveTradingHoursConfig(config);
        return hoursFilter.getStatus();
    });
    // ----- Autotrade Mode (Item 3) -----
    electron_1.ipcMain.handle(ipc_channels_1.IPC.AUTOTRADE_GET_STATE, () => {
        return autotradeEngine.getState();
    });
    electron_1.ipcMain.handle(ipc_channels_1.IPC.AUTOTRADE_START, () => {
        const state = autotradeEngine.start();
        settingsStore.saveAutotradeRunState(true);
        return state;
    });
    electron_1.ipcMain.handle(ipc_channels_1.IPC.AUTOTRADE_PAUSE, () => {
        return autotradeEngine.pause();
    });
    electron_1.ipcMain.handle(ipc_channels_1.IPC.AUTOTRADE_RESUME, () => {
        const state = autotradeEngine.resume();
        settingsStore.saveAutotradeRunState(true);
        return state;
    });
    electron_1.ipcMain.handle(ipc_channels_1.IPC.AUTOTRADE_STOP, () => {
        const state = autotradeEngine.stop();
        settingsStore.saveAutotradeRunState(false);
        return state;
    });
    electron_1.ipcMain.handle(ipc_channels_1.IPC.AUTOTRADE_SET_CONFIG, (_event, configUpdate) => {
        const updated = autotradeEngine.setConfig(configUpdate);
        settingsStore.saveAutotradeConfig(configUpdate);
        if (configUpdate.autoResumeOnLaunch !== undefined) {
            settingsStore.saveAutoResumeOnLaunch(configUpdate.autoResumeOnLaunch);
        }
        return updated;
    });
    electron_1.ipcMain.handle(ipc_channels_1.IPC.AUTOTRADE_RESET_CIRCUIT_BREAKER, () => {
        return autotradeEngine.resetCircuitBreaker();
    });
    electron_1.ipcMain.handle(ipc_channels_1.IPC.AUTOTRADE_TRIGGER_SCAN, () => __awaiter(this, void 0, void 0, function* () {
        return yield autotradeEngine.triggerScan();
    }));
    // ----- Settings Persistence -----
    electron_1.ipcMain.handle(ipc_channels_1.IPC.SETTINGS_GET_ALL, () => {
        return settingsStore.getAll();
    });
    electron_1.ipcMain.handle(ipc_channels_1.IPC.SETTINGS_SAVE_UI_PREFS, (_event, prefs) => {
        return settingsStore.saveUiPreferences(prefs);
    });
}
//# sourceMappingURL=ipc-router.js.map