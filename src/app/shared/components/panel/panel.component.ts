import { Component, Input, Output, EventEmitter } from '@angular/core';


@Component({
  selector: 'app-panel',
  standalone: true,
  imports: [],
  templateUrl: './panel.component.html',
  styleUrls: ['./panel.component.scss']
})
export class PanelComponent {
  @Input() title: string = '';
  @Input() collapsible: boolean = false;
  @Input() isCollapsed: boolean = false;
  @Output() toggleCollapse = new EventEmitter<void>();
}
