# OptionsApp — Project Roadmap & Backlog (TODO)

## Algorithmic & Indicator Enhancements

- [ ] **Multi-Timeframe Analysis Engine (High Priority)**
  - *Description:* Decouple macro trend identification from intraday entry timing.
  - *Macro Layer:* Use **Daily (1D)** or **1-Hour (60m)** candles to establish dominant macro trend (`bull` vs `bear`) via longer-term moving averages (e.g., 50 SMA / 200 SMA or 8/21 EMA).
  - *Micro Layer:* Use **15-Minute** candles purely for intraday execution timing (triggering entry on MACD crossover `MACD > Signal` or pullback to 8/21 EMA).
  - *Benefit:* Dramatically eliminates whipsaws caused by intraday chop while keeping entries sharp.

- [ ] **Configurable Chart & Indicator Timeframes in UI**
  - Allow switching the timeframe dynamically from the dashboard (e.g., 5m, 15m, 30m, 1h, 1D) instead of defaulting strictly to 15m in [`IndicatorsService`](file:///Users/felix/Desktop/ElectronProjects/OptionsApp/app/analysis/indicators-service.ts).

- [ ] **Dynamic ADX Threshold Tuning**
  - Allow adjusting the current static threshold (`ADX > 25`) or combining it with `+DI` and `-DI` directional lines for enhanced trend confirmation.

---

## Trading Engine & Execution (Phase 2)

- [ ] **Vanguard Execution Integration**
  - Connect the generated `OptionsPricingEngine` order preview (`trading:previewOrder`) directly to automated order placement or 1-click execution on Vanguard.

- [ ] **Position Management & Exit Rules**
  - Implement automated exit rules for active credit spreads:
    - Take profit target (e.g., closing at 50% max profit).
    - Stop loss rule (e.g., closing at 200%–300% credit received or delta breach).
    - Expiration management (close or roll at 7–14 DTE).

- [ ] **Multiple Underlying Asset Support**
  - Expand beyond SPX to support automated scans across major ETFs (e.g., SPY, QQQ, IWM) and liquid equities.
