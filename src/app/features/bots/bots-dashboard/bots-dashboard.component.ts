import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TradierService } from '../../../core/services';

@Component({
  selector: 'app-bots-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bots-dashboard.component.html',
  styleUrl: './bots-dashboard.component.scss'
})
export class BotsDashboardComponent implements OnInit {
  quoteData: any = null;
  marketTags: string[] = [];

  constructor(private tradierService: TradierService) {}

  async ngOnInit(): Promise<void> {
    try {
      this.quoteData = await this.tradierService.getQuote('SPX');
      this.marketTags = await this.tradierService.getMarketTags('SPX');
    } catch (e) {
      console.error('Failed to fetch data', e);
    }
  }
}
