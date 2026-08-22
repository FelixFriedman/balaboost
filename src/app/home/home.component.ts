import { Component, HostListener, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { PanelComponent } from '../shared/components';
import { CommonModule } from '@angular/common';
import { TradierService } from '../core/services';

@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.scss'],
    standalone: true,
    imports: [CommonModule, TranslateModule]
})
export class HomeComponent implements OnInit {
  leftWidth = 250;
  rightWidth = 300;
  dragging: 'left' | 'right' | null = null;

  isLeftPanelCollapsed = false;
  previousLeftWidth = 250;
  
  quoteData: any = null;
  marketTags: string[] = [];

  constructor(private tradierService: TradierService) {}

  async ngOnInit(): Promise<void> {
    console.log('HomeComponent INIT');
    try {
      this.quoteData = await this.tradierService.getQuote('SPX,BPS,BCS');
      console.log('Quotes:', this.quoteData);
      
      this.marketTags = await this.tradierService.getMarketTags('SPX');
      console.log('SPX Market Tags:', this.marketTags);
    } catch (e) {
      console.error('Failed to fetch quote or tags', e);
    }
  }

  toggleLeftPanel() {
    this.isLeftPanelCollapsed = !this.isLeftPanelCollapsed;
    if (this.isLeftPanelCollapsed) {
      this.previousLeftWidth = this.leftWidth;
      this.leftWidth = 40; // Narrow width when collapsed
    } else {
      this.leftWidth = this.previousLeftWidth;
    }
  }

  onDragStart(event: MouseEvent, side: 'left' | 'right') {
    event.preventDefault();
    this.dragging = side;
    
    // Auto-expand if starting to drag while collapsed
    if (side === 'left' && this.isLeftPanelCollapsed) {
      this.isLeftPanelCollapsed = false;
      this.leftWidth = 150;
    }
  }

  @HostListener('document:mousemove', ['$event'])
  onDrag(event: MouseEvent) {
    if (!this.dragging) return;
    
    if (this.dragging === 'left') {
      // Allow resizing left panel between 150px and 500px
      this.leftWidth = Math.min(Math.max(150, event.clientX), 500);
    } else if (this.dragging === 'right') {
      // Allow resizing right panel between 150px and 600px
      const newWidth = window.innerWidth - event.clientX;
      this.rightWidth = Math.min(Math.max(150, newWidth), 600);
    }
  }

  @HostListener('document:mouseup')
  onDragEnd() {
    this.dragging = null;
  }
}
