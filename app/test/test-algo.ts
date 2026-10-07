import { MarketTagger } from '../analysis/market-tagger';
import { IndicatorsService, OHLCV, CalculatedIndicators } from '../analysis/indicators-service';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

class MockTradierService {
  getEnvironment() { return 'sandbox'; }
  async getQuote(_symbol: string) { return {}; }
  async getExpirations(_symbol: string) { return { expirations: { date: [] } }; }
  async getOptionsChain(_symbol: string, _expiration: string) { return { options: { option: [] } }; }
  async getTimesales(symbol: string, interval: string, _start: string, _end: string): Promise<OHLCV[]> {
    const baseUrl = 'https://sandbox.tradier.com/v1';
    // 10 days before Friday to ensure 100+ 15-min bars
    const start = '2026-06-23 00:00'; 
    const end = '2026-07-03 23:59'; // Last Friday
    const url = `${baseUrl}/markets/timesales?symbol=${symbol}&interval=${interval}&start=${start}&end=${end}`;
    console.log('Fetching:', url);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.TRADIER_SANDBOX_TOKEN}`,
        'Accept': 'application/json'
      }
    });
    const data = await response.json();
    return data?.series?.data || [];
  }
}

async function run() {
  console.log('Testing Market Tagger Algorithm for a significant drop...');
  const mockBroker = new MockTradierService() as any;
  const indicatorsService = new IndicatorsService(mockBroker);
  const tagger = new MarketTagger();

  try {
    const symbol = 'SPX';

    console.log(`Fetching 15min indicators for ${symbol} ending on 2026-07-03...`);
    const indicators = await indicatorsService.getIndicators(symbol, '15min');
    
    console.log(`\nEvaluating tags for historical points during the drop:`);
    
    // Let's evaluate the last 5 bars of March 27, 2026
    for (let N = 1; N <= 5; N++) {
      const trim = (arr: any[]) => arr.slice(0, arr.length - N);
      
      const historicalIndicators: CalculatedIndicators = {
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

      const tags = tagger.evaluate(historicalIndicators);
      const latestBar = historicalIndicators.bars[historicalIndicators.bars.length - 1] as any;
      const dateStr = latestBar.time || latestBar.date;
      const price = latestBar.close;
      console.log(`\nDate: ${dateStr} | Close Price: ${price} (${N} periods before end)`);
      console.log(tags);
    }

  } catch (e) {
    console.error('Error during test:', e);
  }
}

run();
