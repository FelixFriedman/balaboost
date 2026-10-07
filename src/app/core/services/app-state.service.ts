import { Injectable, signal, inject } from '@angular/core';
import { TradierService } from './tradier.service';
import { AppEnvironment } from '../models/environment.type';

@Injectable({
  providedIn: 'root'
})
export class AppStateService {
  private tradierService = inject(TradierService);
  
  public environment = signal<AppEnvironment>('sandbox');

  constructor() {
    this.init();
  }

  private async init() {
    const env = await this.tradierService.getEnvironment();
    this.environment.set(env);
  }

  public async toggleEnvironment() {
    const current = this.environment();
    const next: AppEnvironment = current === 'sandbox' ? 'prod' : 'sandbox';
    await this.tradierService.setEnvironment(next);
    this.environment.set(next);
  }
}
