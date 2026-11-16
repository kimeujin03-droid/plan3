import { useState } from 'react';
import { Moa, type MoaMood } from '../components/Moa';
import { StartGrid } from '../components/Pickers';
import { activeIntervals } from '../lib/intervals';
import { FOCUS_SHADE, SLEEP_ID } from '../lib/palette';
import { CELL, fmtClock, fmtHM, HOUR } from '../lib/time';
import { useStore } from '../store';

const UNRATED = '#D5D9E8';

function Ring({ colors, digits, label, mood }: { colors: string[]; digits: string; label: string; mood: MoaMood }) {
  return (
    <div className="ring">
      <svg viewBox="0 0 320 320" fill="none" role="img" aria-label="이번 한 시간의 10분 칸 여섯 개">
        {colors.map((color, k) => (
          <circle key={k} cx="160" cy="160" r="130" stroke={color} strokeWidth="22" strokeLinecap="round" strokeDasharray="118 698.81" transform={`rotate(${-86 + 60 * k} 160 160)`} />
        ))}
      </svg>
      <div className="center">
        <Moa size={56} mood={mood} />
        <div className="digits">{digits}</div>
        <div className="sub" style={{ fontSize: 14 }}>
          {label}
        </div>
      </div>
    </div>
  );
}

/** 스톱워치 화면. 아무것도 안 돌고 있으면 시작할 일을 고르고, 돌고 있으면 시계와 집중도를 보여준다. */
export function Clock({ now }: { now: number }) {
  const s = useStore();
  const [paused, setPaused] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const active = activeIntervals(s.intervals).filter((iv) => iv.activityId !== SLEEP_ID);
  const main = active[0];
  const others = active.slice(1);
  const act = (id: string) => s.activities.find((a) => a.id === id);
  const nameOf = (id: string) => act(id)?.name ?? '활동';

  if (!main) {
    return (
      <div className="screen" style={{ gap: 16 }}>
        <div className="title">시계</div>
        <Ring colors={Array(6).fill('#FFFFFF')} digits="0:00:00" label={paused ? `${nameOf(paused)} 쉬는 중` : '멈춰 있어'} mood={paused ? 'smile' : 'idle'} />
        {paused && (
          <button
            className="big-btn ink"
            onClick={() => {
              s.startActivity(paused);
              setPaused(null);
            }}
          >
            {nameOf(paused)} 이어하기
          </button>
        )}
        <StartGrid now={now} />
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
  const lastCell = Math.floor(now / CELL) * CELL;
  const picked = focusIn(lastCell, lastCell + CELL);

  return (
    <div className="screen" style={{ gap: 14 }}>
      <div className="row between">
        <div>
          <div className="title">{nameOf(main.activityId)}</div>
          <div className="sub" style={{ fontSize: 14 }}>
            {fmtHM(main.start)}부터
          </div>
        </div>
      </div>

      <Ring colors={ring} digits={fmtClock(now - main.start)} label="하는 중" mood="focus" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <button
          className="big-btn"
          onClick={() => {
            setPaused(main.activityId);
            s.endActivity(main.activityId);
          }}
        >
          잠깐 쉬기
        </button>
        <button className="big-btn ink" onClick={() => s.endActivity(main.activityId)}>
          {others.length ? `${nameOf(main.activityId)} 끝` : '끝났어'}
        </button>
      </div>

      {others.map((iv) => (
        <div key={iv.id} className="row" style={{ background: act(iv.activityId)?.color, borderRadius: 22, padding: '8px 8px 8px 18px' }}>
          <div className="grow">
            <div style={{ fontSize: 12 }}>같이 하는 중</div>
            <div style={{ fontSize: 15 }}>
              {nameOf(iv.activityId)} · {fmtClock(now - iv.start)}
            </div>
          </div>
          <button className="pill" onClick={() => s.endActivity(iv.activityId)}>
            {nameOf(iv.activityId)}만 끝
          </button>
        </div>
      ))}

      <div>
        <div className="row between" style={{ marginBottom: 8 }}>
          <div className="h2">지금 집중 어때?</div>
          <div className="sub" style={{ fontSize: 12 }}>
            안 눌러도 돼
          </div>
        </div>
        <div className="scores">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} aria-pressed={picked === n} style={{ background: FOCUS_SHADE[n], color: n === 5 ? '#fff' : undefined }} onClick={() => s.rateFocus(n)}>
              {n}
            </button>
          ))}
        </div>
      </div>

      {others.length === 0 &&
        (adding ? (
          <StartGrid now={now} />
        ) : (
          <button className="pill clear" style={{ alignSelf: 'center' }} onClick={() => setAdding(true)}>
            + 같이 하는 일
          </button>
        ))}
    </div>
  );
}
