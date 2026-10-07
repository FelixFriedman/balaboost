/**
 * @file market-chart.component.ts
 * @description Interactive candlestick charting component built on TradingView Lightweight Charts.
 * Renders daily OHLC candlesticks, 8 EMA and 21 EMA overlays, and provides crosshair hover tracking
 * with high-precision price and indicator readout banners.
 */

import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
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
  LineSeries
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
      height: 400,
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
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
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
        param.point.y > 400
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

      let dateString = '';
      if (typeof param.time === 'number') {
        dateString = new Date(param.time * 1000).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
      } else if (typeof param.time === 'object') {
        const { year, month, day } = param.time as any;
        dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }

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
   * Transforms raw indicator payloads into lightweight-charts format and populates all 3 series.
   */
  private renderSeriesData(indicators: any): void {
    if (!this.chartInstance || !indicators.bars) return;

    const candleData: CandleBarData[] = indicators.bars.map((bar: any) => ({
      time: new Date(bar.time).getTime() / 1000,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close
    })).filter((bar: CandleBarData) => !isNaN(bar.time));

    const ema8Data = indicators.ema8.map((val: number, i: number) => ({
      time: candleData[i]?.time,
      value: val
    })).filter((item: any) => item.value !== null && item.time !== undefined);

    const ema21Data = indicators.ema21.map((val: number, i: number) => ({
      time: candleData[i]?.time,
      value: val
    })).filter((item: any) => item.value !== null && item.time !== undefined);

    this.candlestickSeries.setData(candleData);
    this.ema8LineSeries.setData(ema8Data);
    this.ema21LineSeries.setData(ema21Data);

    if (candleData.length > 0) {
      const lastCandle = candleData[candleData.length - 1];
      const candleChange = lastCandle.close - lastCandle.open;
      const candleChangePct = lastCandle.open > 0 ? (candleChange / lastCandle.open) * 100 : 0;
      const lastEma8 = ema8Data.length > 0 ? ema8Data[ema8Data.length - 1]?.value : undefined;
      const lastEma21 = ema21Data.length > 0 ? ema21Data[ema21Data.length - 1]?.value : undefined;

      const timeLabel = new Date(lastCandle.time * 1000).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });

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
