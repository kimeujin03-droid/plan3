import { matchActivity, resolveDayWord, type Command } from './parser';
import { addDays, dayStart, HOUR, MIN } from './time';
import type { Activity } from './types';

/** 기본 서버 주소. 빌드할 때 VITE_MOA_API로 바꿀 수 있다. */
/** 운영 중인 서버. 주소는 비밀이 아니다(열쇠는 서버 안에만 있다). */
const HOSTED_API = 'https://moa-api.kimeujin03.workers.dev';
export const DEFAULT_API: string = ((import.meta.env?.VITE_MOA_API as string | undefined) || HOSTED_API).replace(/\/+$/, '');

const TIMEOUT_MS = 12000;

interface WireCommand {
  type?: unknown;
  activity?: unknown;
  start?: unknown;
  end?: unknown;
  value?: unknown;
  text?: unknown;
  date?: unknown;
  when?: unknown;
  until?: unknown;
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function clock(v: unknown, base: number): number | null {
  const m = typeof v === 'string' ? v.match(/^(\d{1,2}):(\d{2})$/) : null;
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return base + h * HOUR + min * MIN;
}

/**
 * 서버가 돌려준 명령을 앱이 아는 모양으로만 받아들인다.
 * 모르는 종류, 빠진 값, 이상한 시각은 버린다: 서버나 모델이 무엇을 보내도 기록이 망가지지 않게 하는 마지막 관문.
 */
export function toCommands(wire: unknown, activities: Activity[], now: number, today: number = dayStart(now)): Command[] {
  const list = (wire as { commands?: unknown })?.commands;
  if (!Array.isArray(list)) return [];
  const out: Command[] = [];
  const base = dayStart(now);
  for (const raw of list.slice(0, 4) as WireCommand[]) {
    if (!raw || typeof raw !== 'object') continue;
    const name = str(raw.activity, 20);
    const act = name ? activities.find((a) => a.name === name) ?? matchActivity(name, activities) : null;
    switch (raw.type) {
      case 'start':
        if (name) out.push({ type: 'start', name, activityId: act?.id ?? null });
        break;
      case 'end':
        out.push({ type: 'end', activityId: act?.id ?? null });
        break;
      case 'intent':
        if (name) out.push({ type: 'todo', text: name, due: null });
        break;
      case 'plan': {
        // 앞날의 일. 날짜는 오늘부터 1년 안, 시각은 있을 때만.
        const text = str(raw.text, 80) || name;
        const dm = typeof raw.date === 'string' ? raw.date.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
        // 날짜 계산은 모델보다 앱이 정확하다: 사용자가 한 날짜 말("내일", "금요일")을 앱이 직접 푼다.
        const spoken = typeof raw.when === 'string' ? resolveDayWord(raw.when, today) : null;
        if (!text) break;
        // 날짜를 못 받았으면 버리지 않고 기한 없는 계획으로 남긴다.
        if (spoken === null && !dm) {
          out.push({ type: 'todo', text, due: null });
          break;
        }
        const due = spoken ?? new Date(Number(dm![1]), Number(dm![2]) - 1, Number(dm![3])).getTime();
        if (!(due >= today && due <= addDays(today, 366))) break;
        const start = clock(raw.start, due);
        let end = clock(raw.end, due);
        if (raw.until === true) out.push(start === null ? { type: 'todo', text, due, deadline: true } : { type: 'todo', text, due, deadline: true, dueAt: start });
        else if (start === null) out.push({ type: 'todo', text, due });
        else if (end === null) out.push({ type: 'todo', text, due, start, activityId: act?.id ?? null });
        else {
          if (end <= start) end += 24 * HOUR;
          if (end - start > 16 * HOUR) break;
          out.push({ type: 'todo', text, due, start, end, activityId: act?.id ?? null });
        }
        break;
      }
      case 'backfill': {
        const start = clock(raw.start, base);
        let end = clock(raw.end, base);
        if (!name || start === null || end === null) break;
        if (end <= start) end += 24 * HOUR;
        // 하루를 넘는 구간이나 아직 오지 않은 시간은 받지 않는다.
        if (end - start > 16 * HOUR || start > now) break;
        out.push({ type: 'backfill', name, activityId: act?.id ?? null, start, end: Math.min(end, now) });
        break;
      }
      case 'sleep':
        out.push({ type: 'sleep' });
        break;
      case 'wake':
        out.push({ type: 'wake' });
        break;
      case 'focus':
      case 'fatigue': {
        const v = Number(raw.value);
        if (!Number.isFinite(v)) break;
        if (raw.type === 'focus') out.push({ type: 'focus', value: Math.min(5, Math.max(1, Math.round(v))) });
        else out.push({ type: 'fatigue', value: Math.min(100, Math.max(0, Math.round(v))) });
        break;
      }
      case 'mood': {
        const text = str(raw.text, 200);
        if (text) out.push({ type: 'mood', text });
        break;
      }
      case 'quiet':
        out.push({ type: 'quiet' });
        break;
      case 'memo': {
        const text = str(raw.text, 300);
        if (text) out.push({ type: 'memo', text });
        break;
      }
      case 'chat': {
        const text = str(raw.text, 120);
        if (text) out.push({ type: 'chat', text });
        break;
      }
    }
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * 규칙으로 못 알아들은 말을 서버(AI)에 물어본다. 실패하거나 느리면 null: 부르는 쪽이 메모로 남긴다.
 * 보내는 것은 그 한 문장, 활동 이름들, 지금 시각과 오늘 날짜뿐이다. 과거 기록은 보내지 않는다.
 */
export async function aiParse(
  apiUrl: string,
  text: string,
  activities: Activity[],
  running: string[],
  now: number,
  today: number = dayStart(now),
): Promise<Command[] | null> {
  if (!apiUrl) return null;
  const d = new Date(now);
  const t = new Date(today);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${apiUrl}/v1/parse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: text.slice(0, 300),
        activities: activities.map((a) => a.name).slice(0, 30),
        running,
        now: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
        // 사용자가 느끼는 오늘(자기 전의 새벽은 전날)과 그 요일
        today: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${'일월화수목금토'[t.getDay()]}`,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const cmds = toCommands(await res.json(), activities, now, today);
    return cmds.length ? cmds : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
