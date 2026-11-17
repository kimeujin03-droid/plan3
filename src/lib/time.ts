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

export function monthStart(ms: number): number {
  const d = new Date(dayStart(ms));
  d.setDate(1);
  return d.getTime();
}

export function addMonths(month: number, n: number): number {
  const d = new Date(month);
  d.setMonth(d.getMonth() + n);
  return d.getTime();
}

export function fmtYM(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

/** <input type="date"> 값(YYYY-MM-DD)과 그날 0시 사이의 변환 */
export function toDateInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDateInput(v: string): number | null {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : null;
}

/** 기한을 오늘 기준으로 짧게: 오늘, 내일, 3일 뒤, 2일 지남 */
export function fmtDue(due: number, now: number): string {
  const diff = Math.round((due - dayStart(now)) / DAY);
  if (diff === 0) return '오늘';
  if (diff === 1) return '내일';
  if (diff === 2) return '모레';
  if (diff > 2 && diff < 7) return `${'일월화수목금토'[new Date(due).getDay()]}요일`;
  if (diff < 0) return `${-diff}일 지남`;
  return fmtMD(due);
}

/** "오후 2:00" */
export function fmtAmPm(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  return `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${pad(d.getMinutes())}`;
}

/** "11월 18일 (수)" */
export function fmtDayLong(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${'일월화수목금토'[d.getDay()]})`;
}

/** 남은 시간을 짧게: "40분", "2시간 10분", "5시간", "3일" */
export function fmtLeft(ms: number): string {
  const m = Math.max(1, Math.ceil(ms / MIN));
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  if (h < 3) return m % 60 ? `${h}시간 ${m % 60}분` : `${h}시간`;
  if (h < 48) return `${h}시간`;
  return `${Math.floor(h / 24)}일`;
}

/** <input type="datetime-local"> 값과 ms 사이 */
export function toDateTimeInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeInput(v: string): number | null {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])).getTime() : null;
}
