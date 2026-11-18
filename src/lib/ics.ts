import { DAY } from './time';

/**
 * 캘린더 파일(.ics) 읽기. 구글 캘린더 '내보내기'로 받은 파일을 생각했다.
 * 시간을 정한 일정만 읽는다(종일 일정은 세어서 알려만 준다). 반복 일정은 [from, to) 안에서 펼친다.
 * 지원: DAILY / WEEKLY(BYDAY) / MONTHLY / YEARLY, INTERVAL, COUNT, UNTIL, EXDATE, RECURRENCE-ID(바뀐 회차), 취소된 일정.
 */

export interface IcsEvent {
  /** 같은 일정을 두 번 넣지 않게: UID@시작시각 */
  ext: string;
  text: string;
  start: number;
  end: number;
  place?: string;
}

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

interface Raw {
  uid: string;
  summary: string;
  location: string;
  status: string;
  start?: Prop;
  end?: Prop;
  duration?: string;
  rrule?: string;
  exdates: Prop[];
  recurrenceId?: Prop;
}

function unfold(text: string): string[] {
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
}

function parseLine(line: string): Prop | null {
  // 이름;파라미터=값;...:값  (값 안의 ':'는 그대로 둔다. 따옴표 안의 ':'·';'도)
  let i = 0;
  let quoted = false;
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    else if (c === ':' && !quoted) break;
  }
  if (i >= line.length) return null;
  const head = line.slice(0, i);
  const value = line.slice(i + 1);
  const parts = head.split(';');
  const params: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: parts[0].toUpperCase(), params, value };
}

const unescape = (v: string) => v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

/** 그 시간대에서 ms 순간의 오프셋(ms). 실패하면 기기 시간대. */
function tzOffset(ms: number, tz: string): number {
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
    return asUtc - Math.floor(ms / 1000) * 1000;
  } catch {
    return -new Date(ms).getTimezoneOffset() * 60_000;
  }
}

interface Wall {
  y: number;
  mo: number; // 0~11
  d: number;
  h: number;
  mi: number;
  s: number;
}

/** 벽시계 시각(그 시간대 기준) → ms. tz가 'UTC'면 그대로, ''면 기기 시간대. */
function wallToMs(w: Wall, tz: string): number {
  if (tz === 'UTC') return Date.UTC(w.y, w.mo, w.d, w.h, w.mi, w.s);
  if (!tz) return new Date(w.y, w.mo, w.d, w.h, w.mi, w.s).getTime();
  const guess = Date.UTC(w.y, w.mo, w.d, w.h, w.mi, w.s);
  let ms = guess - tzOffset(guess, tz);
  ms = guess - tzOffset(ms, tz);
  return ms;
}

function readWall(v: string): { wall: Wall; dateOnly: boolean; utc: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v.trim());
  if (!m) return null;
  return {
    wall: { y: +m[1], mo: +m[2] - 1, d: +m[3], h: m[4] ? +m[4] : 0, mi: m[5] ? +m[5] : 0, s: m[6] ? +m[6] : 0 },
    dateOnly: !m[4],
    utc: !!m[7],
  };
}

function propTime(p: Prop): { ms: number; wall: Wall; tz: string; dateOnly: boolean } | null {
  const r = readWall(p.value);
  if (!r) return null;
  const tz = r.utc ? 'UTC' : p.params.TZID ?? '';
  return { ms: wallToMs(r.wall, tz), wall: r.wall, tz, dateOnly: r.dateOnly || p.params.VALUE === 'DATE' };
}

function durationMs(v: string): number {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return 0;
  const ms = ((+(m[2] ?? 0) * 7 + +(m[3] ?? 0)) * 24 * 3600 + +(m[4] ?? 0) * 3600 + +(m[5] ?? 0) * 60 + +(m[6] ?? 0)) * 1000;
  return m[1] === '-' ? -ms : ms;
}

const WEEKDAY: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/** 벽시계 날짜에 n일 더하기 */
function addWallDays(w: Wall, n: number): Wall {
  const t = new Date(Date.UTC(w.y, w.mo, w.d + n));
  return { ...w, y: t.getUTCFullYear(), mo: t.getUTCMonth(), d: t.getUTCDate() };
}
const wallDow = (w: Wall) => new Date(Date.UTC(w.y, w.mo, w.d)).getUTCDay();

/** 반복 규칙에 따라 시작 시각들을 펼친다(벽시계 기준이라 서머타임에도 같은 시각). */
function expand(first: { ms: number; wall: Wall; tz: string }, rrule: string, from: number, to: number): number[] {
  const r = Object.fromEntries(rrule.split(';').map((kv) => kv.split('=')).map(([k, v]) => [k.toUpperCase(), v ?? '']));
  const freq = r.FREQ;
  const interval = Math.max(1, Number(r.INTERVAL) || 1);
  const count = r.COUNT ? Number(r.COUNT) : Infinity;
  const until = r.UNTIL ? (() => {
    const u = readWall(r.UNTIL);
    return u ? wallToMs(u.dateOnly ? { ...u.wall, h: 23, mi: 59, s: 59 } : u.wall, u.utc ? 'UTC' : first.tz) : Infinity;
  })() : Infinity;
  const out: number[] = [];
  let made = 0;
  const push = (w: Wall) => {
    const ms = wallToMs(w, first.tz);
    if (ms < first.ms) return true;
    if (ms > until || made >= count) return false;
    made++;
    if (ms >= from - DAY && ms < to) out.push(ms);
    return true;
  };
  const hardStop = to + DAY;
  if (freq === 'DAILY') {
    for (let i = 0; i < 4000; i++) {
      const w = addWallDays(first.wall, i * interval);
      if (wallToMs(w, first.tz) > hardStop || !push(w)) break;
    }
  } else if (freq === 'WEEKLY') {
    const days = (r.BYDAY ? r.BYDAY.split(',').map((d: string) => WEEKDAY[d.slice(-2)]).filter((d: number | undefined) => d !== undefined) : [wallDow(first.wall)]).sort((a: number, b: number) => a - b);
    const weekStart = addWallDays(first.wall, -wallDow(first.wall));
    outer: for (let wk = 0; wk < 1000; wk++) {
      const base = addWallDays(weekStart, wk * 7 * interval);
      if (wallToMs(base, first.tz) > hardStop) break;
      for (const d of days) if (!push(addWallDays(base, d))) break outer;
    }
  } else if (freq === 'MONTHLY' || freq === 'YEARLY') {
    for (let i = 0; i < 600; i++) {
      const mo = first.wall.mo + (freq === 'MONTHLY' ? i * interval : i * 12 * interval);
      const t = new Date(Date.UTC(first.wall.y, mo, 1));
      const w = { ...first.wall, y: t.getUTCFullYear(), mo: t.getUTCMonth() };
      const dim = new Date(Date.UTC(w.y, w.mo + 1, 0)).getUTCDate();
      if (wallToMs({ ...w, d: 1 }, first.tz) > hardStop) break;
      if (first.wall.d > dim) continue; // 31일이 없는 달은 건너뛴다(규칙대로)
      if (!push({ ...w, d: first.wall.d })) break;
    }
  } else {
    push(first.wall);
  }
  return out;
}

/** .ics 글을 읽어 [from, to) 안의 시간 일정을 돌려준다. */
export function parseIcs(text: string, from: number, to: number): { events: IcsEvent[]; allDay: number } {
  const raws: Raw[] = [];
  let cur: Raw | null = null;
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') {
      cur = { uid: '', summary: '', location: '', status: '', exdates: [] };
      continue;
    }
    if (line === 'END:VEVENT') {
      if (cur) raws.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const p = parseLine(line);
    if (!p) continue;
    switch (p.name) {
      case 'UID': cur.uid = p.value.trim(); break;
      case 'SUMMARY': cur.summary = unescape(p.value); break;
      case 'LOCATION': cur.location = unescape(p.value); break;
      case 'STATUS': cur.status = p.value.trim().toUpperCase(); break;
      case 'DTSTART': cur.start = p; break;
      case 'DTEND': cur.end = p; break;
      case 'DURATION': cur.duration = p.value; break;
      case 'RRULE': cur.rrule = p.value; break;
      case 'EXDATE': cur.exdates.push(p); break;
      case 'RECURRENCE-ID': cur.recurrenceId = p; break;
    }
  }

  // 바뀐 회차(RECURRENCE-ID)는 원래 회차를 지우고 따로 넣는다.
  const moved = new Map<string, Set<number>>();
  for (const r of raws) {
    if (!r.recurrenceId) continue;
    const t = propTime(r.recurrenceId);
    if (!t) continue;
    if (!moved.has(r.uid)) moved.set(r.uid, new Set());
    moved.get(r.uid)!.add(t.ms);
  }

  const events: IcsEvent[] = [];
  let allDay = 0;
  for (const r of raws) {
    if (!r.start || r.status === 'CANCELLED') continue;
    const s = propTime(r.start);
    if (!s) continue;
    if (s.dateOnly) {
      allDay++;
      continue;
    }
    const e = r.end ? propTime(r.end) : null;
    const len = Math.max(0, e ? e.ms - s.ms : r.duration ? durationMs(r.duration) : 0);
    const skip = new Set<number>(moved.get(r.uid) ?? []);
    for (const ex of r.exdates) {
      for (const v of ex.value.split(',')) {
        const t = propTime({ ...ex, value: v });
        if (t) skip.add(t.ms);
      }
    }
    const starts = r.rrule && !r.recurrenceId ? expand(s, r.rrule, from, to) : [s.ms];
    for (const st of starts) {
      if (skip.has(st)) continue;
      const end = st + (len || 60 * 60_000);
      if (end <= from || st >= to) continue;
      events.push({ ext: `${r.uid || r.summary}@${st}`, text: r.summary || '일정', start: st, end, place: r.location ? r.location.slice(0, 20) : undefined });
    }
  }
  events.sort((a, b) => a.start - b.start);
  return { events, allDay };
}

/** 고른 파일(.ics 또는 구글 내보내기 .zip)에서 .ics 글들을 꺼낸다. */
export async function readCalendarFile(file: File): Promise<string[]> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b;
  if (!isZip) return [new TextDecoder().decode(buf)];
  const { unzipSync, strFromU8 } = await import('fflate');
  const files = unzipSync(buf, { filter: (f) => /\.ics$/i.test(f.name) });
  return Object.values(files).map((u) => strFromU8(u));
}
