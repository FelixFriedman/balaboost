"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IPC = void 0;
/**
 * Typed IPC channel name constants.
 * Eliminates magic strings across main.ts and Angular services.
 */
exports.IPC = {
    // App
    APP_GET_VERSION: 'app:get-version',
    // Tradier Market Data
    TRADIER_GET_ENVIRONMENT: 'tradier:getEnvironment',
    TRADIER_SET_ENVIRONMENT: 'tradier:setEnvironment',
    TRADIER_GET_QUOTE: 'tradier:getQuote',
    TRADIER_GET_EXPIRATIONS: 'tradier:getExpirations',
    TRADIER_GET_OPTIONS_CHAIN: 'tradier:getOptionsChain',
    TRADIER_GET_MARKET_TAGS: 'tradier:getMarketTags',
    TRADIER_GET_INDICATORS: 'tradier:getIndicators',
    // Trading (Phase 2)
    TRADING_PREVIEW_ORDER: 'trading:previewOrder',
    TRADING_PLACE_ORDER: 'trading:placeOrder',
    TRADING_CLOSE_POSITION: 'trading:closePosition',
    TRADING_CANCEL_ORDER: 'trading:cancelOrder',
    TRADING_GET_ORDERS: 'trading:getOrders',
    TRADING_GET_POSITIONS: 'trading:getPositions',
    TRADING_GET_BALANCE: 'trading:getBalance',
    TRADING_GET_HOURS_STATUS: 'trading:getHoursStatus',
    TRADING_SET_HOURS_CONFIG: 'trading:setHoursConfig',
    // Autotrade Mode (Item 3)
    AUTOTRADE_GET_STATE: 'autotrade:getState',
    AUTOTRADE_START: 'autotrade:start',
    AUTOTRADE_PAUSE: 'autotrade:pause',
    AUTOTRADE_RESUME: 'autotrade:resume',
    AUTOTRADE_STOP: 'autotrade:stop',
    AUTOTRADE_SET_CONFIG: 'autotrade:setConfig',
    AUTOTRADE_RESET_CIRCUIT_BREAKER: 'autotrade:resetCircuitBreaker',
    AUTOTRADE_TRIGGER_SCAN: 'autotrade:triggerScan',
    // Settings Persistence
    SETTINGS_GET_ALL: 'settings:getAll',
    SETTINGS_SAVE_UI_PREFS: 'settings:saveUiPrefs',
    // Vanguard (Phase 2)
    VANGUARD_LOGIN: 'vanguard:login',
    VANGUARD_SUBMIT_2FA: 'vanguard:submit2fa',
    VANGUARD_STATUS: 'vanguard:status',
};
//# sourceMappingURL=ipc-channels.js.map