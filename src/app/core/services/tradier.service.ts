import { Injectable, inject } from '@angular/core';
import { ElectronService } from './electron/electron.service';
import { AppEnvironment } from '../models/environment.type';
import { AutotradeState, AutotradeRiskConfig } from '../models/autotrade.model';

@Injectable({
  providedIn: 'root'
})
export class TradierService {
  private electronService = inject(ElectronService);


  async getEnvironment(): Promise<AppEnvironment> {
    if (this.electronService.isElectron) {
      return (await this.electronService.ipcRenderer.invoke('tradier:getEnvironment')) as AppEnvironment;
    }
    return 'sandbox';
  }

  async setEnvironment(env: AppEnvironment): Promise<AppEnvironment> {
    if (this.electronService.isElectron) {
      return (await this.electronService.ipcRenderer.invoke('tradier:setEnvironment', env)) as AppEnvironment;
    }
    return env;
  }

  async getQuote(symbol: string): Promise<unknown> {
    if (this.electronService.isElectron) {
      return (await this.electronService.ipcRenderer.invoke('tradier:getQuote', symbol)) as unknown;
    }
    return {
      quotes: {
        quote: {
          symbol: symbol || 'SPX',
          last: 7770.03,
          bid: 7768.54,
          ask: 7771.70,
          change: 47.31,
          change_percentage: 0.62
        }
      }
    };
  }

  async getExpirations(symbol: string): Promise<any> {
    if (this.electronService.isElectron) {
      return (await this.electronService.ipcRenderer.invoke('tradier:getExpirations', symbol)) as any;
    }
    throw new Error('Electron is not available.');
  }

  async getOptionsChain(symbol: string, expiration: string): Promise<any> {
    if (this.electronService.isElectron) {
      return (await this.electronService.ipcRenderer.invoke('tradier:getOptionsChain', symbol, expiration)) as any;
    }
    throw new Error('Electron is not available.');
  }

  async getMarketTags(symbol: string): Promise<string[]> {
    if (this.electronService.isElectron) {
      return (await this.electronService.ipcRenderer.invoke('tradier:getMarketTags', symbol)) as string[];
    }
    return ['bull market', 'healthy momentum'];
  }

  async getIndicators(symbol: string): Promise<any> {
    if (this.electronService.isElectron) {
      return (await this.electronService.ipcRenderer.invoke('tradier:getIndicators', symbol)) as any;
    }
    return this.generateBrowserFallbackIndicators(symbol);
  }

  private generateBrowserFallbackIndicators(symbol: string): any {
    const bars: any[] = [];
    let currentPrice = 7650;
    const now = Math.floor(Date.now() / 1000);
    const intervalSec = 3600 * 24; // Daily
    const numBars = 40;

    for (let i = numBars; i >= 0; i--) {
      const time = new Date((now - i * intervalSec) * 1000).toISOString();
      const delta = (Math.random() - 0.46) * 35; // slight upward drift
      const open = Math.round(currentPrice * 100) / 100;
      const close = Math.round((currentPrice + delta) * 100) / 100;
      const high = Math.round((Math.max(open, close) + Math.random() * 18) * 100) / 100;
      const low = Math.round((Math.min(open, close) - Math.random() * 18) * 100) / 100;
      bars.push({
        time,
        open,
        high,
        low,
        close,
        volume: Math.floor(100000 + Math.random() * 50000)
      });
      currentPrice = close;
    }

    const ema = (period: number) => {
      const k = 2 / (period + 1);
      const res: number[] = [];
      let prev = bars[0].close;
      for (let i = 0; i < bars.length; i++) {
        const val = bars[i].close * k + prev * (1 - k);
        res.push(Number(val.toFixed(2)));
        prev = val;
      }
      return res;
    };

    return {
      bars,
      ema8: ema(8),
      ema21: ema(21)
    };
  }

  async previewTrade(symbol: string): Promise<any> {
    if (this.electronService.isElectron) {
      return (await this.electronService.ipcRenderer.invoke('trading:previewOrder', symbol)) as any;
    }
    return {
      action: 'Trade',
      strategy: 'Bull Put Spread',
      symbol: symbol || 'SPX',
      underlyingPrice: 7654.59,
      expiration: '2026-11-02',
      shortLeg: {
        symbol: 'SPXW261102P07400000',
        strike: 7400,
        delta: -0.15
      },
      longLeg: {
        symbol: 'SPXW261102P07225000',
        strike: 7225,
        delta: -0.06
      },
      netCreditMid: 11.50,
      recommendedLimitPrice: 11.50,
      spreadWidth: 175,
      capApplied: true,
      aggressiveness: 'Balanced Mid-Price',
      tagsUsed: ['BULL MARKET', 'HEALTHY MOMENTUM']
    };
  }

  async placeSpreadOrder(order: any): Promise<any> {
    if (this.electronService.isElectron) {
      return (await this.electronService.ipcRenderer.invoke('trading:placeOrder', order)) as any;
    }
    return {
      order: {
        id: Math.floor(2600000 + Math.random() * 90000),
        status: 'ok'
      }
    };
  }

  async closeSpreadPosition(order: any): Promise<any> {
    if (this.electronService.isElectron) {
      return (await this.electronService.ipcRenderer.invoke('trading:closePosition', order)) as any;
    }
    return {
      success: true,
      confirmationNumber: 'SIM-CLOSE-2637138',
      message: 'Simulated closing order submitted successfully (Web Browser Mode)',
      previewData: order
    };
  }

  async getAccountBalance(): Promise<any> {
    if (this.electronService.isElectron) {
      return (await this.electronService.ipcRenderer.invoke('trading:getBalance')) as any;
    }
    return {
      totalValue: 100488.14,
      cashAvailable: 101148.14,
      buyingPower: 167296.28,
      optionBuyingPower: 83648.14,
      closePnL: 0,
      openPnL: 490
    };
  }

  async getOrders(): Promise<any[]> {
    if (this.electronService.isElectron) {
      return (await this.electronService.ipcRenderer.invoke('trading:getOrders')) as any[];
    }
    return [
      {
        id: 2637138,
        type: 'credit',
        symbol: 'SPX',
        class: 'multileg',
        num_legs: 2,
        strategy: 'Bull Put Spread',
        status: 'filled',
        duration: 'gtc',
        create_date: '2026-10-05T14:01:17.517Z',
        transaction_date: '2026-10-05T14:01:17.517Z',
        price: 11.50,
        quantity: 2,
        leg: [
          {
            id: 2637138,
            symbol: 'SPX',
            option_symbol: 'SPXW261102P07400000',
            side: 'sell_to_open',
            quantity: 1
          },
          {
            id: 2637139,
            symbol: 'SPX',
            option_symbol: 'SPXW261102P07225000',
            side: 'buy_to_open',
            quantity: 1
          }
        ]
      }
    ];
  }

  async cancelOrder(orderId: string | number): Promise<any> {
    if (this.electronService.isElectron) {
      return (await this.electronService.ipcRenderer.invoke('trading:cancelOrder', orderId)) as any;
    }
    return { order: { id: orderId, status: 'ok' } };
  }

  async getPositions(): Promise<any[]> {
    if (this.electronService.isElectron) {
      return (await this.electronService.ipcRenderer.invoke('trading:getPositions')) as any[];
    }
    return [
      {
        id: 2637138,
        symbol: 'SPXW261102P07400000',
        quantity: -1,
        cost_basis: -2760,
        date_acquired: '2026-10-05T14:01:17.517Z'
      },
      {
        id: 2637139,
        symbol: 'SPXW261102P07225000',
        quantity: 1,
        cost_basis: 1610,
        date_acquired: '2026-10-05T14:01:17.517Z'
      }
    ];
  }

  async getTradingHoursStatus(): Promise<any> {
    if (this.electronService.isElectron) {
      return (await this.electronService.ipcRenderer.invoke('trading:getHoursStatus')) as any;
    }
    return {
      isWithinWindow: true,
      canExecuteTrade: true,
      marketStatus: 'open',
      windowStatus: 'active',
      currentEasternTime: '10:30 ET',
      currentEasternDate: '2026-10-06',
      formattedClock: '10:30:00 AM',
      reason: 'Active Trading Window (Web Preview)',
      config: {
        enabled: true,
        startTime: '10:00',
        endTime: '15:00',
        allowWeekend: false,
        allowOutsideHoursPaper: true
      }
    };
  }

  async setTradingHoursConfig(config: any): Promise<any> {
    if (this.electronService.isElectron) {
      return (await this.electronService.ipcRenderer.invoke('trading:setHoursConfig', config)) as any;
    }
    return config;
  }

  // ----- Autotrade Engine (Item 3) -----

  async getAutotradeState(): Promise<AutotradeState | null> {
    if (this.electronService.isElectron) {
      return (await this.electronService.ipcRenderer.invoke('autotrade:getState')) as AutotradeState;
    }
    return null;
  }

  async startAutotrade(): Promise<AutotradeState | null> {
    if (this.electronService.isElectron) {
      return (await this.electronService.ipcRenderer.invoke('autotrade:start')) as AutotradeState;
    }
    return null;
  }

  async pauseAutotrade(): Promise<AutotradeState | null> {
    if (this.electronService.isElectron) {
      return (await this.electronService.ipcRenderer.invoke('autotrade:pause')) as AutotradeState;
    }
    return null;
  }

  async resumeAutotrade(): Promise<AutotradeState | null> {
    if (this.electronService.isElectron) {
      return (await this.electronService.ipcRenderer.invoke('autotrade:resume')) as AutotradeState;
    }
    return null;
  }

  async stopAutotrade(): Promise<AutotradeState | null> {
    if (this.electronService.isElectron) {
      return (await this.electronService.ipcRenderer.invoke('autotrade:stop')) as AutotradeState;
    }
    return null;
  }

  async setAutotradeConfig(config: Partial<AutotradeRiskConfig>): Promise<AutotradeRiskConfig | null> {
    if (this.electronService.isElectron) {
      return (await this.electronService.ipcRenderer.invoke('autotrade:setConfig', config)) as AutotradeRiskConfig;
    }
    return null;
  }

  async resetCircuitBreaker(): Promise<AutotradeState | null> {
    if (this.electronService.isElectron) {
      return (await this.electronService.ipcRenderer.invoke('autotrade:resetCircuitBreaker')) as AutotradeState;
    }
    return null;
  }

  async triggerAutotradeScan(): Promise<AutotradeState | null> {
    if (this.electronService.isElectron) {
      return (await this.electronService.ipcRenderer.invoke('autotrade:triggerScan')) as AutotradeState;
    }
    return null;
  }

  // ----- Settings Persistence -----

  async getAllSettings(): Promise<any> {
    if (this.electronService.isElectron) {
      return await this.electronService.ipcRenderer.invoke('settings:getAll');
    }
    return null;
  }

  async saveUiPreferences(prefs: any): Promise<any> {
    if (this.electronService.isElectron) {
      return await this.electronService.ipcRenderer.invoke('settings:saveUiPrefs', prefs);
    }
    return null;
  }
}



