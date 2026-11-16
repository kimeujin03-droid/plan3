import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yujin.moa',
  appName: 'MOA',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    // 밝은 배경이라 상태 표시줄 글자는 어둡게. 화면 가장자리 여백은 CSS 변수로 받는다.
    SystemBars: {
      style: 'LIGHT',
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
    LocalNotifications: {
      iconColor: '#26233A',
    },
  },
};

export default config;
