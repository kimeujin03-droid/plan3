import { uid } from './id';
import { MIN } from './time';
import type { Intent, Interval } from './types';

/** "본격적으로 시작"으로 보는 기준: 처음 말한 뒤 누적 30분 */
export const MEANINGFUL_MS = 30 * MIN;

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

export function mentionIntent(list: Intent[], label: string, activityId: string | null, at: number): Intent[] {
  const idx = list.findIndex((it) =>
    activityId ? it.activityId === activityId : it.activityId === null && norm(it.label) === norm(label),
  );
  if (idx < 0) return [...list, { id: uid('int'), label, activityId, mentions: [at] }];
  return list.map((it, i) => (i === idx ? { ...it, mentions: [...it.mentions, at] } : it));
}

export interface IntentProgress {
  firstMention: number;
  firstAttemptAt: number | null;
  meaningfulAt: number | null;
}

/** 처음 말한 날 이후의 실행 기록에서 첫 시도와 본격 시작 시점을 계산한다. 기록이 없으면 null(안 했다는 뜻이 아님). */
export function intentProgress(intent: Intent, intervals: Interval[], now: number): IntentProgress {
  const firstMention = intent.mentions[0];
  if (!intent.activityId) return { firstMention, firstAttemptAt: null, meaningfulAt: null };
  const runs = intervals
    .filter((iv) => iv.kind === 'exec' && iv.activityId === intent.activityId)
    .map((iv) => ({ s: Math.max(iv.start, firstMention), e: iv.end === null ? now : iv.end }))
    .filter((r) => r.e > r.s)
    .sort((a, b) => a.s - b.s);
  let firstAttemptAt: number | null = null;
  let meaningfulAt: number | null = null;
  let acc = 0;
  for (const r of runs) {
    if (firstAttemptAt === null) firstAttemptAt = r.s;
    if (acc + (r.e - r.s) >= MEANINGFUL_MS) {
      meaningfulAt = r.s + (MEANINGFUL_MS - acc);
      break;
    }
    acc += r.e - r.s;
  }
  return { firstMention, firstAttemptAt, meaningfulAt };
}
