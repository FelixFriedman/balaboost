import { MarketTagger } from './market-tagger';
import { IndicatorsService, OHLCV, CalculatedIndicators } from './indicators-service';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

class MockTradierService {
  getEnvironment() { return 'sandbox'; }
}

async function run() {
  console.log('Testing Market Tagger Algorithm for a significant drop...');
  const tradier = new MockTradierService() as any;
  const indicatorsService = new IndicatorsService(tradier);
  const tagger = new MarketTagger();

  try {
    const symbol = 'SPX';
    
    const originalFetchBars = (indicatorsService as any).fetchBars.bind(indicatorsService);
    (indicatorsService as any).fetchBars = async (sym: string, interval: string) => {
      const baseUrl = 'https://sandbox.tradier.com/v1';
      // 10 days before Friday to ensure 100+ 15-min bars
      const start = '2026-06-23 00:00'; 
      const end = '2026-07-03 23:59'; // Last Friday
      const url = `${baseUrl}/markets/timesales?symbol=${sym}&interval=${interval}&start=${start}&end=${end}`;
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
    };

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
