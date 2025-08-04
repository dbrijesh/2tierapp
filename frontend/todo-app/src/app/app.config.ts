import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { 
  MsalService,
  MsalGuard,
  MsalBroadcastService,
  MsalInterceptor,
  MsalRedirectComponent,
  MSAL_GUARD_CONFIG,
  MSAL_INSTANCE,
  MSAL_INTERCEPTOR_CONFIG,
  MsalGuardConfiguration,
  MsalInterceptorConfiguration
} from '@azure/msal-angular';
import {
  PublicClientApplication,
  InteractionType,
  BrowserCacheLocation,
  LogLevel,
  IPublicClientApplication
} from '@azure/msal-browser';

import { routes } from './app.routes';

/**
 * Factory function to create and configure MSAL PublicClientApplication instance
 * @returns IPublicClientApplication - Configured MSAL instance
 */
const msalInstanceFactory = (): IPublicClientApplication => {
  const msalInstance = new PublicClientApplication({
    auth: {
      clientId: '01d37875-07ee-427e-8be5-594fbe4c5632',
      authority: 'https://login.microsoftonline.com/52451440-c2a9-442f-8c20-8562d49f6846/v2.0',
      redirectUri: 'http://localhost:4200/callback',
      postLogoutRedirectUri: 'http://localhost:4200',
      knownAuthorities: ['login.microsoftonline.com']
    },
    cache: {
      cacheLocation: BrowserCacheLocation.LocalStorage,
      storeAuthStateInCookie: true, // Enable cookie storage for better persistence
      secureCookies: false // Allow for localhost development
    },
    system: {
      loggerOptions: {
        loggerCallback: (level: LogLevel, message: string) => {
          console.log(`MSAL: ${message}`);
        },
        logLevel: LogLevel.Verbose,
        piiLoggingEnabled: false
      },
      allowRedirectInIframe: false
    }
  });
  
  return msalInstance;
};

/**
 * Factory function to configure MSAL Guard for route protection
 * @returns MsalGuardConfiguration - Guard configuration
 */
const msalGuardConfigFactory = (): MsalGuardConfiguration => {
  return {
    interactionType: InteractionType.Redirect,
    authRequest: {
      scopes: ['openid', 'profile', 'email', 'https://graph.microsoft.com/User.Read']
    }
  };
};

/**
 * Factory function to configure MSAL Interceptor for automatic token attachment
 * @returns MsalInterceptorConfiguration - Interceptor configuration
 */
const msalInterceptorConfigFactory = (): MsalInterceptorConfiguration => {
  const protectedResourceMap = new Map<string, Array<string>>();
  protectedResourceMap.set('http://localhost:5000/api/*', ['01d37875-07ee-427e-8be5-594fbe4c5632/.default']);
  
  return {
    interactionType: InteractionType.Redirect,
    protectedResourceMap
  };
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }), 
    provideRouter(routes),
    provideHttpClient(withInterceptorsFromDi()),
    {
      provide: MSAL_INSTANCE,
      useFactory: msalInstanceFactory
    },
    {
      provide: MSAL_GUARD_CONFIG,
      useFactory: msalGuardConfigFactory
    },
    {
      provide: MSAL_INTERCEPTOR_CONFIG,
      useFactory: msalInterceptorConfigFactory
    },
    MsalService,
    MsalGuard,
    MsalBroadcastService,
    MsalInterceptor
  ]
};
