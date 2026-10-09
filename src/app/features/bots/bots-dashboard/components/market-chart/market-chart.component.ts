/**
 * @file market-chart.component.ts
 * @description Interactive candlestick charting component built on TradingView Lightweight Charts.
 * Renders daily OHLC candlesticks, 8 EMA and 21 EMA overlays, and provides crosshair hover tracking
 * with high-precision price and indicator readout banners.
 */

import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  AfterViewInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickSeries,
  LineSeries,
  TickMarkType
} from 'lightweight-charts';
import { ActiveBarValues, CandleBarData } from '../../../../../core/models/options-trading.model';

@Component({
  selector: 'app-market-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './market-chart.component.html',
  styleUrl: './market-chart.component.scss'
})
export class MarketChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('chartCanvas', { static: false }) chartCanvasElement!: ElementRef<HTMLDivElement>;

  /**
   * Technical indicator dataset containing OHLC bars, 8 EMA, and 21 EMA arrays.
   */
  @Input() indicators: any = null;

  /** Timestamp of the last data update */
  @Input() lastUpdated: Date | null = null;

  /** Whether a data refresh is in progress */
  @Input() isLoading: boolean = false;

  /** Emitted when the user clicks the refresh button */
  @Output() refreshRequested = new EventEmitter<void>();

  /**
   * The TradingView Lightweight Charts instance.
   */
  private chartInstance!: IChartApi;

  /** Candlestick series api */
  private candlestickSeries!: ISeriesApi<any>;

  /** 8-period Exponential Moving Average series api */
  private ema8LineSeries!: ISeriesApi<any>;

  /** 21-period Exponential Moving Average series api */
  private ema21LineSeries!: ISeriesApi<any>;

  /** Values of the currently hovered candle bar under user crosshair */
  hoveredBarValues: ActiveBarValues | null = null;

  /** Values of the most recent closed/active candle bar */
  latestBarValues: ActiveBarValues | null = null;

  /** Active display values (hovered candle takes precedence over latest candle) */
  get displayedBarValues(): ActiveBarValues | null {
    return this.hoveredBarValues || this.latestBarValues;
  }

  /** Formatted last updated string in US Eastern Time */
  get lastUpdatedTimeFormatted(): string {
    if (!this.lastUpdated) return '';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(this.lastUpdated);
  }

  /** Handles user click on manual refresh button */
  onRefreshClicked(): void {
    if (!this.isLoading) {
      this.refreshRequested.emit();
    }
  }

  ngAfterViewInit(): void {
    this.initializeChart();
    if (this.indicators) {
      this.renderSeriesData(this.indicators);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['indicators'] && this.chartInstance && this.indicators) {
      this.renderSeriesData(this.indicators);
    }
  }

  ngOnDestroy(): void {
    if (this.chartInstance) {
      this.chartInstance.remove();
    }
  }

  /**
   * Initializes the TradingView Lightweight Charts instance with dark mode styling,
   * candlestick series, and EMA line series.
   */
  private initializeChart(): void {
    if (!this.chartCanvasElement) return;

    const container = this.chartCanvasElement.nativeElement;

    this.chartInstance = createChart(container, {
      width: container.clientWidth || 800,
      height: 440,
      layout: {
        background: { color: '#151521' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
      },
      crosshair: {
        vertLine: {
          labelVisible: true,
          color: 'rgba(255, 255, 255, 0.25)',
          style: 3,
        },
        horzLine: {
          labelVisible: true,
          color: 'rgba(255, 255, 255, 0.25)',
          style: 3,
        },
      },
      localization: {
        locale: 'en-US',
        dateFormat: 'yyyy-MM-dd',
        timeFormatter: (time: any) => this.formatEasternTime(time),
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: any, tickMarkType: TickMarkType) => this.formatTickMark(time, tickMarkType),
      }
    });

    this.candlestickSeries = this.chartInstance.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    this.ema8LineSeries = this.chartInstance.addSeries(LineSeries, {
      color: '#2196F3',
      lineWidth: 2,
      title: '8 EMA',
    });

    this.ema21LineSeries = this.chartInstance.addSeries(LineSeries, {
      color: '#FF9800',
      lineWidth: 2,
      title: '21 EMA',
    });

    // Crosshair listener: extracts exact values of the candle hovered by user mouse
    this.chartInstance.subscribeCrosshairMove((param: any) => {
      if (
        !param ||
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.x > container.clientWidth ||
        param.point.y < 0 ||
        param.point.y > (container.clientHeight || 440)
      ) {
        this.hoveredBarValues = null;
        return;
      }

      const barData: any = param.seriesData.get(this.candlestickSeries);
      if (!barData || typeof barData.open !== 'number') {
        this.hoveredBarValues = null;
        return;
      }

      const ema8Val: any = param.seriesData.get(this.ema8LineSeries);
      const ema21Val: any = param.seriesData.get(this.ema21LineSeries);

      const dateString = this.formatEasternTime(param.time);
      const priceChange = barData.close - barData.open;
      const priceChangePct = barData.open > 0 ? (priceChange / barData.open) * 100 : 0;

      this.hoveredBarValues = {
        time: dateString,
        open: barData.open,
        high: barData.high,
        low: barData.low,
        close: barData.close,
        change: priceChange,
        changePct: priceChangePct,
        ema8: ema8Val?.value,
        ema21: ema21Val?.value,
      };
    });

    // Auto-resize chart on window dimension changes
    window.addEventListener('resize', () => {
      if (this.chartInstance && container) {
        this.chartInstance.applyOptions({ width: container.clientWidth });
      }
    });
  }

  /**
   * Formats a given timestamp or BusinessDay object into US Eastern Time (ET).
   */
  private formatEasternTime(time: any): string {
    let timestamp: number;
    if (typeof time === 'number') {
      timestamp = time > 1e11 ? time : time * 1000;
    } else if (typeof time === 'string') {
      timestamp = new Date(time).getTime();
    } else if (typeof time === 'object' && time !== null) {
      const { year, month, day } = time;
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ET`;
    } else {
      return '';
    }

    if (isNaN(timestamp)) return '';

    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(new Date(timestamp)) + ' ET';
  }

  /**
   * Formats time scale tick mark labels in US Eastern Time (ET).
   */
  private formatTickMark(time: any, tickMarkType: TickMarkType): string | null {
    let timestamp: number;
    if (typeof time === 'number') {
      timestamp = time > 1e11 ? time : time * 1000;
    } else if (typeof time === 'string') {
      timestamp = new Date(time).getTime();
    } else if (typeof time === 'object' && time !== null) {
      const { year, month, day } = time;
      timestamp = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getTime();
    } else {
      return null;
    }

    if (isNaN(timestamp)) return null;
    const d = new Date(timestamp);

    switch (tickMarkType) {
      case TickMarkType.Year:
        return new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          year: 'numeric'
        }).format(d);
      case TickMarkType.Month:
        return new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          month: 'short'
        }).format(d);
      case TickMarkType.DayOfMonth:
        return new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          day: 'numeric'
        }).format(d);
      case TickMarkType.Time:
        return new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }).format(d);
      case TickMarkType.TimeWithSeconds:
        return new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }).format(d);
      default:
        return null;
    }
  }

  /**
   * Transforms raw indicator payloads into lightweight-charts format and populates all 3 series.
   */
  private renderSeriesData(indicators: any): void {
    if (!this.chartInstance || !indicators.bars) return;

    // Ensure strictly ascending unique timestamps for Lightweight Charts
    const uniqueCandlesMap = new Map<number, CandleBarData>();
    for (const bar of indicators.bars) {
      let timeSec: number;
      if (typeof bar.timestamp === 'number') {
        timeSec = bar.timestamp > 1e11 ? Math.floor(bar.timestamp / 1000) : bar.timestamp;
      } else if (typeof bar.time === 'number') {
        timeSec = bar.time > 1e11 ? Math.floor(bar.time / 1000) : bar.time;
      } else if (typeof bar.time === 'string') {
        timeSec = Math.floor(new Date(bar.time).getTime() / 1000);
      } else {
        continue;
      }

      if (isNaN(timeSec)) continue;

      uniqueCandlesMap.set(timeSec, {
        time: timeSec,
        open: Number(bar.open),
        high: Number(bar.high),
        low: Number(bar.low),
        close: Number(bar.close)
      });
    }

    const candleData: CandleBarData[] = Array.from(uniqueCandlesMap.values())
      .sort((a, b) => (a.time as number) - (b.time as number));

    // Map EMA series robustly whether the source array is padded with nulls or unpadded
    const mapEmaSeries = (emaArray: (number | null)[] | undefined): { time: any; value: number }[] => {
      if (!emaArray || !Array.isArray(emaArray) || candleData.length === 0) return [];

      const isPadded = emaArray.length === candleData.length;
      const offset = isPadded ? 0 : Math.max(0, candleData.length - emaArray.length);

      return emaArray
        .map((val, i) => {
          if (val === null || val === undefined || isNaN(val as number)) return null;
          const targetIndex = i + offset;
          const candle = candleData[targetIndex];
          if (!candle || candle.time === undefined) return null;
          return {
            time: candle.time,
            value: Number(val)
          };
        })
        .filter((item): item is { time: any; value: number } => item !== null);
    };

    const ema8Data = mapEmaSeries(indicators.ema8);
    const ema21Data = mapEmaSeries(indicators.ema21);

    this.candlestickSeries.setData(candleData);
    this.ema8LineSeries.setData(ema8Data);
    this.ema21LineSeries.setData(ema21Data);

    if (candleData.length > 0) {
      // Ensure the chart's visible range is scrolled to the latest active candle
      this.chartInstance.timeScale().scrollToRealTime();

      const lastCandle = candleData[candleData.length - 1];
      const candleChange = lastCandle.close - lastCandle.open;
      const candleChangePct = lastCandle.open > 0 ? (candleChange / lastCandle.open) * 100 : 0;
      const lastEma8 = ema8Data.length > 0 ? ema8Data[ema8Data.length - 1]?.value : undefined;
      const lastEma21 = ema21Data.length > 0 ? ema21Data[ema21Data.length - 1]?.value : undefined;

      const timeLabel = this.formatEasternTime(lastCandle.time);

      this.latestBarValues = {
        time: timeLabel,
        open: lastCandle.open,
        high: lastCandle.high,
        low: lastCandle.low,
        close: lastCandle.close,
        change: candleChange,
        changePct: candleChangePct,
        ema8: lastEma8,
        ema21: lastEma21
      };
    }
  }
}
