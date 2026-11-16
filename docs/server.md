# AI 서버 연결하기

모아가 규칙으로 못 알아들은 말을 Gemini에게 물어보는 작은 서버(`server/`)를 Cloudflare Workers에 올리는 방법. 전부 폰 브라우저로 할 수 있다.

구조: 앱 → Cloudflare Worker(`/v1/parse`) → Gemini API. API 키는 Worker에만 있고 앱에는 들어가지 않는다.

## 1. Gemini API 키 만들기

1. [Google AI Studio](https://aistudio.google.com/apikey)에서 API 키를 만든다.
2. 키는 비밀번호처럼 다룬다. 채팅이나 코드에 붙여 넣지 않는다.

무료 한도와 유료의 차이:

| | 무료 한도 | 결제 연결(유료) |
|---|---|---|
| 비용 | 없음 | 쓴 만큼 |
| Google이 보낸 문장을 제품 개선에 쓰는가 | 쓴다 | 쓰지 않는다 |

혼자 시험할 때는 무료 한도로 충분하다. **다른 사람이 쓰는 스토어 출시 버전은 결제를 연결한 프로젝트의 키를 써야 한다.** 무료 한도는 약관상 개인정보를 보내지 말라고 되어 있고, 사용자의 문장이 Google의 제품 개선에 쓰이기 때문이다. 결제를 연결할 때는 Google Cloud에서 예산 알림을 같이 걸어 둔다.

## 2. Cloudflare 준비

1. [Cloudflare](https://dash.cloudflare.com/sign-up)에 가입한다 (Workers 무료 플랜).
2. 대시보드 오른쪽의 **Account ID**를 복사해 둔다.
3. My Profile → API Tokens → Create Token → **Edit Cloudflare Workers** 템플릿으로 토큰을 만든다.

## 3. GitHub에 비밀값 등록

저장소 Settings → Secrets and variables → Actions → **Secrets**에 세 개를 넣는다.

| 이름 | 값 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 2-3에서 만든 토큰 |
| `CLOUDFLARE_ACCOUNT_ID` | 2-2의 Account ID |
| `GEMINI_API_KEY` | 1에서 만든 키 |

## 4. 배포

Actions 탭 → **Deploy API** → Run workflow. 끝나면 로그에 `https://moa-api.<계정이름>.workers.dev` 주소가 나온다.

브라우저에서 `그 주소/health`를 열어 `{"ok":true,"configured":true}`가 보이면 된 것이다.

## 5. 앱에 주소 알려주기

둘 중 하나.

- **빌드에 넣기(권장)**: 저장소 Settings → Secrets and variables → Actions → **Variables**에 `VITE_MOA_API` = 4의 주소. 다음 APK 빌드부터 기본 주소로 들어간다.
- **지금 설치된 앱에서 바로**: 설정 → AI로 알아듣기 → 서버 주소 바꾸기에 주소를 넣는다.

그다음 설정에서 **AI로 알아듣기**를 켠다. 기본은 꺼짐이다.

## 동작 방식

- "과제 시작할게"처럼 규칙으로 알아듣는 말은 서버로 가지 않는다. 빠르고 비용이 없다.
- 못 알아들은 말만 서버로 간다. 보내는 것은 그 문장, 활동 이름, 지금 시각뿐이다.
- 서버가 느리거나(7초) 실패하면 예전처럼 메모로 남는다. 원문은 어느 경우든 바로 저장된다.

## 남용 막기

- 한 IP당 1분에 20번까지 (`server/wrangler.jsonc`의 `ratelimits`).
- 요청은 4KB, 문장은 300자까지.
- 이 서버는 로그인 없이 누구나 부를 수 있다. 앱 안의 어떤 값도 비밀이 될 수 없기 때문이다. 그래서 **Gemini 쪽에 하루 사용량 한도나 예산 알림을 반드시 걸어 둔다.** 사용자가 늘면 Play Integrity 같은 앱 검증을 붙이는 것이 다음 단계다.

## 모델 바꾸기

`server/wrangler.jsonc`의 `GEMINI_MODEL`을 고치고 다시 배포한다. 지금 값은 `gemini-3.5-flash-lite`.

## 내 컴퓨터에서 돌려보기 (선택)

```bash
cd server
echo 'GEMINI_API_KEY=키' > .dev.vars     # 이 파일은 커밋하지 않는다
npx wrangler dev
```
