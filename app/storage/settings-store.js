"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsStore = void 0;
const electron_1 = require("electron");
const fs = require("fs");
const path = require("path");
const DEFAULT_SETTINGS = {
    version: 1,
    autotradeRisk: {
        symbol: 'SPX',
        maxDailyLoss: 500,
        stopLossMultiplier: 2.0,
        profitTargetPct: 50,
        maxConcurrentPositions: 2,
        contractsPerTrade: 1,
        cooldownMinutes: 15,
        scanIntervalSeconds: 30,
        orderTimeoutMinutes: 15,
        autoResumeOnLaunch: true,
        maxSpreadWidth: 20
    },
    tradingHours: {
        enabled: true,
        startTime: '10:00',
        endTime: '15:00',
        allowWeekend: false,
        allowOutsideHoursPaper: false
    },
    autotradeActive: false,
    autoResumeOnLaunch: true,
    uiPreferences: {
        hideCanceledAndRejected: true,
        orderFilter: 'all'
    }
};
/**
 * SettingsStore handles persisting configuration to disk across sessions.
 * Stores settings in Electron's userData directory (e.g. ~/Library/Application Support/balaboost/settings.json)
 * with robust error handling and fallbacks.
 */
class SettingsStore {
    constructor() {
        this.filePath = this.resolveSettingsPath();
        this.settings = this.loadFromDisk();
    }
    resolveSettingsPath() {
        try {
            if (electron_1.app && typeof electron_1.app.getPath === 'function') {
                const userDataDir = electron_1.app.getPath('userData');
                if (!fs.existsSync(userDataDir)) {
                    fs.mkdirSync(userDataDir, { recursive: true });
                }
                return path.join(userDataDir, 'settings.json');
            }
        }
        catch (e) {
            console.warn('[SettingsStore] Could not access app.getPath("userData"):', e);
        }
        const fallbackDir = path.join(process.cwd(), '.storage');
        try {
            if (!fs.existsSync(fallbackDir)) {
                fs.mkdirSync(fallbackDir, { recursive: true });
            }
        }
        catch (_a) {
            // ignore
        }
        return path.join(fallbackDir, 'settings.json');
    }
    loadFromDisk() {
        var _a, _b, _c, _d;
        try {
            if (fs.existsSync(this.filePath)) {
                const raw = fs.readFileSync(this.filePath, 'utf-8');
                const parsed = JSON.parse(raw);
                console.log(`[SettingsStore] Loaded persisted settings from: ${this.filePath}`);
                return {
                    version: parsed.version || DEFAULT_SETTINGS.version,
                    autotradeRisk: Object.assign(Object.assign({}, DEFAULT_SETTINGS.autotradeRisk), (parsed.autotradeRisk || {})),
                    tradingHours: Object.assign(Object.assign({}, DEFAULT_SETTINGS.tradingHours), (parsed.tradingHours || {})),
                    autotradeActive: (_a = parsed.autotradeActive) !== null && _a !== void 0 ? _a : DEFAULT_SETTINGS.autotradeActive,
                    autoResumeOnLaunch: (_d = (_b = parsed.autoResumeOnLaunch) !== null && _b !== void 0 ? _b : (_c = parsed.autotradeRisk) === null || _c === void 0 ? void 0 : _c.autoResumeOnLaunch) !== null && _d !== void 0 ? _d : DEFAULT_SETTINGS.autoResumeOnLaunch,
                    uiPreferences: Object.assign(Object.assign({}, DEFAULT_SETTINGS.uiPreferences), (parsed.uiPreferences || {}))
                };
            }
        }
        catch (e) {
            console.warn('[SettingsStore] Failed to read settings from disk. Using defaults:', e);
        }
        return Object.assign({}, DEFAULT_SETTINGS);
    }
    writeToDisk() {
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2), 'utf-8');
            console.log(`[SettingsStore] Successfully saved settings to: ${this.filePath}`);
        }
        catch (e) {
            console.error('[SettingsStore] Failed to write settings to disk:', e);
        }
    }
    getAll() {
        return {
            version: this.settings.version,
            autotradeRisk: Object.assign({}, this.settings.autotradeRisk),
            tradingHours: Object.assign({}, this.settings.tradingHours),
            autotradeActive: this.settings.autotradeActive,
            autoResumeOnLaunch: this.settings.autoResumeOnLaunch,
            uiPreferences: Object.assign({}, this.settings.uiPreferences)
        };
    }
    saveAutotradeRunState(isActive) {
        this.settings.autotradeActive = isActive;
        this.writeToDisk();
    }
    saveAutoResumeOnLaunch(enabled) {
        this.settings.autoResumeOnLaunch = enabled;
        if (this.settings.autotradeRisk) {
            this.settings.autotradeRisk.autoResumeOnLaunch = enabled;
        }
        this.writeToDisk();
    }
    getAutotradeConfig() {
        return Object.assign({}, this.settings.autotradeRisk);
    }
    saveAutotradeConfig(update) {
        this.settings.autotradeRisk = Object.assign(Object.assign({}, this.settings.autotradeRisk), update);
        this.writeToDisk();
        return Object.assign({}, this.settings.autotradeRisk);
    }
    getTradingHoursConfig() {
        return Object.assign({}, this.settings.tradingHours);
    }
    saveTradingHoursConfig(update) {
        this.settings.tradingHours = Object.assign(Object.assign({}, this.settings.tradingHours), update);
        this.writeToDisk();
        return Object.assign({}, this.settings.tradingHours);
    }
    getUiPreferences() {
        return Object.assign({}, this.settings.uiPreferences);
    }
    saveUiPreferences(update) {
        this.settings.uiPreferences = Object.assign(Object.assign({}, this.settings.uiPreferences), update);
        this.writeToDisk();
        return Object.assign({}, this.settings.uiPreferences);
    }
    getFilePath() {
        return this.filePath;
    }
}
exports.SettingsStore = SettingsStore;
//# sourceMappingURL=settings-store.js.map