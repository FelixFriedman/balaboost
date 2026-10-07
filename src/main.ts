import { enableProdMode, provideZoneChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { AppComponent } from './app/app.component';
import { APP_CONFIG } from './environments/environment';
import {provideTranslateService} from '@ngx-translate/core';
import {provideTranslateHttpLoader} from '@ngx-translate/http-loader';
import { PageNotFoundComponent } from './app/shared/components';
import { HomeComponent } from './app/home/home.component';

import { AppLayoutComponent } from './app/shared/layout/app-layout/app-layout.component';
import { BotsDashboardComponent } from './app/features/bots/bots-dashboard/bots-dashboard.component';

if (APP_CONFIG.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, {
  providers: [
    provideZoneChangeDetection(),provideHttpClient(withInterceptorsFromDi()),
    provideTranslateService({
      loader: provideTranslateHttpLoader({
        prefix: './assets/i18n/',
        suffix: '.json'
      }),
      fallbackLang: 'en',
      lang: 'en'
    }),
    provideRouter([
      {
        path: '',
        component: AppLayoutComponent,
        children: [
          {
            path: '',
            redirectTo: 'bots',
            pathMatch: 'full'
          },
          {
            path: 'bots',
            component: BotsDashboardComponent
          },
          {
            path: 'home',
            component: HomeComponent
          }
        ]
      },
      {
        path: '**',
        component: PageNotFoundComponent
      }
    ]),
  ]
}).catch(err => console.error(err));
