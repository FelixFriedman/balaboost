/**
 * @file autotrade-terminal.component.ts
 * @description Monospace activity terminal feed for displaying real-time engine evaluation decisions,
 * order timeouts, signal detections, and broker fills.
 * Includes interactive text search, level filtering (info, warn, error, success),
 * and direct one-click access to the persistent local disk log file.
 */

import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AutotradeLogEntry } from '../../../../../core/models/autotrade.model';

@Component({
  selector: 'app-autotrade-terminal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './autotrade-terminal.component.html',
  styleUrl: './autotrade-terminal.component.scss'
})
export class AutotradeTerminalComponent {
  /**
   * Chronological activity logs from the AutotradeEngine.
   */
  @Input() logs: AutotradeLogEntry[] = [];

  /**
   * Absolute path to the persistent local log file on disk.
   */
  @Input() logFilePath: string | null = null;

  /**
   * Emitted when user clicks to open or reveal the persistent log file on disk.
   */
  @Output() openLogFileRequested = new EventEmitter<void>();

  /**
   * Whether the terminal logs container is collapsed.
   */
  isCollapsed: boolean = false;

  /**
   * Active level filter tab ('all' | 'success' | 'warn' | 'error' | 'info')
   */
  activeLevelFilter: 'all' | 'success' | 'warn' | 'error' | 'info' = 'all';

  /**
   * User search query for filtering log messages in real-time.
   */
  searchTerm: string = '';

  toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed;
  }

  setLevelFilter(filter: 'all' | 'success' | 'warn' | 'error' | 'info'): void {
    this.activeLevelFilter = filter;
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.activeLevelFilter = 'all';
  }

  get filteredLogs(): AutotradeLogEntry[] {
    if (!this.logs || !Array.isArray(this.logs)) {
      return [];
    }

    let result = this.logs;

    if (this.activeLevelFilter !== 'all') {
      result = result.filter(l => l.level === this.activeLevelFilter);
    }

    if (this.searchTerm && this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase().trim();
      result = result.filter(l =>
        (l.message && l.message.toLowerCase().includes(term)) ||
        (l.timeFormatted && l.timeFormatted.toLowerCase().includes(term)) ||
        (l.level && l.level.toLowerCase().includes(term))
      );
    }

    return result;
  }

  getCount(level: 'all' | 'success' | 'warn' | 'error' | 'info'): number {
    if (!this.logs || !Array.isArray(this.logs)) {
      return 0;
    }
    if (level === 'all') {
      return this.logs.length;
    }
    return this.logs.filter(l => l.level === level).length;
  }
}
