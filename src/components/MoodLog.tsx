import { useState } from 'react';
import { DAY, dayStart, fmtDayLong, fmtHM } from '../lib/time';
import { MOOD_WORDS, useStore } from '../store';
import { Moa, type MoaMood } from './Moa';

/** 기분 1~5를 모아의 표정으로 */
export const MOOD_FACE: MoaMood[] = ['idle', 'tired', 'sleep', 'idle', 'smile', 'heart'];

/** 지금 기분을 한 번에 고르는 다섯 얼굴 */
export function MoodPicker({ onPicked }: { onPicked?: () => void }) {
  const addMood = useStore((s) => s.addMood);
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <div className="moods" role="group" aria-label="지금 기분">
      {[1, 2, 3, 4, 5].map((v) => (
        <button
          key={v}
          aria-pressed={picked === v}
          aria-label={MOOD_WORDS[v]}
          onClick={() => {
            addMood(v);
            setPicked(v);
            onPicked?.();
          }}
        >
          <Moa size={46} mood={MOOD_FACE[v]} decorative />
          <span>{MOOD_WORDS[v]}</span>
        </button>
      ))}
    </div>
  );
}

/** 기분 기록: 고른 얼굴과 말로 남긴 기분을 날짜별로 */
export function MoodLog({ now }: { now: number }) {
  const notes = useStore((s) => s.notes);
  const moods = notes.filter((n) => n.kind === 'mood').sort((a, b) => b.at - a.at);
  const days: { day: number; items: typeof moods }[] = [];
  for (const m of moods.slice(0, 300)) {
    const d = dayStart(m.at);
    const last = days[days.length - 1];
    if (last && last.day === d) last.items.push(m);
    else days.push({ day: d, items: [m] });
  }
  // 최근 7일 얼굴 줄: 그날 고른 값의 평균
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = dayStart(now) - (6 - i) * DAY;
    const vals = moods.filter((m) => m.value && dayStart(m.at) === d).map((m) => m.value!);
    return { d, v: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null };
  });
  return (
    <>
      <div className="card" style={{ gap: 12 }}>
        <div className="h2">지금 기분은?</div>
        <MoodPicker />
      </div>
      <div className="card" style={{ gap: 8 }}>
        <div className="h2">최근 7일</div>
        <div className="mood-week">
          {week.map(({ d, v }) => (
            <div key={d}>
              {v ? <Moa size={34} mood={MOOD_FACE[v]} /> : <i aria-label="안 남김">–</i>}
              <span>{'일월화수목금토'[new Date(d).getDay()]}</span>
            </div>
          ))}
        </div>
      </div>
      {days.length === 0 && <div className="empty">얼굴을 누르거나 모아에게 "좀 피곤해"처럼 말하면 여기 모여.</div>}
      {days.map(({ day, items }) => (
        <div key={day} className="card" style={{ gap: 6 }}>
          <div className="sub" style={{ fontSize: 13 }}>
            {fmtDayLong(day)}
          </div>
          {items.map((m) => (
            <div key={m.id} className="row" style={{ gap: 10 }}>
              <span className="tag">{fmtHM(m.at)}</span>
              {m.value ? <Moa size={28} mood={MOOD_FACE[m.value]} decorative /> : null}
              <span style={{ fontSize: 15 }}>{m.text}</span>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
