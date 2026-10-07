import { TradierBroker } from '../brokers/tradier/tradier-broker';
import { OptionsPricingEngine } from '../trading/options-pricing-engine';
import { MarketTag } from '../analysis/market-tagger';

async function run() {
  const broker = new TradierBroker();
  const pricer = new OptionsPricingEngine(broker);

  const symbol = 'SPX';
  const mockTags: MarketTag[] = ['bull market'];

  console.log(`Testing OptionsPricingEngine for ${symbol} with tags:`, mockTags);

  try {
    const result = await pricer.calculateLimitPrice(symbol, mockTags);
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('Error during test:', e);
  }
}

run();
