export const MIN = 60_000;
export const CELL = 10 * MIN;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export function dayStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addDays(day: number, n: number): number {
  const d = new Date(day);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

/** 그 주 월요일 0시 */
export function weekStart(ms: number): number {
  const d = new Date(dayStart(ms));
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

const pad = (n: number) => String(n).padStart(2, '0');
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export function fmtHM(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`;
}

export function fmtMD(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${pad(m)}:${pad(s % 60)}`;
}

export function fmtDur(ms: number): string {
  const m = Math.max(0, Math.round(ms / MIN));
  const h = Math.floor(m / 60);
  if (h === 0) return `${m}분`;
  if (m % 60 === 0) return `${h}시간`;
  return `${h}시간 ${m % 60}분`;
}

export function fmtDays(ms: number): string {
  const d = Math.floor(ms / DAY);
  if (d <= 0) return '말한 날 바로';
  return `${d}일`;
}

/** 처음 말한 뒤 시작까지 걸린 기간을 문장으로. */
export function startedAfter(ms: number): string {
  const d = Math.floor(ms / DAY);
  return d <= 0 ? '말한 날 바로 시작' : `${d}일 만에 시작`;
}
