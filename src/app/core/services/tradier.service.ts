import { Injectable } from '@angular/core';
import { ElectronService } from './electron/electron.service';
import { AppEnvironment } from '../models/environment.type';

@Injectable({
  providedIn: 'root'
})
export class TradierService {
  constructor(private electronService: ElectronService) {}

  async getEnvironment(): Promise<AppEnvironment> {
    if (this.electronService.isElectron) {
      return await this.electronService.ipcRenderer.invoke('tradier:getEnvironment');
    }
    return 'sandbox';
  }

  async setEnvironment(env: AppEnvironment): Promise<AppEnvironment> {
    if (this.electronService.isElectron) {
      return await this.electronService.ipcRenderer.invoke('tradier:setEnvironment', env);
    }
    return env;
  }

  async getQuote(symbol: string): Promise<any> {
    if (this.electronService.isElectron) {
      return await this.electronService.ipcRenderer.invoke('tradier:getQuote', symbol);
    }
    throw new Error('Electron is not available.');
  }

  async getMarketTags(symbol: string): Promise<string[]> {
    if (this.electronService.isElectron) {
      return await this.electronService.ipcRenderer.invoke('tradier:getMarketTags', symbol);
    }
    return [];
  }
}
