import { dayStart, HOUR, MIN } from './time';
import type { Activity } from './types';

export type Command =
  | { type: 'start'; name: string; activityId: string | null }
  | { type: 'end'; activityId: string | null }
  | { type: 'intent'; label: string; activityId: string | null }
  | { type: 'backfill'; name: string; activityId: string | null; start: number; end: number }
  | { type: 'sleep' }
  | { type: 'wake' }
  | { type: 'focus'; value: number }
  | { type: 'fatigue'; value: number }
  | { type: 'mood'; text: string }
  | { type: 'quiet' }
  | { type: 'memo'; text: string };

const FILLER = /^(모아야|모아|지금부터|이제부터|나|지금|이제|그럼|아까|오늘|방금)[\s,]*/;

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

const TIME = String.raw`(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분|(반))?`;
const BACKFILL = new RegExp(`${TIME}\\s*(?:부터|에서|~|-)\\s*${TIME}\\s*(?:까지)?\\s*(.*)$`);
const INTENT = /(.*?)\s*(해야지|해야\s*하는데|해야\s*되는데|해야\s*돼|해야\s*해|해야겠다|써야지|써야\s*하는데|써야\s*되는데|써야\s*돼|써야겠다)/;
const MOOD = /(하기\s*싫|귀찮|피곤|힘들|졸려|기분이?\s*(아냐|아니|별로))/;
const END = /(끝났|끝냈|끝낼|끝!|끝$|그만|다\s*했|마쳤|종료)/;
const START = /(.*?)\s*(시작|할게|할래|한다|하러|해볼게|하는\s*중)/;

export function parse(text: string, activities: Activity[], now: number): Command[] {
  const t = text.trim();
  if (!t) return [];

  if (/(말\s*걸지\s*마|조용히)/.test(t)) return [{ type: 'quiet' }];

  const focus = t.match(/집중도?\s*(\d)/);
  if (focus) return [{ type: 'focus', value: Math.min(5, Math.max(1, Number(focus[1]))) }];
  const fatigue = t.match(/피로도?\s*(\d{1,3})/);
  if (fatigue) return [{ type: 'fatigue', value: Math.min(100, Number(fatigue[1])) }];

  if (/(잘게|자러|잔다|잘래)/.test(t)) return [{ type: 'sleep' }];
  if (/(일어났|일어남|기상)/.test(t)) return [{ type: 'wake' }];

  const bf = t.match(BACKFILL);
  if (bf) {
    const toMs = (h: string, m?: string, half?: string) =>
      Number(h) * HOUR + (half ? 30 : Number(m ?? 0)) * MIN;
    const base = dayStart(now);
    let start = toMs(bf[1], bf[2], bf[3]);
    let end = toMs(bf[4], bf[5], bf[6]);
    if (end <= start && end + 12 * HOUR <= 24 * HOUR) end += 12 * HOUR;
    const rest = clean(bf[7].replace(/(했어|했음|함|했다|했지|갔어|봤어)$/, ''));
    const act = matchActivity(rest, activities);
    if (end > start && rest) {
      return [{ type: 'backfill', name: rest, activityId: act?.id ?? null, start: base + start, end: base + end }];
    }
  }

  const out: Command[] = [];
  const intent = t.match(INTENT);
  if (intent) {
    const label = clean(intent[1]);
    if (label) out.push({ type: 'intent', label, activityId: matchActivity(label, activities)?.id ?? null });
  }
  if (MOOD.test(t)) out.push({ type: 'mood', text: t });
  if (out.length) return out;

  if (END.test(t)) return [{ type: 'end', activityId: matchActivity(t, activities)?.id ?? null }];

  const start = t.match(START);
  if (start) {
    const name = clean(start[1]);
    if (name) return [{ type: 'start', name, activityId: matchActivity(name, activities)?.id ?? null }];
  }

  return [{ type: 'memo', text: t }];
}
