import { CELL } from './time';
import type { Sample } from './types';

export interface FocusCell {
  at: number;
  /** 고른 적이 없으면 null. 한 번 고르면 다시 고를 때까지 그 값이 이어진다. */
  value: number | null;
  /** 이 칸에서 직접 골랐는지 */
  picked: boolean;
}

/**
 * 한 번의 작업(start~end)을 10분 칸으로 나눠 칸마다 집중도를 준다.
 * 아무것도 안 누른 칸은 바로 앞 칸의 값을 그대로 잇는다.
 */
export function focusCells(samples: Sample[], activityId: string, start: number, end: number, step = CELL): FocusCell[] {
  const mine = samples
    .filter((m) => m.kind === 'focus' && m.activityId === activityId && m.at >= start && m.at <= end)
    .sort((a, b) => a.at - b.at);
  const out: FocusCell[] = [];
  let value: number | null = null;
  let k = 0;
  for (let at = Math.floor(start / step) * step; at < end; at += step) {
    let picked = false;
    while (k < mine.length && mine[k].at < at + step) {
      value = mine[k].value;
      picked = true;
      k++;
    }
    out.push({ at, value, picked });
  }
  return out;
}

/** 1분 칸들을 같은 값끼리 이어 붙인 조각들(그리기용) */
export function focusRuns(cells: FocusCell[]): { at: number; minutes: number; value: number | null; picked: boolean }[] {
  const out: { at: number; minutes: number; value: number | null; picked: boolean }[] = [];
  for (const c of cells) {
    const last = out[out.length - 1];
    if (last && last.value === c.value && !c.picked) last.minutes++;
    else out.push({ at: c.at, minutes: 1, value: c.value, picked: c.picked });
  }
  return out;
}

/** 이어진 값까지 넣은 평균. 한 번도 안 골랐으면 null. */
export function focusAverage(cells: FocusCell[]): number | null {
  const vals = cells.map((c) => c.value).filter((v): v is number => v !== null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}
