/**
 * @file options-math.util.ts
 * @description Pure, thoroughly documented utility functions for Options Clearing Corporation (OCC)
 * symbology parsing, multileg spread counting, margin collateral estimation, and target profit math.
 */

import { ParsedOccOption, TradierOrder } from '../models/options-trading.model';

/**
 * Standard OCC month names for date formatting.
 */
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Standard OCC (Options Clearing Corporation) Option Symbol Parser.
 *
 * An OCC option symbol is a 21-character alphanumeric identifier with 4 distinct components:
 * 1. Root Symbol: Up to 6 letters representing the underlying (e.g. 'SPX', 'SPXW', 'AAPL').
 * 2. Expiration Date: 6 digits in YYMMDD format (e.g. '261102' = November 2, 2026).
 * 3. Contract Type: 1 character: 'C' for Call, 'P' for Put.
 * 4. Strike Price: 8 digits formatted with 3 implied decimal places (divided by 1000).
 *    Example: '07425000' / 1000 = $7,425.00 strike price.
 *
 * @param occSymbol The raw OCC option symbol string (e.g. 'SPXW261102P07425000').
 * @returns A structured ParsedOccOption object, or null if the symbol is invalid.
 */
export function parseOccOptionSymbol(occSymbol: string): ParsedOccOption | null {
  if (!occSymbol || typeof occSymbol !== 'string') {
    return null;
  }

  const match = occSymbol.trim().match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (!match) {
    return null;
  }

  const [, rootSymbol, yearStr, monthStr, dayStr, typeChar, strikeStr] = match;

  const expirationYear = parseInt('20' + yearStr, 10);
  const expirationMonth = parseInt(monthStr, 10);
  const expirationDay = parseInt(dayStr, 10);
  const optionType: 'Call' | 'Put' = typeChar === 'P' ? 'Put' : 'Call';

  // OCC encodes strikes with 3 implied decimals (e.g. '07425000' -> 7425.00)
  const strikePrice = parseInt(strikeStr, 10) / 1000;

  const formattedMonth = MONTH_NAMES[expirationMonth - 1] || monthStr;
  const formattedStrike = strikePrice.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

  const formattedDescription = `${rootSymbol} $${formattedStrike} ${optionType} · Exp: ${formattedMonth} ${expirationDay}, ${expirationYear}`;

  return {
    rootSymbol,
    expirationYear,
    expirationMonth,
    expirationDay,
    optionType,
    strikePrice,
    formattedDescription
  };
}

/**
 * Formats an OCC symbol into a friendly user-facing string.
 *
 * @param occSymbol OCC symbol (e.g. 'SPXW261102P07425000')
 * @returns Human-readable label (e.g. 'SPXW $7,425 Put · Exp: Nov 2, 2026') or the raw symbol if unparseable.
 */
export function formatOccOptionSymbol(occSymbol: string): string {
  const parsed = parseOccOptionSymbol(occSymbol);
  return parsed ? parsed.formattedDescription : occSymbol;
}

/**
 * Extracts the numerical strike price from an OCC option symbol.
 *
 * @param occSymbol The raw OCC symbol (e.g. 'SPXW261102P07425000')
 * @returns The strike price in USD points (e.g. 7425.00), or null if invalid.
 */
export function extractStrikeFromOcc(occSymbol: string): number | null {
  const parsed = parseOccOptionSymbol(occSymbol);
  return parsed ? parsed.strikePrice : null;
}

/**
 * Resolves the true number of credit/debit spread units from a Tradier order.
 *
 * ### Tradier Multileg Quantity Semantics (Broker Quirk):
 * In Tradier's API response, a 2-leg spread order containing 1 short contract and 1 long contract
 * frequently reports `quantity = 2` at the top level (sum of both contract legs).
 * If individual legs exist, `order.leg[0].quantity` represents the true spread count (e.g., 1 spread).
 *
 * @param order The Tradier order to inspect.
 * @returns The true number of spread units (defaulting to 1).
 */
export function getSpreadCountFromOrder(order: Partial<TradierOrder> | null | undefined): number {
  if (!order) {
    return 1;
  }

  // 1. If legs array is present and has leg-specific quantity, use leg quantity
  if (order.leg && Array.isArray(order.leg) && order.leg.length > 0 && order.leg[0]?.quantity) {
    return order.leg[0].quantity;
  }

  // 2. Tradier quirk: for 2-leg multilegs where top-level quantity is the leg sum
  if (order.class === 'multileg' && order.num_legs === 2 && order.quantity) {
    return Math.max(1, Math.floor(order.quantity / 2));
  }

  return order.quantity || 1;
}

/**
 * Calculates the strike width (in points) between the two legs of a vertical spread order.
 *
 * @param order Multileg vertical spread order.
 * @returns Strike distance in points (e.g. 10.0), or 0 if order does not contain 2 valid legs.
 */
export function calculateOrderSpreadWidth(order: Partial<TradierOrder> | null | undefined): number {
  if (!order?.leg || order.leg.length < 2) {
    return 0;
  }

  const shortStrike = extractStrikeFromOcc(order.leg[0].option_symbol);
  const longStrike = extractStrikeFromOcc(order.leg[1].option_symbol);

  if (shortStrike === null || longStrike === null) {
    return 0;
  }

  return Math.abs(shortStrike - longStrike);
}

/**
 * Calculates the maximum collateral held (maximum cash at risk) for a vertical credit spread.
 *
 * Standard Credit Spread Margin Requirement:
 * $$\text{Collateral} = (\text{Spread Width} - \text{Net Credit per Share}) \times \text{Spreads} \times 100$$
 *
 * @param spreadWidthPoints Distance in strike points between short and long legs (e.g. 10).
 * @param netCreditPrice Net credit collected per share (e.g. $1.50).
 * @param spreadCount Number of spreads (e.g. 1).
 * @returns Maximum collateral requirement in dollars (e.g. $850.00).
 */
export function calculateMaxCollateralHeld(
  spreadWidthPoints: number,
  netCreditPrice: number,
  spreadCount: number
): number {
  if (spreadWidthPoints <= 0) {
    return 0;
  }

  const maxRiskPerSpread = Math.max(0, spreadWidthPoints - netCreditPrice);
  return maxRiskPerSpread * Math.max(1, spreadCount) * 100;
}

/**
 * Calculates the expected dollar profit based on total credit collected and target profit percentage.
 *
 * @param totalCreditDollars Total credit collected in dollars (e.g. $150.00).
 * @param profitTargetPercentage Profit target percentage (e.g. 50 for 50%).
 * @returns Target profit in dollars (e.g. $75.00).
 */
export function calculateExpectedProfit(
  totalCreditDollars: number,
  profitTargetPercentage: number
): number {
  const targetFraction = Math.max(0, profitTargetPercentage) / 100;
  return totalCreditDollars * targetFraction;
}

/**
 * Calculates the Buy-to-Close debit limit price to realize a target profit percentage.
 *
 * ### Credit Spread Profit Realization Math:
 * A credit spread is opened by receiving an initial credit (e.g. $2.00).
 * To close the trade at a **50% profit**, you must buy it back when the spread's value has shrunk by 50%.
 * Thus, the required **Buy-to-Close Debit Limit** is:
 * $$\text{Close Debit Limit} = \text{Entry Credit} \times \frac{100 - \text{Target \%}}{100}$$
 *
 * Example:
 * Entry Credit = $2.00.
 * At 50% target: Buy to close at $1.00 debit ($2.00 - $1.00 = $1.00 profit retained).
 * At 75% target: Buy to close at $0.50 debit ($2.00 - $0.50 = $1.50 profit retained).
 *
 * @param entryCreditPrice Original net credit received upon opening the spread (e.g. 1.80).
 * @param profitTargetPercentage Target profit percentage (e.g. 50 or 75).
 * @returns Limit debit price to submit for the closing order (rounded to 2 decimal places, min $0.01).
 */
export function calculateBuyToCloseDebit(
  entryCreditPrice: number,
  profitTargetPercentage: number
): number {
  const safeEntryPrice = Math.max(0.01, entryCreditPrice);
  const remainingValueRatio = Math.max(0, 100 - profitTargetPercentage) / 100;
  const calculatedDebit = safeEntryPrice * remainingValueRatio;
  return Math.max(0.01, parseFloat(calculatedDebit.toFixed(2)));
}

/**
 * Calculates Return on Capital (ROC) percentage.
 *
 * @param expectedProfitDollar Target profit in dollars.
 * @param collateralHeldDollar Total capital held in margin collateral.
 * @returns Return on capital percentage (e.g. 8.82%).
 */
export function calculateReturnOnCapital(
  expectedProfitDollar: number,
  collateralHeldDollar: number
): number {
  if (collateralHeldDollar <= 0) {
    return 0;
  }
  return (expectedProfitDollar / collateralHeldDollar) * 100;
}

/**
 * Formats a raw broker order side into a clean, professional string.
 *
 * @param brokerSide e.g. 'sell_to_open', 'buy_to_close', 'buy', 'sell'
 * @returns User-friendly text e.g. 'Sell to Open', 'Buy to Close'
 */
export function formatOrderSide(brokerSide: string | null | undefined): string {
  if (!brokerSide) {
    return '';
  }

  const sideMap: Record<string, string> = {
    sell_to_open: 'Sell to Open',
    buy_to_open: 'Buy to Open',
    sell_to_close: 'Sell to Close',
    buy_to_close: 'Buy to Close',
    buy: 'Buy',
    sell: 'Sell'
  };

  return sideMap[brokerSide.toLowerCase()] || brokerSide.replace(/_/g, ' ');
}
