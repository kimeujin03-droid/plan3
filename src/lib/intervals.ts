import { uid } from './id';
import { CELL } from './time';
import type { Interval, Kind, PaintMode, Source } from './types';

const endOf = (iv: Interval, now: number) => (iv.end === null ? Math.max(now, iv.start) : iv.end);

function overlaps(iv: Interval, start: number, end: number, now: number): boolean {
  return iv.start < end && endOf(iv, now) > start;
}

/** 같은 활동·같은 종류의 닫힌 구간과 붙거나 겹치면 하나로 합쳐서 추가한다. */
export function mergeAdd(
  list: Interval[],
  add: { activityId: string; kind: Kind; start: number; end: number; source: Source },
): Interval[] {
  let { start, end } = add;
  const rest: Interval[] = [];
  for (const iv of list) {
    const same = iv.activityId === add.activityId && iv.kind === add.kind && iv.end !== null;
    if (same && iv.start <= end && (iv.end as number) >= start) {
      start = Math.min(start, iv.start);
      end = Math.max(end, iv.end as number);
    } else {
      rest.push(iv);
    }
  }
  rest.push({ id: uid('iv'), activityId: add.activityId, kind: add.kind, start, end, source: add.source });
  return rest;
}

/**
 * 조건에 맞는 구간에서 [start, end)를 잘라낸다.
 * 진행 중인 구간은 지금(now)까지만 있는 것으로 본다: 미래 칸을 지워도 타이머는 건드리지 않고,
 * 지금 칸까지 지우면 그 앞에서 멈춘 것으로 닫는다.
 */
export function subtract(
  list: Interval[],
  start: number,
  end: number,
  match: (iv: Interval) => boolean,
  now: number,
): Interval[] {
  const out: Interval[] = [];
  for (const iv of list) {
    const open = iv.end === null;
    const ivEnd = endOf(iv, now);
    if (!match(iv) || iv.start >= end || ivEnd <= start) {
      out.push(iv);
      continue;
    }
    if (iv.start < start) out.push({ ...iv, id: uid('iv'), end: start });
    if (ivEnd > end) out.push({ ...iv, id: uid('iv'), start: end, end: open ? null : iv.end });
  }
  return out;
}

export interface CellInfo {
  plan: string | null;
  exec: string[];
}

/** 10분 칸 하나에 무엇이 들어 있는지. 실행은 먼저 시작한 순서로 최대 2개. */
export function cellInfo(list: Interval[], cellStart: number, now: number): CellInfo {
  const cellEnd = cellStart + CELL;
  let plan: string | null = null;
  const exec: { id: string; start: number }[] = [];
  for (const iv of list) {
    if (!overlaps(iv, cellStart, cellEnd, now)) continue;
    if (iv.kind === 'plan') {
      if (plan === null) plan = iv.activityId;
    } else {
      const found = exec.find((e) => e.id === iv.activityId);
      if (found) found.start = Math.min(found.start, iv.start);
      else exec.push({ id: iv.activityId, start: iv.start });
    }
  }
  exec.sort((a, b) => a.start - b.start);
  return { plan, exec: exec.slice(0, 2).map((e) => e.id) };
}

/** 칸 하나를 칠한다. 계획은 칸당 1개, 실행은 칸당 2개까지(세 번째는 두 번째를 바꾼다). */
export function paintCell(
  list: Interval[],
  cellStart: number,
  activityId: string,
  mode: PaintMode,
  now: number,
): Interval[] {
  const cellEnd = cellStart + CELL;
  if (mode === 'erase') return subtract(list, cellStart, cellEnd, () => true, now);
  if (mode === 'plan') {
    const cleared = subtract(list, cellStart, cellEnd, (iv) => iv.kind === 'plan', now);
    return mergeAdd(cleared, { activityId, kind: 'plan', start: cellStart, end: cellEnd, source: 'paint' });
  }
  const info = cellInfo(list, cellStart, now);
  if (info.exec.includes(activityId)) return list;
  let base = list;
  if (info.exec.length >= 2) {
    const drop = info.exec[1];
    base = subtract(list, cellStart, cellEnd, (iv) => iv.kind === 'exec' && iv.activityId === drop, now);
  }
  return mergeAdd(base, { activityId, kind: 'exec', start: cellStart, end: cellEnd, source: 'paint' });
}

/** 기간 안의 활동별 실행 시간(ms). 겹친 일은 각각 센다. */
export function totalsByActivity(list: Interval[], from: number, to: number, now: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const iv of list) {
    if (iv.kind !== 'exec') continue;
    const s = Math.max(iv.start, from);
    const e = Math.min(endOf(iv, now), to);
    if (e > s) out[iv.activityId] = (out[iv.activityId] ?? 0) + (e - s);
  }
  return out;
}

/** 기간 안에서 무언가 기록된 실제 경과 시간(ms). 겹친 시간은 한 번만 센다. */
export function unionMs(list: Interval[], from: number, to: number, now: number): number {
  const spans = list
    .filter((iv) => iv.kind === 'exec')
    .map((iv) => [Math.max(iv.start, from), Math.min(endOf(iv, now), to)] as [number, number])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curS = -1;
  let curE = -1;
  for (const [s, e] of spans) {
    if (s > curE) {
      total += curE - curS;
      curS = s;
      curE = e;
    } else {
      curE = Math.max(curE, e);
    }
  }
  return total + (curE - curS);
}

export function activeIntervals(list: Interval[]): Interval[] {
  return list.filter((iv) => iv.kind === 'exec' && iv.end === null).sort((a, b) => a.start - b.start);
}
