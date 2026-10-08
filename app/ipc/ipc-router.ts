import { app, ipcMain, shell } from 'electron';
import * as fs from 'fs';
import { IPC } from './ipc-channels';
import { TradierBroker } from '../brokers/tradier/tradier-broker';
import { IndicatorsService } from '../analysis/indicators-service';
import { MarketTagger } from '../analysis/market-tagger';
import { OptionsPricingEngine, TradingHoursFilter, AutotradeEngine } from '../trading';
import { SettingsStore, EngineLogger } from '../storage';
import { AppEnvironment } from '../environment';

/**
 * Registers all IPC handlers for the Electron main process.
 * Instantiates backend services and wires them to IPC channels.
 *
 * This function is called once from main.ts during app initialization.
 * All business logic lives in the service classes — this file is purely routing.
 */
export function registerIpcHandlers(): void {
  const settingsStore = new SettingsStore();
  const engineLogger = new EngineLogger();
  const tradierBroker = new TradierBroker();
  const indicatorsService = new IndicatorsService(tradierBroker);
  const marketTagger = new MarketTagger();
  const pricingEngine = new OptionsPricingEngine(tradierBroker);
  const hoursFilter = new TradingHoursFilter(settingsStore.getTradingHoursConfig());
  const autotradeEngine = new AutotradeEngine(
    tradierBroker,
    indicatorsService,
    marketTagger,
    pricingEngine,
    hoursFilter,
    settingsStore.getAutotradeConfig(),
    engineLogger
  );

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
  ipcMain.handle(IPC.APP_GET_VERSION, () => app.getVersion());

  // ----- Tradier Market Data -----
  ipcMain.handle(IPC.TRADIER_GET_ENVIRONMENT, () => tradierBroker.getEnvironment());

  ipcMain.handle(IPC.TRADIER_SET_ENVIRONMENT, (_event, env: AppEnvironment) => {
    tradierBroker.setEnvironment(env);
    return tradierBroker.getEnvironment();
  });

  ipcMain.handle(IPC.TRADIER_GET_QUOTE, async (_event, symbol: string) => {
    return await tradierBroker.getQuote(symbol);
  });

  ipcMain.handle(IPC.TRADIER_GET_EXPIRATIONS, async (_event, symbol: string) => {
    return await tradierBroker.getExpirations(symbol);
  });

  ipcMain.handle(IPC.TRADIER_GET_OPTIONS_CHAIN, async (_event, symbol: string, expiration: string) => {
    return await tradierBroker.getOptionsChain(symbol, expiration);
  });

  ipcMain.handle(IPC.TRADIER_GET_MARKET_TAGS, async (_event, symbol: string) => {
    try {
      const indicators = await indicatorsService.getIndicators(symbol);
      const tags = marketTagger.evaluate(indicators);
      return tags;
    } catch (e: any) {
      console.error('Error getting tags:', e);
      throw e;
    }
  });

  ipcMain.handle(IPC.TRADIER_GET_INDICATORS, async (_event, symbol: string) => {
    return await indicatorsService.getIndicators(symbol);
  });

  // ----- Trading -----
  ipcMain.handle(IPC.TRADING_PREVIEW_ORDER, async (_event, symbol: string) => {
    try {
      const indicators = await indicatorsService.getIndicators(symbol);
      const tags = marketTagger.evaluate(indicators);
      const riskConfig = autotradeEngine.getState().config;
      const preview = await pricingEngine.calculateLimitPrice(
        symbol, 
        tags, 
        riskConfig?.maxSpreadWidth ?? 20
      );
      return preview;
    } catch (e: any) {
      console.error('Error previewing trade:', e);
      throw e;
    }
  });

  ipcMain.handle(IPC.TRADING_PLACE_ORDER, async (_event, order: any) => {
    try {
      return await tradierBroker.placeSpreadOrder(order);
    } catch (e: any) {
      console.error('Error placing order:', e);
      throw e;
    }
  });

  ipcMain.handle(IPC.TRADING_CLOSE_POSITION, async (_event, order: any) => {
    try {
      return await tradierBroker.closeSpreadPosition(order);
    } catch (e: any) {
      console.error('Error closing position:', e);
      throw e;
    }
  });

  ipcMain.handle(IPC.TRADING_GET_BALANCE, async () => {
    try {
      return await tradierBroker.getAccountBalance();
    } catch (e: any) {
      console.error('Error fetching balance:', e);
      throw e;
    }
  });

  ipcMain.handle(IPC.TRADING_GET_ORDERS, async () => {
    try {
      // Passively verify and auto-cancel any stale pending orders whenever orders are queried
      await autotradeEngine.checkAndCleanStaleOrders().catch(() => {});
      return await tradierBroker.getOrders();
    } catch (e: any) {
      console.error('Error fetching orders:', e);
      throw e;
    }
  });

  ipcMain.handle(IPC.TRADING_CANCEL_ORDER, async (_event, orderId: string | number) => {
    try {
      return await tradierBroker.cancelOrder(orderId);
    } catch (e: any) {
      console.error('Error canceling order:', e);
      throw e;
    }
  });

  ipcMain.handle(IPC.TRADING_GET_POSITIONS, async () => {
    try {
      return await tradierBroker.getPositions();
    } catch (e: any) {
      console.error('Error fetching positions:', e);
      throw e;
    }
  });

  // ----- Trading Hours Filter -----
  ipcMain.handle(IPC.TRADING_GET_HOURS_STATUS, () => {
    return hoursFilter.getStatus();
  });

  ipcMain.handle(IPC.TRADING_SET_HOURS_CONFIG, (_event, config: any) => {
    hoursFilter.setConfig(config);
    settingsStore.saveTradingHoursConfig(config);
    return hoursFilter.getStatus();
  });

  // ----- Autotrade Mode (Item 3) -----
  ipcMain.handle(IPC.AUTOTRADE_GET_STATE, () => {
    return autotradeEngine.getState();
  });

  ipcMain.handle(IPC.AUTOTRADE_START, () => {
    const state = autotradeEngine.start();
    settingsStore.saveAutotradeRunState(true);
    return state;
  });

  ipcMain.handle(IPC.AUTOTRADE_PAUSE, () => {
    return autotradeEngine.pause();
  });

  ipcMain.handle(IPC.AUTOTRADE_RESUME, () => {
    const state = autotradeEngine.resume();
    settingsStore.saveAutotradeRunState(true);
    return state;
  });

  ipcMain.handle(IPC.AUTOTRADE_STOP, () => {
    const state = autotradeEngine.stop();
    settingsStore.saveAutotradeRunState(false);
    return state;
  });

  ipcMain.handle(IPC.AUTOTRADE_SET_CONFIG, (_event, configUpdate: any) => {
    const updated = autotradeEngine.setConfig(configUpdate);
    settingsStore.saveAutotradeConfig(configUpdate);
    if (configUpdate.autoResumeOnLaunch !== undefined) {
      settingsStore.saveAutoResumeOnLaunch(configUpdate.autoResumeOnLaunch);
    }
    return updated;
  });

  ipcMain.handle(IPC.AUTOTRADE_RESET_CIRCUIT_BREAKER, () => {
    return autotradeEngine.resetCircuitBreaker();
  });

  ipcMain.handle(IPC.AUTOTRADE_TRIGGER_SCAN, async () => {
    return await autotradeEngine.triggerScan();
  });

  ipcMain.handle(IPC.AUTOTRADE_OPEN_LOG_FILE, async () => {
    const logPath = autotradeEngine.getLogFilePath();
    if (logPath && fs.existsSync(logPath)) {
      shell.showItemInFolder(logPath);
      return { success: true, path: logPath };
    }
    return { success: false, error: 'Log file not found or empty yet' };
  });

  ipcMain.handle(IPC.AUTOTRADE_GET_LOG_PATH, () => {
    return autotradeEngine.getLogFilePath();
  });

  // ----- Settings Persistence -----
  ipcMain.handle(IPC.SETTINGS_GET_ALL, () => {
    return settingsStore.getAll();
  });

  ipcMain.handle(IPC.SETTINGS_SAVE_UI_PREFS, (_event, prefs: any) => {
    return settingsStore.saveUiPreferences(prefs);
  });
}


