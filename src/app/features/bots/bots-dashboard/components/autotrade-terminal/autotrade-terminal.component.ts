/**
 * @file autotrade-terminal.component.ts
 * @description Monospace activity terminal feed for displaying real-time engine evaluation decisions,
 * order timeouts, signal detections, and broker fills.
 */

import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AutotradeLogEntry } from '../../../../../core/models/autotrade.model';

@Component({
  selector: 'app-autotrade-terminal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './autotrade-terminal.component.html',
  styleUrl: './autotrade-terminal.component.scss'
})
export class AutotradeTerminalComponent {
  /**
   * Chronological activity logs from the AutotradeEngine.
   */
  @Input() logs: AutotradeLogEntry[] = [];

  /**
   * Optional event emitted if the user clears the terminal history.
   */
  @Output() cleared = new EventEmitter<void>();
}
