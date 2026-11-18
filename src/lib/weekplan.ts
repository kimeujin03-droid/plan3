import type { Activity, Focus, Interval, Todo } from './types';
import { DAY, HOUR, MIN, addDays, dayStart } from './time';
import { matchActivity } from './parser';

/**
 * 한 주 짜기.
 * AI는 긴 글에서 할 일과 조건만 뽑는다(WeekTask). 빈 시간을 찾아 나눠 넣는 일은 이 파일이 한다:
 * 시간 계산을 모델에 맡기면 틀리기 쉽고, 같은 입력엔 같은 결과가 나와야 고치기 쉽다.
 */

export interface WeekTask {
  text: string;
  /** 이번 주 전체(분). 0이면 시간을 따로 안 잡는 자잘한 일 */
  minutes: number;
  /** 한 번에 할 시간(분). 0이면 앱이 정한다 */
  chunk: number;
  /** 꼭 그날(YYYY-MM-DD) */
  on?: string;
  /** 그날까지 */
  due?: string;
  /** 이 낱말이 든 일정이 끝난 뒤마다 한 번씩 */
  after?: string;
  activity?: string;
  place?: string;
}

export interface WeekEvent {
  text: string;
  date: string;
  start: string;
  end?: string;
  place?: string;
}

/** 매주 반복(시간표) */
export interface WeekFixed {
  text: string;
  days: number[];
  start: string;
  end?: string;
  from?: string;
  until?: string;
  place?: string;
}

/** 이 일은 이 시간대에 잘 된다 */
export interface WeekPref {
  what: string;
  from: number;
  to: number;
}

export interface WeekPeriod {
  name: string;
  from: string;
  until: string;
}

export interface WeekResult {
  tasks: WeekTask[];
  events: WeekEvent[];
  fixed: WeekFixed[];
  prefs: WeekPref[];
  periods: WeekPeriod[];
}

/** 이미 잡혀 있는 시간 */
export interface Busy {
  start: number;
  end: number;
  text: string;
  /** 이번에 새로 넣는 고정 일정에서 온 것 */
  fresh?: boolean;
}

export interface DraftBlock {
  key: string;
  text: string;
  start: number;
  end: number;
  activityId?: string;
  place?: string;
  /** 새로 말한 약속(고정)인지, 빈 시간에 넣은 할 일인지 */
  fixed?: boolean;
}

export interface DraftLoose {
  key: string;
  text: string;
  day: number;
  place?: string;
}

export interface Draft {
  blocks: DraftBlock[];
  /** 시간 없이 그날 할 일 */
  loose: DraftLoose[];
  /** 자리가 없어 못 넣은 것 */
  left: { text: string; minutes: number }[];
  /** 이미 잡힌 일정끼리 겹치는 곳 */
  clashes: { a: string; b: string; start: number; end: number }[];
}

export interface PackOptions {
  /** 첫날 0시(오늘) */
  today: number;
  now: number;
  /** 하루에 일정을 넣을 시간대(시). 기본 9~23시 */
  open?: number;
  close?: number;
  /** 일정 사이 쉬는 틈(분) */
  breather?: number;
  activities?: Activity[];
  /** 집중 잘 되는 시간대: 맞는 일은 이 시간대에 먼저 넣는다 */
  focus?: Pick<Focus, 'word' | 'from' | 'to'>[];
}

const STEP = 10 * MIN;

/** 할 일에 맞는 집중 시간대(이름·활동에 낱말이 들어 있으면) */
export function focusFor(t: { text: string; activity?: string }, focus: Pick<Focus, 'word' | 'from' | 'to'>[] = []) {
  const hay = norm(`${t.text} ${t.activity ?? ''}`);
  return focus.find((f) => f.word.trim() && hay.includes(norm(f.word)));
}

/** "HH:MM" → 분 */
export function minOf(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** 새 고정 일정을 [today, today+7) 안의 시간으로 펼친다. 기간(from~until, 없으면 periodEnd까지)을 지킨다. */
export function fixedBusy(fixed: WeekFixed[], today: number, periodEnd?: number): Busy[] {
  const out: Busy[] = [];
  for (const f of fixed) {
    const s = minOf(f.start);
    if (s === null) continue;
    const e = (f.end && minOf(f.end)) || s + 60;
    const from = (f.from && dayOf(f.from)) || -Infinity;
    const until = (f.until && dayOf(f.until)) || periodEnd || Infinity;
    for (let i = 0; i < 7; i++) {
      const d = addDays(today, i);
      if (d < from || d > until || !f.days.includes(new Date(d).getDay())) continue;
      out.push({ start: d + s * MIN, end: d + e * MIN, text: f.text, fresh: true });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
const DEFAULT_CHUNK = 90;
const MIN_PIECE = 30;

const ceilStep = (ms: number) => Math.ceil(ms / STEP) * STEP;
const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
const pad = (n: number) => String(n).padStart(2, '0');

export function ymd(day: number): string {
  const d = new Date(day);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM-DD" → 그날 0시 (지역 시간) */
export function dayOf(v: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : null;
}

function at(day: number, hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm);
  return m ? day + Number(m[1]) * HOUR + Number(m[2]) * MIN : null;
}

/** 7일 라벨: "2026-11-18 수" */
export function weekDays(today: number): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today, i);
    return `${ymd(d)} ${'일월화수목금토'[new Date(d).getDay()]}`;
  });
}

/** 이번 주(오늘부터 7일)에 이미 잡힌 시간: 시간을 정한 계획 + 격자에 칠한 계획 */
export function busyOf(todos: Todo[], intervals: Interval[], activities: Activity[], today: number): Busy[] {
  const from = today;
  const to = addDays(today, 7);
  const out: Busy[] = [];
  for (const t of todos) {
    if (t.done || t.type !== 'range' || t.start === undefined || t.end === undefined) continue;
    if (t.end <= from || t.start >= to) continue;
    out.push({ start: t.start, end: t.end, text: t.text });
  }
  const covered = (s: number, e: number) => out.some((b) => b.start <= s && b.end >= e);
  const name = (id: string) => activities.find((a) => a.id === id)?.name ?? '계획';
  // 격자에 칠한 계획은 이어진 칸끼리 합쳐서 본다.
  const plans = intervals
    .filter((iv) => iv.kind === 'plan' && iv.end !== null && iv.end > from && iv.start < to)
    .sort((a, b) => a.start - b.start);
  for (const iv of plans) {
    const end = iv.end as number;
    if (covered(iv.start, end)) continue;
    const last = out[out.length - 1];
    if (last && last.text === name(iv.activityId) && last.end === iv.start) last.end = end;
    else out.push({ start: iv.start, end, text: name(iv.activityId) });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** 이미 잡힌 일정끼리 겹치는 곳 */
export function clashesOf(busy: Busy[]): Draft['clashes'] {
  const out: Draft['clashes'] = [];
  const list = [...busy].sort((a, b) => a.start - b.start);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length && list[j].start < list[i].end; j++) {
      if (list[i].text === list[j].text) continue;
      out.push({ a: list[i].text, b: list[j].text, start: list[j].start, end: Math.min(list[i].end, list[j].end) });
    }
  }
  return out;
}

/**
 * 할 일을 이번 주 빈 시간에 나눠 넣는다.
 * 순서: 새로 말한 약속 → "수업마다" 같은 붙임 일 → 그날 꼭 할 일 → 나머지(기한 빠른 것부터, 하루 한 번씩 고르게).
 */
export function pack(tasks: WeekTask[], events: WeekEvent[], busy: Busy[], opt: PackOptions): Draft {
  const open = opt.open ?? 9;
  const close = opt.close ?? 23;
  const gap = (opt.breather ?? 10) * MIN;
  const days = Array.from({ length: 7 }, (_, i) => addDays(opt.today, i));
  const lastDay = days[6];
  const taken: Busy[] = busy.map((b) => ({ ...b }));
  const blocks: DraftBlock[] = [];
  const loose: DraftLoose[] = [];
  const left: Draft['left'] = [];
  let n = 0;
  const key = () => `wk${n++}`;
  const actId = (t: { activity?: string; text: string }) => {
    if (!opt.activities?.length) return undefined;
    const a = (t.activity && opt.activities.find((x) => x.name === t.activity)) || matchActivity(t.activity || t.text, opt.activities);
    return a?.id;
  };

  // 새 약속은 말한 그대로 넣는다.
  for (const e of events) {
    const d = dayOf(e.date);
    const s = d === null ? null : at(d, e.start);
    if (d === null || s === null) continue;
    const end = (e.end && at(d, e.end)) || s + HOUR;
    blocks.push({ key: key(), text: e.text, start: s, end: Math.max(end, s + STEP), place: e.place, fixed: true });
    taken.push({ start: s, end: Math.max(end, s + STEP), text: e.text });
  }

  /** [from, to) 안에서 len(ms) 이상 비는 첫 자리. 없으면 그 안에서 가장 긴 빈자리(minLen 이상) */
  const findSlot = (from: number, to: number, len: number, minLen: number): { start: number; end: number } | null => {
    const sorted = [...taken].sort((a, b) => a.start - b.start);
    let cursor = ceilStep(from);
    let best: { start: number; end: number } | null = null;
    const consider = (s: number, e: number) => {
      s = ceilStep(s);
      if (e - s >= len) return { start: s, end: s + len };
      if (e - s >= minLen && (!best || e - s > best.end - best.start)) best = { start: s, end: Math.floor(e / STEP) * STEP };
      return null;
    };
    for (const b of sorted) {
      if (b.end + gap <= cursor) continue;
      if (b.start - gap >= to) break;
      const hit = consider(cursor, Math.min(b.start - gap, to));
      if (hit) return hit;
      cursor = Math.max(cursor, ceilStep(b.end + gap));
      if (cursor >= to) break;
    }
    if (cursor < to) {
      const hit = consider(cursor, to);
      if (hit) return hit;
    }
    return best;
  };

  /** 그날 일정을 넣을 수 있는 시간대 */
  const windowOf = (day: number): [number, number] => {
    const s = Math.max(day + open * HOUR, day === opt.today ? ceilStep(opt.now) + STEP : 0);
    return [s, day + close * HOUR];
  };

  const place = (t: WeekTask, from: number, to: number, len: number) => {
    // 집중 잘 되는 시간대가 있으면 그 안에서 먼저 통째로 찾는다.
    const pref = focusFor(t, opt.focus);
    let slot: { start: number; end: number } | null = null;
    if (pref) {
      for (let d = dayStart(from); d < to && !slot; d += DAY) {
        const ps = Math.max(from, d + pref.from * HOUR);
        const pe = Math.min(to, d + pref.to * HOUR);
        if (pe > ps) slot = findSlot(ps, pe, len, len);
      }
    }
    slot = slot ?? findSlot(from, to, len, Math.min(len, MIN_PIECE * MIN));
    if (!slot) return 0;
    blocks.push({ key: key(), text: t.text, start: slot.start, end: slot.end, activityId: actId(t), place: t.place });
    taken.push({ start: slot.start, end: slot.end, text: t.text });
    return slot.end - slot.start;
  };

  const ordered = [...tasks].sort((a, b) => {
    const rank = (t: WeekTask) => (t.after ? 0 : t.on ? 1 : 2);
    return rank(a) - rank(b) || (a.due ?? '9').localeCompare(b.due ?? '9');
  });

  for (const t of ordered) {
    const dueDay = (t.due && dayOf(t.due)) || lastDay;
    const onDay = t.on ? dayOf(t.on) : null;

    // 시간을 안 정한 자잘한 일: 그날(없으면 첫날) 할 일로만 둔다.
    if (!t.minutes && !t.chunk) {
      loose.push({ key: key(), text: t.text, day: onDay ?? (t.due ? dueDay : opt.today), place: t.place });
      continue;
    }

    const chunk = (t.chunk || Math.min(t.minutes, DEFAULT_CHUNK)) * MIN;
    let remain = (t.minutes || 0) * MIN;
    let firstFrom = opt.today;

    if (t.after) {
      const word = norm(t.after);
      const anchors = busy
        .filter((b) => norm(b.text).includes(word) || word.includes(norm(b.text)))
        .filter((b) => b.end > opt.now && b.start < dueDay + DAY)
        .sort((a, b) => a.start - b.start);
      for (let i = 0; i < anchors.length; i++) {
        const a = anchors[i];
        // 그 수업 뒤부터 다음 같은 수업 전까지(늦어도 다음날 밤까지)에서 찾는다.
        const limit = Math.min(anchors[i + 1]?.start ?? Infinity, dayStart(a.end) + 2 * DAY, dueDay + DAY);
        let got = 0;
        for (let d = dayStart(a.end); d < limit && !got; d += DAY) {
          const [ws, we] = windowOf(d);
          got = place(t, Math.max(ws, a.end), Math.min(we, limit), chunk);
        }
        if (!got) left.push({ text: `${t.text} (${new Date(a.start).getMonth() + 1}/${new Date(a.start).getDate()} 수업 뒤)`, minutes: chunk / MIN });
        remain -= got;
      }
      if (!anchors.length && !remain) remain = chunk;
      // 전체 시간을 따로 말했으면 모자란 만큼은 아래에서 고르게 채운다(첫 수업 뒤부터: 배우기 전에 복습할 순 없으니까).
      if (anchors.length) firstFrom = dayStart(anchors[0].end);
    }

    if (onDay !== null) {
      if (!remain) remain = chunk;
      const [ws, we] = windowOf(onDay);
      while (remain > 0) {
        const got = place(t, ws, we, Math.min(chunk, remain));
        if (!got) break;
        remain -= got;
      }
      if (remain > 0) left.push({ text: t.text, minutes: Math.round(remain / MIN) });
      continue;
    }

    if (remain <= 0) continue;
    const span = days.filter((d) => d <= dueDay && d >= firstFrom);
    // 하루에 한 번씩 돌아가며 넣는다. 그래도 남으면 한 바퀴 더.
    for (let round = 0; round < 3 && remain > 0; round++) {
      let any = false;
      // 새로 넣은 일이 적은 날부터(같으면 이른 날부터): 하루에 몰리지 않게.
      const load = (d: number) => blocks.filter((b) => !b.fixed && dayStart(b.start) === d).reduce((m, b) => m + b.end - b.start, 0);
      const order = [...span].sort((a, b) => load(a) - load(b) || a - b);
      for (const d of order) {
        if (remain <= 0) break;
        const [ws, we] = windowOf(d);
        if (we <= ws) continue;
        const got = place(t, ws, we, Math.min(chunk, remain));
        if (got) {
          remain -= got;
          any = true;
        }
      }
      if (!any) break;
    }
    if (remain > 0) left.push({ text: t.text, minutes: Math.round(remain / MIN) });
  }

  blocks.sort((a, b) => a.start - b.start);
  loose.sort((a, b) => a.day - b.day);
  return { blocks, loose, left, clashes: clashesOf(busy) };
}

const TIMEOUT_MS = 25_000;

/** 긴 글을 서버(AI)에 보내 할 일 목록으로 받는다. 보내는 것: 그 글, 이번 주 날짜, 이미 잡힌 일정의 이름·시각, 활동 이름. */
export async function aiWeek(
  apiUrl: string,
  text: string,
  today: number,
  busy: Busy[],
  activities: Activity[],
  image?: { mime: string; data: string },
): Promise<WeekResult | null> {
  if (!apiUrl) return null;
  const hm = (ms: number) => `${pad(new Date(ms).getHours())}:${pad(new Date(ms).getMinutes())}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), image ? 60_000 : TIMEOUT_MS);
  try {
    const res = await fetch(`${apiUrl}/v1/week`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: text.slice(0, 3000),
        ...(image ? { image } : {}),
        days: weekDays(today),
        events: busy.slice(0, 80).map((b) => ({ date: ymd(dayStart(b.start)), start: hm(b.start), end: dayStart(b.end) === dayStart(b.start) ? hm(b.end) : '', text: b.text.slice(0, 30) })),
        activities: activities.map((a) => a.name).slice(0, 30),
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { tasks?: unknown; events?: unknown; fixed?: unknown; prefs?: unknown; periods?: unknown };
    const tasks = (Array.isArray(data.tasks) ? data.tasks : []).filter((t): t is WeekTask => !!t && typeof (t as WeekTask).text === 'string');
    const events = (Array.isArray(data.events) ? data.events : []).filter((e): e is WeekEvent => !!e && typeof (e as WeekEvent).text === 'string');
    const fixed = (Array.isArray(data.fixed) ? data.fixed : []).filter((f): f is WeekFixed => !!f && typeof (f as WeekFixed).text === 'string' && Array.isArray((f as WeekFixed).days));
    const prefs = (Array.isArray(data.prefs) ? data.prefs : []).filter((p): p is WeekPref => !!p && typeof (p as WeekPref).what === 'string');
    const periods = (Array.isArray(data.periods) ? data.periods : []).filter((p): p is WeekPeriod => !!p && typeof (p as WeekPeriod).name === 'string' && typeof (p as WeekPeriod).from === 'string');
    return { tasks: tasks.map((t) => ({ ...t, minutes: Number(t.minutes) || 0, chunk: Number(t.chunk) || 0 })), events, fixed, prefs, periods };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 채팅에 들어온 말이 '한 주 짜 달라'는 긴 부탁인지 */
export function looksLikeWeekRequest(text: string): boolean {
  const t = text.trim();
  if (t.length < 80) return false;
  return /(일정|계획|스케줄|한\s*주|이번\s*주).{0,20}(짜|세워|잡아|정리해)/.test(t) || t.length > 300;
}
