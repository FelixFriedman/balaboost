/**
 * @file trading-hours-drawer.component.ts
 * @description Schedule configuration drawer for managing the automated execution window.
 * Enforces peak liquidity hours (Eastern Time) to prevent morning opening volatility and closing pin risk.
 */

import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TradingHoursConfig } from '../../../../../core/models/options-trading.model';

@Component({
  selector: 'app-trading-hours-drawer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './trading-hours-drawer.component.html',
  styleUrl: './trading-hours-drawer.component.scss'
})
export class TradingHoursDrawerComponent implements OnInit {
  /**
   * The active trading hours schedule configuration.
   */
  @Input({ required: true }) config!: TradingHoursConfig;

  /**
   * Emitted whenever the schedule or sandbox bypass settings are updated.
   */
  @Output() saved = new EventEmitter<TradingHoursConfig>();

  /**
   * Local editable copy of the configuration.
   */
  localConfig!: TradingHoursConfig;

  ngOnInit(): void {
    this.localConfig = { ...this.config };
  }

  /**
   * Applies pre-calibrated schedule presets:
   * - Conservative (Recommended): 10:00 AM – 3:00 PM ET (avoids 9:30-10:00 open chop & 3:00-4:00 close risk)
   * - Full Session: 9:30 AM – 4:00 PM ET
   * - Midday Peak: 10:30 AM – 2:30 PM ET
   *
   * @param preset The selected window profile.
   */
  applyPreset(preset: 'conservative' | 'full' | 'midday'): void {
    if (preset === 'conservative') {
      this.localConfig.startTime = '10:00';
      this.localConfig.endTime = '15:00';
    } else if (preset === 'full') {
      this.localConfig.startTime = '09:30';
      this.localConfig.endTime = '16:00';
    } else if (preset === 'midday') {
      this.localConfig.startTime = '10:30';
      this.localConfig.endTime = '14:30';
    }
    this.save();
  }

  /**
   * Emits the updated schedule configuration to the parent orchestrator to persist.
   */
  save(): void {
    this.saved.emit({ ...this.localConfig });
  }
}
