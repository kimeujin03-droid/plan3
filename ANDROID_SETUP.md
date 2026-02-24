# Android 앱 변환 가이드 (Capacitor)

이 프로젝트는 Vite + React 웹앱이며, Capacitor로 안드로이드 앱으로 패키징할 수 있습니다.

## 1) 필수 설치 (최초 1회)
```bash
npm install
npm install @capacitor/core @capacitor/cli
npm install @capacitor/android
```

## 2) Capacitor 초기화/플랫폼 추가
(이미 `capacitor.config.ts`가 포함되어 있으므로 보통 아래만 실행하면 됩니다.)
```bash
npx cap add android
```

## 3) 웹앱 빌드 + 안드로이드 동기화
```bash
npm run build:android
```

## 4) Android Studio로 열기
```bash
npm run android
```

## 5) APK / AAB 빌드
Android Studio에서:
- **Build > Build Bundle(s) / APK(s) > Build APK(s)**
- 또는 **Generate Signed Bundle / APK**

---

## 자주 발생하는 이슈

### 정적 파일이 안 뜸 (흰 화면)
- Vite `base` 경로 문제일 수 있음 → 이 프로젝트는 `vite.config.ts`에 `base: './'` 적용됨.

### 웹 변경사항이 앱에 반영 안 됨
```bash
npm run build:web
npx cap sync android
```

### localStorage 데이터
- 앱(WebView) 내부 저장소에 유지됩니다.
- 앱 삭제 시 데이터가 같이 삭제될 수 있습니다.

---

## 다음 추천 작업(선택)
- 앱 아이콘 / 스플래시 적용 (`@capacitor/assets`)
- 상태바 색상 / 네비게이션바 색상 최적화
- 백버튼 동작 커스터마이징
- 오프라인 백업(export/import JSON) 추가
