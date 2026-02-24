import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yujin.lifelogplanner',
  appName: 'Digital Life Log Planner',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
