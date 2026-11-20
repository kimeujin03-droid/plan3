import { addDays, dayStart, MIN, weekStart } from './time';
import type { Activity } from './types';

export type Command =
  | { type: 'start'; name: string; activityId: string | null; at?: number }
  | { type: 'end'; activityId: string | null }
  /**
   * 계획·할 일에 넣기. due는 그날 0시(없으면 null).
   * start와 end가 있으면 "몇 시~몇 시", start만 있으면 "몇 시에".
   */
  | { type: 'todo'; text: string; due: number | null; start?: number; end?: number; activityId?: string | null; deadline?: boolean; dueAt?: number; place?: string; minutes?: number }
  /** 반복 일정: 요일 0(일)~6(토), 하루 안의 분 */
  | { type: 'series'; text: string; days: number[]; startMin: number; endMin: number | null; activityId: string | null; place?: string }
  | { type: 'backfill'; name: string; activityId: string | null; start: number; end: number }
  | { type: 'sleep' }
  | { type: 'wake' }
  | { type: 'focus'; value: number }
  | { type: 'fatigue'; value: number }
  | { type: 'mood'; text: string }
  | { type: 'quiet' }
  | { type: 'memo'; text: string }
  /** AI가 기록할 것 없이 짧게 대꾸만 할 때. 규칙 해석에서는 나오지 않는다. */
  | { type: 'chat'; text: string };

const FILLER = /^(모아야|모아|지금부터|이제부터|나|지금|이제|그럼|아까|오늘|방금)[\s,]*/;
const CALL = /^(모아야|모아|나는|나|난)[\s,]+/;

function clean(s: string): string {
  let out = s.trim().replace(/[.!~…]+$/g, '').trim();
  let prev = '';
  while (prev !== out) {
    prev = out;
    out = out.replace(FILLER, '').trim();
  }
  return out.replace(/(을|를|은|는|이|가|도|좀|부터)$/, '').trim();
}

/** 문장 안에 이름이 들어 있는 활동 중 가장 긴 이름을 고른다. */
export function matchActivity(text: string, activities: Activity[]): Activity | null {
  let best: Activity | null = null;
  for (const a of activities) {
    if (a.name && text.includes(a.name) && (!best || a.name.length > best.name.length)) best = a;
  }
  return best;
}

/* ───── 시각 ───── */

// (오전|오후…)? N시 (M분|반)?  → 묶음 4개: 때, 시, 분, 반
const CLOCK = String.raw`(오전|오후|아침|낮|점심|저녁|밤|새벽)?\s*(\d{1,2})\s*시(?!간)\s*(?:(\d{1,2})\s*분|(반))?`;
const RANGE = new RegExp(`${CLOCK}\\s*(?:부터|에서|~|-)\\s*${CLOCK}\\s*(?:까지)?\\s*(.*)$`);
const POINT = new RegExp(`${CLOCK}\\s*(?:쯤에|쯤|에)?\\s*(.*)$`);
const HOURS = /(\d+(?:\.\d+)?)\s*시간(?:\s*(\d{1,2})\s*분)?(?:\s*(?:정도|쯤|동안|씩|만))?/;

/** 하루 안의 분으로. guessPm: 때를 말하지 않은 1~6시를 오후로 본다(앞날 계획에서는 새벽 약속이 드물다). */
function minutesOf(mer: string | undefined, h: string, m: string | undefined, half: string | undefined, guessPm: boolean): number {
  let hour = Number(h);
  if (mer === '밤' && hour === 12) hour = 24;
  if (mer && /오후|저녁|밤|낮|점심/.test(mer) && hour < 12 && !(mer === '밤' && hour <= 4)) hour += 12;
  else if (mer && /오전|아침|새벽/.test(mer) && hour === 12) hour = 0;
  else if (!mer && guessPm && hour >= 1 && hour <= 6) hour += 12;
  return hour * 60 + (half ? 30 : Number(m ?? 0));
}

interface Span {
  start: number;
  end: number | null;
  rest: string;
}

/** "오후 8시부터 10시까지 공부" → 20:00~22:00 + "공부". 끝 시각의 오전·오후는 시작을 따라간다. */
function readSpan(text: string, guessPm: boolean): Span | null {
  const r = text.match(RANGE);
  if (r) {
    const start = minutesOf(r[1], r[2], r[3], r[4], guessPm);
    let end = minutesOf(r[5] ?? (Number(r[6]) <= 12 && start >= 12 * 60 ? '오후' : undefined), r[6], r[7], r[8], false);
    if (end <= start && end + 12 * 60 <= 24 * 60) end += 12 * 60;
    // 시각 앞에 있던 말("알바가 9시부터…")도 이름의 일부다.
    if (end > start) return { start, end, rest: `${text.slice(0, r.index)} ${r[9]}`.trim() };
  }
  const p = text.match(POINT);
  if (p) return { start: minutesOf(p[1], p[2], p[3], p[4], guessPm), end: null, rest: `${text.slice(0, p.index)} ${p[5]}` };
  return null;
}

/* ───── 날짜 ───── */

const DOW = '일월화수목금토';
const DAYWORD = /(오늘|내일|모레|글피|(?:(이번|다음)\s*주\s*)?([일월화수목금토])요일|(\d{1,2})\s*월\s*(\d{1,2})\s*일|(\d{1,2})\s*일)(?:날)?\s*(까지\s*(?:인|는|가|로)?)?\s*(?:은|는|에는|에|엔)?\s*/;

/** 날짜를 가리키는 말을 그날 0시로 바꾼다. today는 "지금이 속한 하루"의 0시. 이미 지난 날짜는 다음 달·다음 해로 본다. */
function resolveDay(m: RegExpMatchArray, today: number): number {
  const word = m[1];
  if (word === '오늘') return today;
  if (word === '내일') return addDays(today, 1);
  if (word === '모레') return addDays(today, 2);
  if (word === '글피') return addDays(today, 3);
  const d = new Date(today);
  if (m[3]) {
    const index = (DOW.indexOf(m[3]) + 6) % 7; // 월요일이 0
    if (m[2] === '다음') return addDays(weekStart(today), 7 + index);
    const thisWeek = addDays(weekStart(today), index);
    return thisWeek >= today ? thisWeek : addDays(thisWeek, 7);
  }
  if (m[4] && m[5]) {
    const t = new Date(d.getFullYear(), Number(m[4]) - 1, Number(m[5])).getTime();
    return t >= today ? t : new Date(d.getFullYear() + 1, Number(m[4]) - 1, Number(m[5])).getTime();
  }
  const t = new Date(d.getFullYear(), d.getMonth(), Number(m[6])).getTime();
  return t >= today ? t : new Date(d.getFullYear(), d.getMonth() + 1, Number(m[6])).getTime();
}

const PAST = /(했어|했음|했다|했지|했네|갔어|갔다|봤어|먹었|였어|었어|았어)/;
const FUTURE = /(거야|거여|거임|ㄹ게|할게|할래|할까|볼까|볼게|려고|예정|할\s*듯|해야|갈게|가야|있어|있음|있다|약속|마감|까지|감$|가$|함$|하자|한다고|할\s*거|할거)/;

/** 계획 문장의 꼬리("할 거야", "해야지", "가 있어")를 떼고 이름만 남긴다. */
const JONG_RIEUL = 8;
/** "일어날거여" → "일어나기", "먹을 거야" → "먹기", "가려고" → "가기": 앞날을 말하는 어미를 떼고 명사형으로. */
function verbToNoun(s: string): string {
  const m = s.match(/([가-힣])\s*(거예요|거야|거여|거임|거|게요|게|래요|래|까요|까|려고|예정이야|예정)$/);
  if (!m) return s;
  const head = s.slice(0, m.index);
  const ch = m[1];
  if (m[2] === '려고') return `${head}${ch}기`;
  if (ch === '을') return `${head}기`;
  const code = ch.charCodeAt(0) - 0xac00;
  if (code >= 0 && code % 28 === JONG_RIEUL) return `${head}${String.fromCharCode(ch.charCodeAt(0) - JONG_RIEUL)}기`;
  return s;
}

function planText(s: string): string {
  let out = s
    .trim()
    .replace(/[.!~…?]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*(을|를)?\s*(해\s*볼까|해\s*볼게|해\s*보려고|해\s*볼래|하려고|할까|할까봐)$/, '');
  out = verbToNoun(out)
    .replace(/\s*(이|가)?\s*(있어요?|있음|있다)$/, '')
    .replace(/\s*(을|를)?\s*(할\s*거라고|할\s*거야|할\s*거임|할\s*거|할게|할래|할\s*예정이야|할\s*예정|할\s*듯|해야지|해야\s*하는데|해야\s*되는데|해야\s*돼|해야\s*해|해야\s*함|해야겠다|하자|한다고|하기|제출|내기|함)$/, '')
    .replace(/에\s*(감|갈\s*거야|갈게|가야\s*해|가야\s*돼|가야지|가)$/, '에 가기')
    .replace(/\s*(갈\s*거야|갈게|가야\s*해|가야\s*돼|가야지)$/, ' 가기')
    .replace(/(\S)\s*하기$/, '$1')
    .trim();
  out = out.replace(CALL, '').replace(/(을|를|은|는|이|가|도)$/, '').trim();
  return out;
}

/**
 * 앞날의 일: "내일 오후 8시부터 10시까지 공부할 거야", "금요일까지인 과제가 있어", "내일은 2시간 공부".
 * 날짜를 가리키는 말이 있고, 지난 일을 말하는 게 아닐 때만 계획으로 본다.
 */
function parsePlanBare(t: string, activities: Activity[], today: number): Command | null {
  const body = t.replace(CALL, '');
  const dm = body.match(DAYWORD);
  if (!dm) return null;
  const day = resolveDay(dm, today);
  const deadline = !!dm[7];
  if (!deadline && (PAST.test(body) || (day <= today && !FUTURE.test(body)))) return null;
  const rest = `${body.slice(0, dm.index)} ${body.slice(dm.index! + dm[0].length)}`.trim();

  // 마감 시각까지 정한 마감: "금요일 6시까지 제출", "금요일까지 오후 6시에 제출". "3시부터 5시까지"는 마감이 아니다.
  if (!RANGE.test(rest)) {
    const clock = rest.match(new RegExp(deadline ? `${CLOCK}\\s*(?:까지|에)?` : `${CLOCK}\\s*까지`));
    if (clock) {
      const text = planText(`${rest.slice(0, clock.index)} ${rest.slice(clock.index! + clock[0].length)}`);
      const dueAt = day + minutesOf(clock[1], clock[2], clock[3], clock[4], true) * MIN;
      return text ? { type: 'todo', text, due: day, deadline: true, dueAt } : null;
    }
  }
  if (deadline) {
    const text = planText(rest);
    return text ? { type: 'todo', text, due: day, deadline: true } : null;
  }
  const span = readSpan(rest, true);
  if (span) {
    const text = planText(span.rest);
    if (!text) return null;
    const activityId = matchActivity(text, activities)?.id ?? null;
    const start = day + span.start * MIN;
    return span.end === null ? { type: 'todo', text, due: day, start, activityId } : { type: 'todo', text, due: day, start, end: day + span.end * MIN, activityId };
  }
  const hours = rest.match(HOURS);
  if (hours) {
    const what = planText(`${rest.slice(0, hours.index)} ${rest.slice(hours.index! + hours[0].length)}`);
    const amount = `${hours[1]}시간${hours[2] ? ` ${hours[2]}분` : ''}`;
    return what ? { type: 'todo', text: `${what} ${amount}`, due: day, activityId: matchActivity(what, activities)?.id ?? null } : null;
  }
  // 시각도 기한도 없으면, 앞으로 하겠다는 말일 때만 계획으로 본다.
  const text = FUTURE.test(body) ? planText(rest) : '';
  return text ? { type: 'todo', text, due: day } : null;
}

/** "다이소에서 장보기" → 장소 "다이소", "학교 가기" → "학교". 장소를 못 찾으면 그대로. */
export function splitPlace(text: string): { text: string; place?: string } {
  const at = text.match(/^(.*?)(\S{1,12})에서\s*(.+)$/);
  if (at && at[3].trim()) return { text: `${at[1]}${at[3]}`.trim(), place: at[2] };
  const go = text.match(/^(.*?)(\S{1,12}?)(?:에)?\s*가기$/);
  if (go && go[2] && !/^(같이|빨리|먼저|일찍|놀러)$/.test(go[2])) return { text: text, place: go[2].replace(/(에|으로|로)$/, '') };
  return { text };
}

function parsePlan(t: string, activities: Activity[], today: number): Command | null {
  const cmd = parsePlanBare(t, activities, today);
  if (!cmd || cmd.type !== 'todo') return cmd;
  const { text, place } = splitPlace(cmd.text);
  if (!place || !text) return cmd;
  return { ...cmd, text, place, ...(cmd.activityId === undefined ? {} : { activityId: matchActivity(text, activities)?.id ?? cmd.activityId }) };
}

/**
 * 반복: "매주 화목 9시부터 12시까지 수업", "평일 9시~6시 알바", "매일 7시에 기상", "매일 2시간 공부".
 * 시각이 있으면 반복 일정, 시간 양만 있으면 매일 목표.
 */
function parseRepeat(t: string, activities: Activity[]): Command | null {
  const m = t.replace(CALL, '').match(/^(매일|평일|주말|매주\s*((?:[일월화수목금토](?:요일)?[\s,·/와과랑]*)+))\s*(.*)$/);
  if (!m) return null;
  let days: number[];
  if (m[1] === '매일') days = [0, 1, 2, 3, 4, 5, 6];
  else if (m[1] === '평일') days = [1, 2, 3, 4, 5];
  else if (m[1] === '주말') days = [0, 6];
  else days = [...new Set([...m[2].replace(/요일/g, '')].filter((c) => DOW.includes(c)).map((c) => DOW.indexOf(c)))].sort();
  if (!days.length) return null;
  const rest = m[3];
  const span = readSpan(rest, true);
  if (span) {
    const named = splitPlace(planText(span.rest));
    if (!named.text) return null;
    return {
      type: 'series',
      text: named.text,
      days,
      startMin: span.start,
      endMin: span.end,
      activityId: matchActivity(named.text, activities)?.id ?? null,
      ...(named.place ? { place: named.place } : {}),
    };
  }
  const hours = rest.match(HOURS);
  if (hours && m[1] === '매일') {
    const what = planText(`${rest.slice(0, hours.index)} ${rest.slice(hours.index! + hours[0].length)}`);
    const minutes = Math.round((Number(hours[1]) * 60 + Number(hours[2] ?? 0)));
    const act = matchActivity(what, activities);
    if (what && minutes > 0) return { type: 'todo', text: `${what} 매일 ${hours[1]}시간${hours[2] ? ` ${hours[2]}분` : ''}`, due: null, minutes, activityId: act?.id ?? null };
  }
  return null;
}

const INTENT = /(.*?)\s*(해야지|해야\s*하는데|해야\s*되는데|해야\s*돼|해야\s*해|해야겠다|써야지|써야\s*하는데|써야\s*되는데|써야\s*돼|써야겠다)/;
const MOOD = /(하기\s*싫|귀찮|피곤|힘들|졸려|기분이?\s*(아냐|아니|별로))/;
const END = /(끝났|끝냈|끝낼|끝!|끝$|그만|다\s*했|마쳤|종료)/;
const START = /(.*?)\s*(시작|할게|할래|한다|하러|해볼게|하는\s*중)/;

/**
 * 한 문장을 기록 명령으로 바꾼다.
 * today는 "지금이 속한 하루"의 0시: 자기 전의 새벽은 아직 전날이므로 달력 날짜와 다를 수 있다.
 */
export function parse(text: string, activities: Activity[], now: number, today: number = dayStart(now)): Command[] {
  const t = text.trim();
  if (!t) return [];

  if (/(말\s*걸지\s*마|조용히)/.test(t)) return [{ type: 'quiet' }];

  const focus = t.match(/집중도?\s*(\d)/);
  if (focus) return [{ type: 'focus', value: Math.min(5, Math.max(1, Number(focus[1]))) }];
  const fatigue = t.match(/피로도?\s*(\d{1,3})/);
  if (fatigue) return [{ type: 'fatigue', value: Math.min(100, Number(fatigue[1])) }];

  const repeat = parseRepeat(t, activities);
  if (repeat) return [repeat];

  const plan = parsePlan(t, activities, today);
  if (plan) return [plan];

  if (/(잘게|자러|잔다|잘래)/.test(t)) return [{ type: 'sleep' }];
  if (/(일어났|일어남|기상)/.test(t)) return [{ type: 'wake' }];

  // 지난 시간 채우기: "9시부터 10시 반까지 공부했어". 달력의 오늘 기준.
  const body = t.replace(CALL, '').replace(/^오늘\s*/, '');
  const r = body.match(RANGE);
  // "내일 …부터 …까지"는 지난 기록이 아니다. 계획으로 못 읽었으면 아래(메모)로 보낸다.
  if (r && !/(내일|모레|글피|다음\s*주|요일)/.test(body)) {
    const span = readSpan(body, false);
    const rest = span ? clean(span.rest.replace(/\s*(했어|했음|함|했다|했지|갔어|봤어|였어|이었어|였음|이야)$/, '')) : '';
    if (span && span.end !== null && rest) {
      const base = dayStart(now);
      return [{ type: 'backfill', name: rest, activityId: matchActivity(rest, activities)?.id ?? null, start: base + span.start * MIN, end: base + span.end * MIN }];
    }
  }

  const out: Command[] = [];
  const intent = t.match(INTENT);
  if (intent) {
    // "논문 써야지"는 시작이 아니라 할 일이다.
    const label = clean(intent[1]);
    if (label) out.push({ type: 'todo', text: /^써/.test(intent[2]) ? `${label} 쓰기` : label, due: null });
  }
  if (MOOD.test(t)) out.push({ type: 'mood', text: t });
  if (out.length) return out;

  if (END.test(t)) return [{ type: 'end', activityId: matchActivity(t, activities)?.id ?? null }];

  // "공부 3시간 하자", "통계 3시간 한다고": 양을 정해 앞으로 하겠다는 말은 지금 시작이 아니라 오늘 계획이다.
  const amount = t.match(HOURS);
  if (amount && /(하자|한다고|할\s*거|할거|할게|할래|해야|하려고|해볼|해\s*볼)/.test(t)) {
    const what = planText(`${t.slice(0, amount.index)} ${t.slice(amount.index! + amount[0].length)}`.replace(CALL, '').replace(/^\s*(오늘|이제|지금)\s*/, '').replace(/(^|\s)한\s+/, ' '));
    const hrs = `${amount[1]}시간${amount[2] ? ` ${amount[2]}분` : ''}`;
    if (what) return [{ type: 'todo', text: `${what} ${hrs}`, due: today, activityId: matchActivity(what, activities)?.id ?? null }];
  }

  const start = t.match(START);
  if (start) {
    const name = clean(start[1]);
    if (name) return [{ type: 'start', name, activityId: matchActivity(name, activities)?.id ?? null }];
  }

  return [{ type: 'memo', text: t }];
}

/** 날짜·시각을 말하는 문장인지. 이런 문장은 AI가 더 잘 읽는다. */
export function mentionsTime(text: string): boolean {
  return /\d|오늘|내일|모레|글피|요일|주말|다음\s*주|이번\s*주|까지|아침|저녁|밤|새벽|오전|오후/.test(text);
}

/** "내일", "금요일", "다음 주 화요일", "11월 20일" 같은 말 하나를 그날 0시로. 못 읽으면 null. */
export function resolveDayWord(word: string, today: number): number | null {
  const w = word.trim();
  if (!w) return null;
  const m = w.match(DAYWORD);
  if (!m || m.index !== 0) return null;
  return resolveDay(m, today);
}
