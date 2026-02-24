# Digital Life Log Planner

**Core Interaction & Logic Specification (Definitive)**

> 이 문서는 디자인 · 인터랙션 · 로직에 대한 "정본" 합의안이다. 이 스펙을 기준으로 구현/수정하면 시행착오를 줄일 수 있다.

---

## 0. 기본 철학

* **시간은 좌표다** → 모든 블록은 `startMinute ~ endMinute` 로만 정의된다.
* **그리기는 수단, 편집·분석이 목적**
* **모드는 섞이지 않는다**: Paint / New / Select / Indicator / Erase (체크리스트는 별도 모드 없음, long-press 트리거)

---

## 1. 모드 시스템 (절대 규칙)

```ts
mode:
  | "PAINT"       // 색칠
  | "NEW_EVENT"   // 드래그로 신규 일정 생성
  | "SELECT"      // 선택 & 편집
  | "INDICATOR"   // 지표 생성
  | "ERASE"

// 체크리스트는 전용 모드 없음 — paint/new 상태에서 셀 long-press로 생성
```

### 공통 원칙

* **hover는 절대 생성/변경을 트리거하지 않는다**
* 모든 생성·편집은 `pointerDown → drag → pointerUp` 기반
* 모드 전환은 **명시적 버튼 클릭으로만**

---

## 2. Execute / Overlay (중복) 로직

### 2.1 Execute (본 일정)

* 메인 일정, 셀 높이 대부분 차지
* 색상: activity color
* 텍스트: **segment 시작점에만 이름 1회**

### 2.2 Overlay (중복 일정) — 계획/덧칠/보조 레이어

시각 규칙

* Execute **아래쪽**에 붙음
* 높이: 얇은 바 (예: 6~10px)
* 하단 gap 2~6px 유지
* 같은 activity + 연속 시간 → **하나의 segment로 병합**

라벨 규칙

* overlay도 **segment 시작점에만 이름 1회**
* 위치: overlay 바 내부 좌측 OR 바로 위(작게)

절대 금지

* overlay가 execute 높이를 밀어내는 것
* overlay가 시간 좌표계를 바꾸는 것

---

## 3. 신규 일정 생성 (NEW_EVENT 모드)

### 생성 방식

* **빈 셀에서 pointerDown + drag**
* 10분 단위 스냅
* 드래그 중: 임시 블록(preview) 표시, 좌/우 둥근 캡슐

### 드래그 중 UI

* 블록: 좌/우 round cap
* 상단 중앙 임시 캡슐에 시간 표시 (예: `06:10 – 06:40`, 10분 스냅)

### 드래그 종료(pointerUp)

* **아직 확정 아님** — 화면에 임시 블록 유지
* 상태 예시:

```ts
newEventDraft = {
  startMinute,
  endMinute,
  activityId,
  title: ""
}
```

* NEW_EVENT 패널에서: 이름 입력, 색/카테고리 변경, [저장] / [취소]

### 저장 규칙

* 저장해도 **PAINT로 자동 전환 금지**, NEW_EVENT 모드 유지
* 새 임시를 만들려면 기존 draft를 저장 또는 취소해야 함

---

## 4. 드래그로 생성된 블록의 모서리 규칙

| 상태            | 왼쪽  | 오른쪽 |
| --------------- | ----- | ------ |
| 단일 segment    | round | round  |
| 앞에 이어짐     | flat  | round  |
| 뒤에 이어짐     | round | flat   |
| 중간 segment    | flat  | flat   |

> 연속된 일정을 시각적으로 즉시 인지하기 위함

---

## 5. SELECT 모드 (선택 & 편집)

### 선택

* 일정(TimeBlock) 클릭 → SELECT 상태
* 선택된 블록에만 좌상단 앵커 + 상/하 리사이즈 핸들 표시

### 크기 변경 조건 (중요)

* **왼쪽 위 앵커를 먼저 눌러야 리사이즈 가능**
* hover/드래그만으로는 절대 변경되지 않음

### 리사이즈 로직

* 기본: 10분 단위 스냅, "딱딱 끊기는" 조정감
* 정밀 편집(Long Press): 핸들을 길게 누른 채 드래그 → 상단 캡슐에 분 단위 표시(`14분`, `23분` 등). 손을 떼면 캡슐 유지, 캡슐 클릭 시 그 분으로 확정, 미선택 시 가장 가까운 10분으로 스냅.

---

## 6. 지표 (Indicator) 로직

* INDICATOR 모드
* 셀 클릭 → 해당 10분 칸에 생성 (시간 시작 칸 기준)
* 시간 블록이 아님, row height 변경 없음, hover 시 상세 설명 가능

---

## 7. 체크리스트 로직

### 생성

* 별도 모드 없이 셀 long-press → 생성 (paint/new 상태에서 동일하게 동작)
* 기본 시간: start = 선택 셀, end = start + 10분

### 데이터 구조

```ts
ChecklistBlock {
  startMinute
  endMinute
  items: ChecklistItem[]
}

ChecklistItem {
  id
  text
  done
}
```

### 표시 규칙

* 제목 없음, 항목만 row 형태로 표시
* 시간 텍스트는 타임라인에 절대 표시하지 않음 (길이로만 표현)

### 체크 인터랙션

* 항목 클릭 → 체크박스 ✔ + 텍스트 취소선
* 다시 클릭 → 원복

### 레이아웃

* execute 위에 겹쳐서 표시
* 길어지면 내부 스크롤 또는 클릭 시 확장 뷰
* **row height를 절대 늘리지 않는다**

---

## 8. 현재시간 인디케이터

* 실시간 시계 연동, 1분 단위 갱신
* 전체 그리드를 가로지르는 세로선과 세로선이 끝나는 부분 뒤집힌 삼각형, 위에 현재 시각 텍스트


---

## 9. 절대 금지 목록

* hover로 생성/수정
* 체크리스트 텍스트 때문에 row 늘리기
* overlay가 execute를 밀어냄
* 드래그 후 자동 모드 전환
* 시간 문자열을 블록 내부에 표시
* scroll container 2개 이상

---

## 10. 한 줄 요약 (정체성)

> 이 앱은 "시간 위에 색을 칠하는 도구"가 아니라 **시간을 좌표로 삼아, 선택·편집·분석하는 기록 시스템**이다.

---

## 설치 및 실행

```bash
npm install
npm run dev
npm run build
```

## 기술 스택

- React 18 / TypeScript / Vite
- Tailwind CSS
- Lucide React (아이콘)
- Zustand (상태 관리)
- Immer (불변성 관리)

## 아키텍처 개선 사항 (v2)

### 1. 상태 관리
- **Zustand + Immer**: 전역 상태 관리 및 불변성 보장
- **Block 기반 데이터 구조**: Grid(Cell) 방식 제거, 시작/종료 시간 기반 Block 사용
- **자동 저장**: Debounce 처리로 1초 후 자동 저장

### 2. 컴포넌트 분리
- `App.tsx`: 메인 레이아웃 및 라우팅만 담당 (~250줄)
- `DayTimeline.tsx`: 일별 타임라인 뷰
- `WeekTimeline.tsx`: 주간 타임라인 뷰
- `useDragHandler.ts`: 드래그 로직 커스텀 훅
- `usePlannerStore.ts`: 전역 상태 관리 스토어

### 3. 데이터 구조
```typescript
// Block 기반 (Source of Truth)
interface Block {
  id: string;
  dateISO: string;
  startMin: number;  // 0-1440 (24시간 * 60분)
  endMin: number;
  activityId: string;
  layer: 'plan' | 'execute' | 'overlay';
  source: 'drag' | 'voice' | ...;
}

// 1분 단위 정밀 로직 제거
// 10분 단위 Cell 기반 로직 제거
```

### 4. 성능 최적화
- Deep clone 제거: Immer 사용으로 효율적인 불변성 관리
- 메모이제이션: useMemo로 불필요한 재계산 방지
- 컴포넌트 분리: 변경사항 격리 및 최적화 용이

---

# Digital Life Log Planner v2 — Engineering Spec & Reconstruction Report

버전: v2 MVP (Scope Locked)

목적:

* 기존에 만들고 있던 Digital Life Log Planner를 **동일한 UX/데이터 구조**로 재구현할 수 있도록, 상태·이벤트·데이터 스키마·레이아웃·색상까지 모두 명세한다.
* 특히 **ADHD 실행 지연(Execution Delay)**을 분석 가능한 형태로 수집하는 것을 1차 목표로 한다.

---

## 0. 제품 개요

### 0.1 앱 목적

* 하루를 **10분 단위 그리드**로 쪼개서:
  * 계획(Plan)
  * 실제 실행(Execute)
  * 중첩/겹침(Overlay)
    를 기록한다.
* 단순 일정 관리가 아니라, 아래를 정량화하는 **연구/자기 분석 도구**:
  * 계획 vs 실행의 차이 (Start Delay, Completion Ratio)
  * “몇 분 더” 연장 패턴
  * 저항도(하기 싫음) / 에너지 레벨과의 상관관계
  * 이탈(Displacement: 원래 할 일 대신 다른 Activity 수행)

### 0.2 대상 사용자

* ADHD 경향 또는 실행 지연이 심한 사람
* 자기 시간을 “숫자로 보고 싶은” 데이터 성향 사용자
* 데이터 사이언스 도구(R, Python)로 로그를 분석해 보고 싶은 사용자

---

## 1. UI 레이아웃 & 스타일 (픽셀/색상 고정 규격)

### 1.1 전체 레이아웃 (3단 구조)

* **왼쪽 사이드바 (LeftSidebar)**
  * 고정 폭: `w-20` (약 80px)
  * 내용:
    * Tool 선택
    * Undo/Redo
    * Activity 카테고리 리스트 및 추가 버튼
* **중앙 메인 (Timeline)**
  * Day / Week 탭 전환
  * Day: 세로 스크롤, 시간(Y축) / 10분 단위(X축)
  * Week: 가로 스크롤, 요일(X축) / 시간(Y축)
* **오른쪽 사이드바 (ChecklistPanel)**
  * 토글 패널, 기본 숨김
  * 폭: `w-72` (약 288px)
  * 내용:
    * 체크리스트 리스트
    * 항목 추가
    * 오늘의 요약(“오늘 업무 3.5h, 공부 2h” 같은 추후 확장용)

### 1.2 타이포그래피 & 컴포넌트

* 폰트: 시스템 산세리프 (예: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", ...`)
* UI 라이브러리:
  * shadcn/ui 기반 (Button, Dialog, Input, Dropdown 등)
  * 아이콘: `lucide-react`
* 기본 스타일:
  * 둥근 모서리: `rounded-sm` ~ `rounded-md`
  * 선 두께: `border`(1px)를 기본, 필요 시 `border-[0.5px]`로 약하게

### 1.3 색상 시스템 (OKLCH + HEX)

#### 베이스 컬러 (테마)

* 배경(라이트): `oklch(0.98 0 0)`
* 배경(다크): `oklch(0.10 0 0)`
* 전경(텍스트 라이트): `oklch(0.15 0 0)`
* 전경(텍스트 다크): `oklch(0.95 0 0)`
* Primary:
  * Light: `oklch(0.55 0.20 280)` (보라 계열)
  * Dark:  `oklch(0.55 0.15 220)` (푸른 보라 계열)
* Secondary:
  * Light: `oklch(0.95 0 0)`
  * Dark:  `oklch(0.18 0 0)`
* Border:
  * Light: `oklch(0.90 0 0)`
  * Dark:  `oklch(0.22 0 0)`
* Destructive:
  * Light: `oklch(0.58 0.25 27)`
  * Dark:  `oklch(0.50 0.20 25)`

#### Activity Color 팔레트 (고정 HEX)

* 업무: `#F2A0B3`
* 휴식: `#7FE5A0`
* 취미: `#7FB5E5`
* 건강: `#E5D17F`
* 이동: `#B57FE5`
* 수면: `#4ADE80`
* 식사: `#FBBF24`
* 사용자 지정 기본: `#6B7280`
  → 사용자 정의 색상은 **기본적으로 이 팔레트 내 선택**으로 제한 (MVP 기준)

---

## 2. 시간 그리드 & 레이아웃 디테일

### 2.1 Day View 그리드

* 세로 방향(Y축): 시간 24개 row (00–23)
  * 한 row(1시간)의 높이: **80px** (고정)
  * 좌측에 `"00", "01", ... "23"` 텍스트 표시
* 가로 방향(X축): 10분 단위 6컬럼
  * `col = 0..5`
    * 0 → :00–:10
    * 1 → :10–:20
    * ...
    * 5 → :50–:60
  * hour row 내부에 세로 바(bar)로 구분 (`border-l`)

**Cell 정의:**

```ts
type CellId = string; // "2026-01-15|06|3" 형식

type Cell = {
  execute?: ActivityId;
  overlay?: ActivityId;
  indicator?: {
    timeText: string; // "08:30"
    label: string;
  };
  memos?: MemoItem[];
};

type DayGrid = Record<CellId, Cell>;
```

### 2.2 현재 시간 세로선(Time Indicator)

* 표시 조건: `dateISO === today`
* 위치:
  * 각 시간 row 안에서, 현재 시간 `nowMin`에 대응하는 **해당 row의 x 위치**에 세로선
  * 세로선은 각 row 내부만 연결 (하루 전체 관통 금지)
* 업데이트:
  * 1분 주기 `setInterval`
  * `nowMin` 재계산 후 row(y) + col/offset(x) 재계산

---

## 3. 툴 & 인터랙션 상태기계

### 3.1 Tool 종류 (v2 기준)

```ts
export type Tool =
  | "execute"      // 기본 페인트 (실행)
  | "erase"        // 지우개
  | "indicator"    // 지표(Flag)
  | "new"          // 신규 계획(임시 프리셋)
  | "select"       // 블록 선택/리사이즈 (로드맵)
  | "memo";        // 메모 입력
```

### 3.2 Tool 우선순위 (충돌 방지 규칙)

1. indicator 활성 시 → 클릭은 무조건 indicator 다이얼로그
2. new 활성 시 → 클릭/롱프레스는 신규 계획 생성 플로우
3. memo 활성 시 → 클릭은 메모 입력 팝업
4. erase 활성 시 → 드래그는 삭제
5. 기본 → execute / overlay 페인트

### 3.3 포인터 이벤트 공통 규칙

* hover만으로 paint 금지 (`e.buttons & 1` 확인)
* `setPointerCapture` 금지 (pointerenter 끊김 방지)
* pointerdown:
  * drag 시작
  * long-press 타이머 시작 (checklist용)
  * **Undo 스냅샷 1회 push**

### 3.4 DragState (DAY 기준)

```ts
type DragMode = "paint" | "erase" | null;

type DragState = {
  mode: DragMode;
  dateISO: string;
  startHour: number;
  brush: ActivityId;
  tool: Tool;
  activeCells: Set<CellId>;
  pointerId: number;
  isDown: boolean;
  pendingStartCell?: CellId;
};
```

#### pointerdown(cell)

1. `pushSnapshot()` (Undo)
2. `pendingStartCell = cellId`, `isDown = true`
3. Tool 분기:
   * indicator → 다이얼로그
   * new → 신규 계획 다이얼로그(armed drag)
   * execute/erase → drag 준비 (페인트는 보류)
4. long-press 타이머 시작 (450ms)

#### pointerenter(cell)

* `isDown && (e.buttons & 1)`가 아니면 drag 종료
* long-press 타이머 해제
* 최초 이동 시 `pendingStartCell`에 대해 1회 paint/erase
* 이후 `activeCells`에 없으면 paint/erase

#### pointerup / cancel

* long-press 타이머 해제
* drag 종료, 상태 초기화

### 3.5 Long-Press & Checklist Block 생성

* 조건: pointerdown 후 450ms 이상, 이동 < 6px
* 성공 시: paint/erase 없이 체크리스트 블록 다이얼로그 오픈, start/end 10분 스냅
* 별도 checklist tool 없음 — execute/new 상태에서도 롱프레스로 동일 동작

---

## 4. 페인트 로직 (Execute/Overlay/Erase)

### 4.1 Execute / Overlay 규칙

```ts
function paintCell(cell: Cell, brush: ActivityId): Cell {
  if (!cell.execute) {
    cell.execute = brush;
  } else if (cell.execute !== brush) {
    cell.overlay = brush;
  }
  return cell;
}
```

### 4.2 Erase 규칙

```ts
function eraseCell(cell: Cell): Cell | null {
  delete cell.execute;
  delete cell.overlay;
  delete cell.indicator;
  if (!cell.execute && !cell.overlay && !cell.indicator && !cell.memos?.length) {
    return null; // sparse
  }
  return cell;
}
```

---

## 5. Segment 렌더링 규칙 (셀 → 병합 블록)

```ts
type Segment = {
  row: number;       // hour 0–23
  startCol: number;  // 0–5
  endCol: number;    // 0–5
  layer: "execute" | "overlay";
  activityId: ActivityId;
};
```

* 병합 조건: 동일 row, 인접 col, 동일 layer, 동일 activityId
* 라운딩: 시작 셀 left round, 끝 셀 right round, 중간 flat
* Overlay: 얇은 바, 하단 gap 2~6px, execute 높이 침범 금지

---

## 6. Checklist / Indicator / Memo

### 6.1 Checklist Panel (우측)

```ts
type ChecklistItem = {
  id: string;
  text: string;
  time?: string;
  done: boolean;
  createdAt: number;
  updatedAt: number;
};
```

* 입력: 텍스트 + 시간(optional) + 추가
* 항목: 체크박스, 텍스트, 시간(있으면), 삭제 버튼(hover 시)
* 완료: 취소선

### 6.2 Timeline ChecklistBlock (long-press)

```ts
type ChecklistBlock = {
  id: string;
  dateISO: string;
  startMin: number;
  endMin: number;
  layer: Layer;
  activityId?: ActivityId;
  items: { id: string; text: string; done: boolean }[];
  createdAt: number;
  updatedAt: number;
};
```

* 시간/제목 표시 없음, 항목 리스트만
* 좌상단 소형 캡슐로 항목 수 표시 가능
* row height를 체크리스트 때문에 늘리지 않는다 (겹쳐서 표시)

### 6.3 Indicator

```ts
type IndicatorEvent = {
  id: string;
  dateISO: string;
  atMin: number;
  label: string;
  timeText?: string;
  createdAt: number;
};
```

* indicator 모드에서 셀 클릭 → 라벨/시간 입력
* 주황 태그로 표시, X로 삭제

### 6.4 Memo

```ts
type MemoItem = {
  id: string;
  text: string;
  createdAt: number;
  updatedAt: number;
};

type MemosByCell = Record<CellId, MemoItem[]>;
```

* memo 모드에서 셀 터치 → 메모 팝업
* 저장 시 memos 배열 추가, 셀 우상단 네모 아이콘 노출
* 기본 표시: 최신 1건, “…”로 전체 보기

---

## 7. v2 데이터 스키마 (PersistedStateV2)

핵심 원칙: Block이 1급 엔티티, Cell/Segment는 입력·렌더링용.

### 7.1 핵심 타입

```ts
export type ActivityId = string;
export type BlockId = string;
export type WeekKey = string;
export type Layer = "plan" | "execute" | "overlay";
export type BlockSource = "manual" | "week_plan" | "fixed_schedule" | "template_apply" | "import" | "voice";
export type PaintStyle = "solid" | "diagonal" | "cross" | "line" | "extension";
export type ResistanceLevel = 1 | 2 | 3 | 4 | 5;
export type EnergyLevel = 1 | 2 | 3 | 4 | 5;
```

### 7.2 Activity

```ts
type Activity = { id: ActivityId; name: string; color: string; isSystem?: boolean };
```

### 7.3 Block (계획/실행/중첩)

```ts
type PlanResistance = { level: ResistanceLevel; iconId: string };
type BlockPlanRef = { planBlockId: BlockId; matchRule: "timeOverlap" | "autoNearest" | "userPinned"; matchScore?: number };

type Block = {
  id: BlockId;
  dateISO: string;
  startMin: number;
  endMin: number;
  activityId: ActivityId;
  layer: Layer;
  source: BlockSource;
  paintStyle?: PaintStyle;
  planRef?: BlockPlanRef;
  resistance?: PlanResistance;
  extension?: { baseEndMin?: number; extendedByMin: number };
  createdAt: number;
  updatedAt: number;
};
``

### 7.5 DailyState / CompletionEvent

```ts
type DailyState = { dateISO: string; energyLevel?: EnergyLevel; note?: string; recordedAt: number };
type CompletionEvent = {
  id: string;
  dateISO: string;
  blockId: BlockId;
  atMin: number;
  perceivedDone: boolean;
  extraMinRequested?: number;
  energyLevel?: EnergyLevel;
  shortNote?: string;
  createdAt: number;
};
```

### 7.6 VoiceCommandLog

```ts
type VoiceParseField = "start" | "end" | "activity" | "date";
type VoiceParseCandidate = { startMin?: number; endMin?: number; activityName?: string; dateISO?: string; confidence?: number };
type VoiceCommandLog = {
  id: string;
  createdAt: number;
  transcript: string;
  asrConfidence?: number;
  parse: { candidate: VoiceParseCandidate; missingFields: VoiceParseField[]; warnings?: string[] };
  confirmation: {
    status: "confirmed" | "edited" | "canceled";
    final?: { dateISO: string; startMin: number; endMin: number; activityName: string };
  };
  createdPlanBlockId?: BlockId;
};
```

### 7.7 PersistedStateV2

```ts
type PersistedStateV2 = {
  schemaVersion: 2;
  activities: Activity[];
  blocksByDate: Record<string, Block[]>;
  weekPlans: Record<string, WeekPlan>;
  fixedSchedules: FixedSchedule[];
  templateAppliesByDate: Record<string, any[]>;
  dailyStateByDate: Record<string, DailyState>;
  completionEventsByDate: Record<string, CompletionEvent[]>;
  indicatorsByDate: Record<string, IndicatorEvent[]>;
  checklistByDate: Record<string, ChecklistItem[]>;
  checklistBlocksByDate: Record<string, ChecklistBlock[]>;
  memosByDate: Record<string, MemosByCell>;
  voiceCommandLogsByDate: Record<string, VoiceCommandLog[]>;
  startHour: number;
  theme: "light" | "dark";
};
```

---

## 8. Export 스펙 (ADHD 실행 지연 분석용)

### 8.1 Blocks Export

* 필수: dateISO, startMin, endMin, activityId, layer, source
* 옵션: resistance.level, extension.extendedByMin

### 8.2 PlanExecutionPair (Derived Table)

```ts
type PlanExecutionPair = {
  id: string;
  dateISO: string;
  planBlockId: BlockId;
  execBlockId?: BlockId;
  planStartMin: number;
  execStartMin?: number;
  startDelayMin?: number;
  plannedMin: number;
  executedMin: number;
  completionRatio: number;
  planResistanceLevel?: ResistanceLevel;
  dailyEnergyLevel?: EnergyLevel;
  energyAtCompletion?: EnergyLevel;
  extensionMin?: number;
  displacedByActivityId?: ActivityId;
  displacedMin?: number;
  match: { rule: "autoNearest" | "timeOverlap" | "userPinned"; score: number };
};
```

---

## 9. v2 MVP Scope

### 9.1 반드시 포함

* Block v2 기반 저장
* Drag paint / Erase / Long-press Checklist / Indicator / Memo
* Execute 1분 정밀 조정 + 캡슐 확정(누르면 분 단위, 안 누르면 10분 스냅)
* Voice Planning (제한된 규칙 기반 + 확인 필수)
* Resistance / Energy 입력
* CompletionEvent + extension 처리
* WeekPlan + Day Ghost Preview
* CSV Export (Blocks & PlanExecutionPair)

### 9.2 Post-MVP (의도적 제외)

* 앱 내부 통계/그래프 대시보드
* 외부 캘린더 연동
* 푸시 알림
* 완전 자유 자연어 음성 파서
* 무제한 커스텀 색상
* 모바일 전용 제스처 최적화

---

## 10. 구현 순서 제안

1) 데이터 레이어 (Block/PersistedStateV2, storage)
2) Day View 드로잉 (Cell 스냅→Segment 병합→렌더)
3) Drag / Erase / Undo/Redo 안정화
4) Checklist / Indicator / Memo UI
5) CompletionEvent + “몇 분 더”
6) Voice Planning
7) Week View + Ghost
8) Export (CSV)
---

## APPENDIX B — Voice Planning UX 규격 (요약)

### 플로우

1. **마이크 버튼** → 음성 입력
2. **transcript 파싱** → 후보 생성
3. **확인 모달**:
   ```
   "오늘 15:00–16:00 전공 공부로 등록?"
   
   [확인] [수정] [취소]
   ```
4. **confirmed/edited**이면:
   * `Block(plan, source=voice)` 생성
   * `VoiceCommandLog`에 `status` + `createdPlanBlockId` 기록

### 데이터 흐름

* 음성 → ASR → transcript
* transcript → 파서 → `VoiceParseCandidate` (startMin, endMin, activityName, dateISO)
* 사용자 확인 → `VoiceCommandLog.confirmation.status` 업데이트
* confirmed → `blocksByDate`에 Block 추가