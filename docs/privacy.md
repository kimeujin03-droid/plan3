# MOA 개인정보 처리방침

시행일: 2026년 11월 16일
운영자: [운영자 이름] · 문의: [연락처 이메일]

MOA(모아)는 하루를 기록하는 개인용 라이프로그 앱입니다. 이 문서는 MOA가 어떤 정보를 다루고 어디에 두는지 설명합니다.

## 한눈에 보기

- 기록은 **사용자의 기기 안에만** 저장됩니다. 회원가입과 로그인이 없고, 운영자는 기록을 볼 수 없습니다.
- "AI로 알아듣기"를 **직접 켠 경우에만**, 앱이 규칙으로 해석하지 못한 문장 하나가 서버로 전송됩니다.
- 광고, 분석 도구, 추적 기능은 없습니다. 위치·연락처·사진·마이크 권한을 쓰지 않습니다.

## 기기에 저장되는 정보

사용자가 입력한 내용만 저장합니다.

| 정보 | 예 |
|---|---|
| 활동 기록 | 활동 이름, 시작·종료 시각, 계획으로 칠한 칸 |
| 모아에게 한 말 | 입력한 문장 원문과 모아의 대답 |
| 메모·기분 | "하기 싫어" 같은 문장 |
| 점수 | 집중도, 피로도 |
| 설정 | 활동 이름, 알림과 AI 사용 여부 |

이 정보는 앱 전용 저장 공간에 있으며 다른 앱이 읽을 수 없습니다. 기기에서 Google 계정 백업을 켜 두었다면 Android의 자동 백업에 앱 데이터가 포함될 수 있습니다. 이 백업은 Google이 사용자의 계정으로 관리하며 운영자는 접근할 수 없습니다.

## 서버로 전송되는 정보 (AI로 알아듣기를 켠 경우만)

설정에서 "AI로 알아듣기"를 켜면, 앱이 규칙으로 해석하지 못한 말에 한해 다음이 전송됩니다.

- 그 문장 하나 (최대 300자)
- 활동 이름 목록, 지금 진행 중인 활동 이름
- 지금 시각 (시:분)

지난 기록, 기기 식별자, 계정 정보는 전송하지 않습니다.

전송 경로와 처리:

1. 문장은 암호화된 연결(HTTPS)로 MOA 서버(Cloudflare Workers)에 전달됩니다. 서버는 문장을 저장하거나 로그로 남기지 않습니다. 과도한 요청을 막기 위해 접속 IP 주소를 요청 횟수 계산에만 일시적으로 사용합니다.
2. 서버는 해석을 위해 문장을 Google의 Gemini API에 전달합니다. Google의 처리 방식은 [Gemini API 추가 서비스 약관](https://ai.google.dev/gemini-api/terms)을 따릅니다.

이 기능은 기본으로 꺼져 있고 설정에서 언제든 끌 수 있습니다. 끄면 아무것도 전송되지 않습니다. 건강 상태처럼 민감한 내용은 AI 기능을 켠 상태에서 입력하지 않기를 권합니다.

## 알림

"먼저 말 걸기"를 켜면 알림 권한을 요청합니다. 알림은 기기 안에서 예약되며 서버를 거치지 않습니다.

## 보관과 삭제

- 기록은 사용자가 지울 때까지 기기에 남습니다.
- 설정 → "모든 기록 지우기"로 전부 지울 수 있고, 앱을 삭제해도 기기의 기록이 지워집니다.
- 설정 → "내보내기"로 기록 전체를 파일로 받을 수 있습니다.
- 서버에는 지울 기록이 없습니다.

## 아동

MOA는 만 13세 미만 아동을 대상으로 하지 않습니다.

## 변경

이 방침이 바뀌면 이 페이지의 시행일을 고치고, 중요한 변경은 앱 업데이트 안내에 적습니다.

---

# MOA Privacy Policy (English summary)

Effective: November 16, 2026 · Operator: [operator name] · Contact: [contact email]

- MOA stores your records (activities, times, messages you type to Moa, notes, focus scores, settings) **only on your device**. There is no account and the operator cannot see your records.
- Only if you turn on "AI로 알아듣기" (AI understanding): a single sentence the app could not interpret (up to 300 characters), your activity names and the current clock time are sent over HTTPS to the MOA server (Cloudflare Workers), which forwards them to Google's Gemini API for interpretation. The server does not store or log the sentence; IP addresses are used transiently for rate limiting. Past records and device identifiers are never sent.
- No ads, analytics or tracking. No location, contacts, photos or microphone access.
- Delete everything in Settings → "모든 기록 지우기", or by uninstalling the app. Export everything in Settings → "내보내기".
- MOA is not directed at children under 13.
