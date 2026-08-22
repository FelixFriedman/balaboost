import * as dotenv from 'dotenv';
import * as path from 'path';
import { AppEnvironment } from './environment';

// Load .env from the project root
dotenv.config({ path: path.join(__dirname, '../.env') });

export class TradierService {
  private currentEnvironment: AppEnvironment = 'sandbox';

  private getBaseUrl(): string {
    return this.currentEnvironment === 'sandbox' 
      ? 'https://sandbox.tradier.com/v1' 
      : 'https://api.tradier.com/v1';
  }

  private getToken(): string {
    const token = this.currentEnvironment === 'sandbox'
      ? process.env.TRADIER_SANDBOX_TOKEN
      : process.env.TRADIER_PROD_TOKEN;
      
    if (!token) {
      throw new Error(`Tradier API token for ${this.currentEnvironment} is missing in .env`);
    }
    return token;
  }

  public setEnvironment(env: AppEnvironment) {
    this.currentEnvironment = env;
  }

  public getEnvironment(): AppEnvironment {
    return this.currentEnvironment;
  }

  public async getQuote(symbol: string): Promise<any> {
    const url = `${this.getBaseUrl()}/markets/quotes?symbols=${symbol}`;
    const token = this.getToken();

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Tradier API Error (${response.status}): ${errorBody}`);
    }

    return response.json();
  }
}
