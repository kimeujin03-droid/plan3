# Android Studio 없이 APK 빌드하기 (GitHub Actions)

이 프로젝트는 GitHub Actions로 **자동 빌드**해서 APK 파일을 받을 수 있습니다.

## 1) GitHub에 업로드
- 새 레포 생성
- 이 프로젝트 전체 업로드 (zip 풀어서 업로드 or git push)

## 2) GitHub에서 실행
- 레포 페이지 → **Actions** 탭
- `Build Android APK (Capacitor)` 워크플로 선택
- **Run workflow** 클릭

## 3) APK 다운로드
- 빌드 완료 후 실행 결과 페이지 하단의 **Artifacts**에서
- `app-debug-apk` 다운로드

## 참고
- 처음 빌드는 5~15분 걸릴 수 있음
- 내려받는 파일은 보통 `app-debug.apk` (디버그 APK)
- 디버그 APK는 설치 전 폰에서 '알 수 없는 앱 설치 허용'이 필요할 수 있음
- Play Store 배포용 AAB/서명 릴리스는 추가 설정(keystore) 필요
