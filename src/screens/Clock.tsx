import { useState } from 'react';
import { Moa } from '../components/Moa';
import { intentProgress } from '../lib/intents';
import { activeIntervals } from '../lib/intervals';
import { FOCUS_SHADE, SLEEP_ID } from '../lib/palette';
import { CELL, fmtClock, fmtHM, HOUR, startedAfter } from '../lib/time';
import { useStore } from '../store';

const UNRATED = '#D5D9E8';

export function Clock({ now, onClose }: { now: number; onClose: () => void }) {
  const s = useStore();
  const [paused, setPaused] = useState<string | null>(null);
  const active = activeIntervals(s.intervals).filter((iv) => iv.activityId !== SLEEP_ID);
  const main = active[0];
  const others = active.slice(1);
  const nameOf = (id: string) => s.activities.find((a) => a.id === id)?.name ?? '활동';

  if (!main) {
    return (
      <div className="overlay">
        <div className="screen" style={{ justifyContent: 'center', alignItems: 'center', gap: 20 }}>
          <Moa size={10} closed={false} />
          <div className="jua" style={{ fontSize: 22 }}>
            {paused ? `${nameOf(paused)} 쉬는 중` : '지금 하는 중인 게 없어'}
          </div>
          {paused && (
            <button
              className="big-btn ink"
              style={{ width: '100%' }}
              onClick={() => {
                s.startActivity(paused);
                setPaused(null);
              }}
            >
              이어하기
            </button>
          )}
          <button className="big-btn" style={{ width: '100%' }} onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    );
  }

  const focusIn = (from: number, to: number) => {
    let v: number | null = null;
    for (const sm of s.samples) {
      if (sm.kind === 'focus' && sm.at >= from && sm.at < to && sm.activityId === main.activityId) v = sm.value;
    }
    return v;
  };

  const hourStart = Math.floor(now / HOUR) * HOUR;
  const ring = Array.from({ length: 6 }, (_, k) => {
    const cs = hourStart + k * CELL;
    if (cs > now) return '#FFFFFF';
    if (now < cs + CELL) return '#26233A';
    if (main.start >= cs + CELL) return '#FFFFFF';
    const f = focusIn(cs, cs + CELL);
    return f ? FOCUS_SHADE[f] : UNRATED;
  });

  const firstCell = Math.floor(main.start / CELL) * CELL;
  const count = Math.min(18, Math.floor((now - firstCell) / CELL) + 1);
  const lastCell = Math.floor(now / CELL) * CELL;
  const strip = Array.from({ length: count }, (_, i) => {
    const cs = lastCell - (count - 1 - i) * CELL;
    return { cs, f: focusIn(cs, cs + CELL), current: cs === lastCell };
  });
  const picked = focusIn(lastCell, lastCell + CELL);

  const intent = s.intents.find((it) => it.activityId === main.activityId);
  const prog = intent ? intentProgress(intent, s.intervals, now) : null;
  const waited =
    prog && prog.firstAttemptAt !== null && prog.firstAttemptAt >= main.start - 1000
      ? `하려던 일 · ${startedAfter(prog.firstAttemptAt - prog.firstMention)}`
      : null;

  return (
    <div className="overlay">
      <div className="screen" style={{ gap: 16 }}>
        <div className="row">
          <Moa size={3.9} closed mini />
          <div className="grow">
            <div className="jua" style={{ fontSize: 18 }}>
              {nameOf(main.activityId)}
            </div>
            <div className="sub" style={{ fontSize: 14 }}>
              {fmtHM(main.start)}부터{waited ? ` · ${waited}` : ''}
            </div>
          </div>
          <button className="pill" onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="ring">
          <svg viewBox="0 0 320 320" fill="none" role="img" aria-label="이번 한 시간의 10분 칸 여섯 개">
            {ring.map((color, k) => (
              <circle
                key={k}
                cx="160"
                cy="160"
                r="130"
                stroke={color}
                strokeWidth="22"
                strokeLinecap="round"
                strokeDasharray="118 698.81"
                transform={`rotate(${-86 + 60 * k} 160 160)`}
              />
            ))}
          </svg>
          <div className="center">
            <div className="digits">{fmtClock(now - main.start)}</div>
            <div className="sub" style={{ fontSize: 14 }}>
              하는 중
            </div>
          </div>
        </div>
        <div className="sub" style={{ textAlign: 'center', fontSize: 12 }}>
          바깥 고리 = 이번 한 시간, 10분마다 한 칸 · 진할수록 집중
        </div>

        {others.map((iv) => (
          <div key={iv.id} className="row" style={{ background: s.activities.find((a) => a.id === iv.activityId)?.color, borderRadius: 22, padding: '8px 8px 8px 18px' }}>
            <div className="grow">
              <div style={{ fontSize: 12 }}>같이 하는 중</div>
              <div style={{ fontSize: 15 }}>
                {nameOf(iv.activityId)} · {fmtClock(now - iv.start)}
              </div>
            </div>
            <button className="pill" onClick={() => s.endActivity(iv.activityId)}>
              끝났어
            </button>
          </div>
        ))}

        <div>
          <div className="h2" style={{ marginBottom: 8 }}>
            지금 집중 어때?
          </div>
          <div className="scores">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                aria-pressed={picked === n}
                style={{ background: FOCUS_SHADE[n], color: n === 5 ? '#fff' : undefined }}
                onClick={() => s.rateFocus(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div className="row between">
            <div className="h2">이번 세션</div>
            <div className="sub" style={{ fontSize: 12 }}>
              10분마다 한 칸 · 빈칸은 안 적은 칸
            </div>
          </div>
          <div className="strip">
            {strip.map((c) => (
              <div
                key={c.cs}
                style={{
                  background: c.f ? FOCUS_SHADE[c.f] : 'transparent',
                  color: c.f === 5 ? '#fff' : undefined,
                  boxShadow: c.current ? 'inset 0 0 0 2px #26233A' : undefined,
                }}
              >
                {c.f ?? ''}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 'auto' }}>
          <button
            className="big-btn"
            onClick={() => {
              setPaused(main.activityId);
              s.endActivity(main.activityId);
            }}
          >
            잠깐 쉬기
          </button>
          <button
            className="big-btn ink"
            onClick={() => {
              s.endActivity(main.activityId);
              if (!others.length) onClose();
            }}
          >
            끝났어
          </button>
        </div>
      </div>
    </div>
  );
}
