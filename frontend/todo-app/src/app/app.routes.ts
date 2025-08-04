import { Routes } from '@angular/router';
import { MsalRedirectComponent } from '@azure/msal-angular';

export const routes: Routes = [
  {
    path: 'callback',
    component: MsalRedirectComponent
  }
];
