/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** AI 서버 주소. 예: https://moa-api.example.workers.dev */
  readonly VITE_MOA_API?: string;
  /** 앱 버전 표시용 */
  readonly VITE_APP_VERSION?: string;
}
