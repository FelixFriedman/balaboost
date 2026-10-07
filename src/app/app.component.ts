import { Component, inject } from '@angular/core';
import { ElectronService } from './core/services';
import { TranslateService } from '@ngx-translate/core';
import { APP_CONFIG } from '../environments/environment';
import { RouterOutlet } from '@angular/router';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    standalone: true,
    imports: [RouterOutlet]
})
export class AppComponent {
  private electronService = inject(ElectronService);
  private translate = inject(TranslateService);

  constructor() {
    this.translate.setDefaultLang('en');
    console.log('APP_CONFIG', APP_CONFIG);

    if (this.electronService.isElectron) {
      console.log('Run in electron');
      void this.electronService.ipcRenderer.invoke('app:get-version').then(v => console.log('App version:', v));
    } else {
      console.log('Run in browser');
    }
  }
}
