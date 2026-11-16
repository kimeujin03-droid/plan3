import { SLEEP_ID } from './palette';
import { addDays, dayStart, HOUR } from './time';
import type { Interval } from './types';

/** 이 시각 전의 새벽은, 아직 자지 않았다면 전날로 친다. */
const NIGHT_END_HOUR = 6;

/**
 * "지금이 속한 하루"의 0시.
 * 자기 전까지는 전날이다: 새벽 3시에 말하는 "내일"은 몇 시간 뒤의 아침(달력으로는 오늘)이다.
 * 새벽이라도 이미 한숨 자고 일어났으면 새 하루로 본다.
 */
export function logicalToday(now: number, intervals: Interval[]): number {
  const today = dayStart(now);
  if (new Date(now).getHours() >= NIGHT_END_HOUR) return today;
  const slept = intervals.some(
    (iv) => iv.activityId === SLEEP_ID && iv.kind === 'exec' && iv.end !== null && iv.end <= now && iv.end > today - 3 * HOUR && iv.end - iv.start >= 2 * HOUR,
  );
  return slept ? today : addDays(today, -1);
}

/** 그 하루가 끝나는 시각: 다음 날 0시. 다만 아직 안 자고 새벽을 넘기는 중이면 지금까지. */
export function logicalDayEnd(today: number, now: number): number {
  return Math.max(addDays(today, 1), now);
}
