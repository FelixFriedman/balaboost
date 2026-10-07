import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { AutotradeRiskConfig } from '../trading/autotrade-engine';
import { TradingHoursConfig } from '../trading/trading-hours-filter';

export interface AppStoredSettings {
  version: number;
  autotradeRisk: AutotradeRiskConfig;
  tradingHours: TradingHoursConfig;
  autotradeActive?: boolean;
  autoResumeOnLaunch?: boolean;
  uiPreferences: {
    hideCanceledAndRejected: boolean;
    orderFilter: string;
  };
}

const DEFAULT_SETTINGS: AppStoredSettings = {
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
export class SettingsStore {
  private filePath: string;
  private settings: AppStoredSettings;

  constructor() {
    this.filePath = this.resolveSettingsPath();
    this.settings = this.loadFromDisk();
  }

  private resolveSettingsPath(): string {
    try {
      if (app && typeof app.getPath === 'function') {
        const userDataDir = app.getPath('userData');
        if (!fs.existsSync(userDataDir)) {
          fs.mkdirSync(userDataDir, { recursive: true });
        }
        return path.join(userDataDir, 'settings.json');
      }
    } catch (e) {
      console.warn('[SettingsStore] Could not access app.getPath("userData"):', e);
    }

    const fallbackDir = path.join(process.cwd(), '.storage');
    try {
      if (!fs.existsSync(fallbackDir)) {
        fs.mkdirSync(fallbackDir, { recursive: true });
      }
    } catch {
      // ignore
    }
    return path.join(fallbackDir, 'settings.json');
  }

  private loadFromDisk(): AppStoredSettings {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        console.log(`[SettingsStore] Loaded persisted settings from: ${this.filePath}`);
        return {
          version: parsed.version || DEFAULT_SETTINGS.version,
          autotradeRisk: { ...DEFAULT_SETTINGS.autotradeRisk, ...(parsed.autotradeRisk || {}) },
          tradingHours: { ...DEFAULT_SETTINGS.tradingHours, ...(parsed.tradingHours || {}) },
          autotradeActive: parsed.autotradeActive ?? DEFAULT_SETTINGS.autotradeActive,
          autoResumeOnLaunch: parsed.autoResumeOnLaunch ?? parsed.autotradeRisk?.autoResumeOnLaunch ?? DEFAULT_SETTINGS.autoResumeOnLaunch,
          uiPreferences: { ...DEFAULT_SETTINGS.uiPreferences, ...(parsed.uiPreferences || {}) }
        };
      }
    } catch (e) {
      console.warn('[SettingsStore] Failed to read settings from disk. Using defaults:', e);
    }
    return { ...DEFAULT_SETTINGS };
  }

  private writeToDisk(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2), 'utf-8');
      console.log(`[SettingsStore] Successfully saved settings to: ${this.filePath}`);
    } catch (e) {
      console.error('[SettingsStore] Failed to write settings to disk:', e);
    }
  }

  public getAll(): AppStoredSettings {
    return {
      version: this.settings.version,
      autotradeRisk: { ...this.settings.autotradeRisk },
      tradingHours: { ...this.settings.tradingHours },
      autotradeActive: this.settings.autotradeActive,
      autoResumeOnLaunch: this.settings.autoResumeOnLaunch,
      uiPreferences: { ...this.settings.uiPreferences }
    };
  }

  public saveAutotradeRunState(isActive: boolean): void {
    this.settings.autotradeActive = isActive;
    this.writeToDisk();
  }

  public saveAutoResumeOnLaunch(enabled: boolean): void {
    this.settings.autoResumeOnLaunch = enabled;
    if (this.settings.autotradeRisk) {
      this.settings.autotradeRisk.autoResumeOnLaunch = enabled;
    }
    this.writeToDisk();
  }

  public getAutotradeConfig(): AutotradeRiskConfig {
    return { ...this.settings.autotradeRisk };
  }

  public saveAutotradeConfig(update: Partial<AutotradeRiskConfig>): AutotradeRiskConfig {
    this.settings.autotradeRisk = { ...this.settings.autotradeRisk, ...update };
    this.writeToDisk();
    return { ...this.settings.autotradeRisk };
  }

  public getTradingHoursConfig(): TradingHoursConfig {
    return { ...this.settings.tradingHours };
  }

  public saveTradingHoursConfig(update: Partial<TradingHoursConfig>): TradingHoursConfig {
    this.settings.tradingHours = { ...this.settings.tradingHours, ...update };
    this.writeToDisk();
    return { ...this.settings.tradingHours };
  }

  public getUiPreferences(): AppStoredSettings['uiPreferences'] {
    return { ...this.settings.uiPreferences };
  }

  public saveUiPreferences(update: Partial<AppStoredSettings['uiPreferences']>): AppStoredSettings['uiPreferences'] {
    this.settings.uiPreferences = { ...this.settings.uiPreferences, ...update };
    this.writeToDisk();
    return { ...this.settings.uiPreferences };
  }

  public getFilePath(): string {
    return this.filePath;
  }
}
