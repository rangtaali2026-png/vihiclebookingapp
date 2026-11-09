import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.planttransit.fleetapp',
  appName: 'SmartDrive',
  server: {
    url: 'https://vehiclebookingapp.pages.dev',
    cleartext: false,
    androidScheme: 'https'
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: true
  },
  plugins: {
    Geolocation: {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 3000
    }
  }
};

export default config;
