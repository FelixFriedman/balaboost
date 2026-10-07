/**
 * @file risk-limits-drawer.component.ts
 * @description Risk management drawer component for configuring automated risk boundaries,
 * circuit breaker thresholds, position sizing, cooldown buffers, order TTL, and hybrid spread caps.
 */

import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AutotradeRiskConfig } from '../../../../../core/models/autotrade.model';

@Component({
  selector: 'app-risk-limits-drawer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './risk-limits-drawer.component.html',
  styleUrl: './risk-limits-drawer.component.scss'
})
export class RiskLimitsDrawerComponent implements OnInit {
  /**
   * The active autotrade risk limits configuration from the engine.
   */
  @Input({ required: true }) config!: AutotradeRiskConfig;

  /**
   * Emitted when the user saves updated risk limits.
   */
  @Output() saved = new EventEmitter<AutotradeRiskConfig>();

  /**
   * Local editable copy to prevent unintended live mutations until user clicks Save.
   */
  localConfig!: AutotradeRiskConfig;

  ngOnInit(): void {
    this.localConfig = { ...this.config };
  }

  /**
   * Applies pre-calibrated risk limit profiles based on trading style:
   * - Conservative: $300 daily loss, 1.5x stop loss, 1 spread, 5-point spread cap ($500 collateral).
   * - Balanced: $500 daily loss, 2.0x stop loss, 2 spreads, 15m TTL, 20-point spread cap ($2,000 collateral).
   * - Aggressive: $1,000 daily loss, 3.0x stop loss, 4 spreads, 25-point spread cap ($2,500 collateral).
   *
   * @param preset The selected profile: 'conservative' | 'balanced' | 'aggressive'.
   */
  applyPreset(preset: 'conservative' | 'balanced' | 'aggressive'): void {
    if (preset === 'conservative') {
      this.localConfig = {
        ...this.localConfig,
        maxDailyLoss: 300,
        stopLossMultiplier: 1.5,
        profitTargetPct: 50,
        maxConcurrentPositions: 1,
        contractsPerTrade: 1,
        cooldownMinutes: 20,
        orderTimeoutMinutes: 2,
        autoResumeOnLaunch: true,
        maxSpreadWidth: 5
      };
    } else if (preset === 'balanced') {
      this.localConfig = {
        ...this.localConfig,
        maxDailyLoss: 500,
        stopLossMultiplier: 2.0,
        profitTargetPct: 50,
        maxConcurrentPositions: 2,
        contractsPerTrade: 1,
        cooldownMinutes: 15,
        orderTimeoutMinutes: 15,
        autoResumeOnLaunch: true,
        maxSpreadWidth: 20
      };
    } else if (preset === 'aggressive') {
      this.localConfig = {
        ...this.localConfig,
        maxDailyLoss: 1000,
        stopLossMultiplier: 3.0,
        profitTargetPct: 65,
        maxConcurrentPositions: 4,
        contractsPerTrade: 2,
        cooldownMinutes: 10,
        orderTimeoutMinutes: 5,
        autoResumeOnLaunch: true,
        maxSpreadWidth: 25
      };
    }
  }

  /**
   * Emits the updated risk configuration to the parent orchestrator to persist to disk.
   */
  saveLimits(): void {
    this.saved.emit({ ...this.localConfig });
  }
}
