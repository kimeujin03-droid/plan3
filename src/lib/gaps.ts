import { dayStart, MIN } from './time';
import type { Interval } from './types';

export interface Gap {
  start: number;
  end: number;
}

const MIN_GAP = 20 * MIN;
/** 방금 전 몇 분은 아직 "비었다"고 묻지 않는다. */
const RECENT = 10 * MIN;

/**
 * 오늘 첫 기록 이후로 아무것도 적히지 않은 시간 중 가장 최근 것을 찾는다.
 * 기록이 하나도 없는 날은 묻지 않는다: 빈 하루를 숙제처럼 보여주지 않기 위해서다.
 */
export function findGap(intervals: Interval[], now: number): Gap | null {
  const day = dayStart(now);
  const spans = intervals
    .filter((iv) => iv.kind === 'exec')
    .map((iv) => [Math.max(iv.start, day), Math.min(iv.end ?? now, now)] as [number, number])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  if (!spans.length) return null;

  const gaps: Gap[] = [];
  let cursor = spans[0][1];
  for (const [s, e] of spans.slice(1)) {
    if (s - cursor >= MIN_GAP) gaps.push({ start: cursor, end: s });
    cursor = Math.max(cursor, e);
  }
  if (now - RECENT - cursor >= MIN_GAP) gaps.push({ start: cursor, end: now - RECENT });
  return gaps.length ? gaps[gaps.length - 1] : null;
}
