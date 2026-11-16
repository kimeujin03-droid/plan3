import { useState } from 'react';
import { Moa, type MoaMood } from '../components/Moa';
import { StartGrid } from '../components/Pickers';
import { focusCells } from '../lib/focus';
import { activeIntervals } from '../lib/intervals';
import { FOCUS_SHADE, SLEEP_ID } from '../lib/palette';
import { CELL, fmtClock, fmtHM, HOUR } from '../lib/time';
import { useStore } from '../store';

type Mode = 'stopwatch' | 'timer' | 'pomo';
const MODES: { id: Mode; name: string }[] = [
  { id: 'stopwatch', name: '스톱워치' },
  { id: 'timer', name: '타이머' },
  { id: 'pomo', name: '뽀모도로' },
];
const UNRATED = '#D5D9E8';
const R = 130;
const LEN = 2 * Math.PI * R;

/** 가운데에 모아와 숫자가 있는 원. progress(0~1)를 주면 그만큼 채운 한 줄, colors를 주면 10분 여섯 칸. */
function Ring({ colors, progress, digits, label, mood }: { colors?: string[]; progress?: number; digits: string; label: string; mood: MoaMood }) {
  return (
    <div className="ring">
      <svg viewBox="0 0 320 320" fill="none" aria-hidden="true">
        {progress !== undefined ? (
          <>
            <circle cx="160" cy="160" r={R} stroke="#FFFFFF" strokeWidth="22" />
            <circle cx="160" cy="160" r={R} stroke="#26233A" strokeWidth="22" strokeLinecap="round" strokeDasharray={`${Math.max(0.001, Math.min(1, progress)) * LEN} ${LEN}`} transform="rotate(-90 160 160)" />
          </>
        ) : (
          (colors ?? []).map((color, k) => (
            <circle key={k} cx="160" cy="160" r={R} stroke={color} strokeWidth="22" strokeLinecap="round" strokeDasharray="118 698.81" transform={`rotate(${-86 + 60 * k} 160 160)`} />
          ))
        )}
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

/** 이번 작업의 집중도를 하루 격자처럼 10분 칸으로 쌓아 보여준다. 안 누른 칸은 앞의 값이 이어진다. */
function FocusGrid({ activityId, start, now }: { activityId: string; start: number; now: number }) {
  const samples = useStore((s) => s.samples);
  const cells = focusCells(samples, activityId, start, now);
  // 최근 세 시간만, 시간 줄에 맞춰서.
  const lastHour = Math.floor(now / HOUR) * HOUR;
  const firstHour = Math.max(Math.floor(start / HOUR) * HOUR, lastHour - 2 * HOUR);
  const byAt = new Map(cells.map((c) => [c.at, c]));
  const rows: number[] = [];
  for (let h = firstHour; h <= lastHour; h += HOUR) rows.push(h);
  return (
    <div className="focusgrid" role="img" aria-label="이번 작업의 10분별 집중도">
      {rows.map((h) => (
        <div key={h} className="frow">
          <span>{String(new Date(h).getHours()).padStart(2, '0')}</span>
          {Array.from({ length: 6 }, (_, k) => {
            const c = byAt.get(h + k * CELL);
            const isNow = now >= h + k * CELL && now < h + (k + 1) * CELL;
            return (
              <i key={k} data-now={isNow} style={{ background: c ? (c.value ? FOCUS_SHADE[c.value] : UNRATED) : undefined, color: c?.value === 5 ? '#fff' : undefined }}>
                {c?.picked ? c.value : ''}
              </i>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="row" style={{ justifyContent: 'center', gap: 14 }}>
      <button className="icon-btn" aria-label="5분 줄이기" onClick={() => onChange(Math.max(5, value - 5))}>
        −
      </button>
      <div className="jua" style={{ fontSize: 26, minWidth: 84, textAlign: 'center' }}>
        {value}분
      </div>
      <button className="icon-btn" aria-label="5분 늘리기" onClick={() => onChange(Math.min(180, value + 5))}>
        +
      </button>
    </div>
  );
}

/** 시계 화면. 스톱워치·타이머·뽀모도로 중 하나로 시작하고, 도는 동안에는 시간과 집중도를 보여준다. */
export function Clock({ now }: { now: number }) {
  const s = useStore();
  const [mode, setMode] = useState<Mode>('stopwatch');
  const [minutes, setMinutes] = useState(25);
  const [paused, setPaused] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const active = activeIntervals(s.intervals).filter((iv) => iv.activityId !== SLEEP_ID);
  const timer = s.timer;
  const main = (timer && active.find((iv) => iv.activityId === timer.activityId)) || active[0];
  const others = active.filter((iv) => iv !== main);
  const act = (id: string) => s.activities.find((a) => a.id === id);
  const nameOf = (id: string) => act(id)?.name ?? '활동';

  // 뽀모도로의 쉬는 시간: 도는 기록은 없고 타이머만 있다.
  if (!main && timer && (timer.phase === 'break' || timer.phase === 'ready')) {
    const total = timer.breakMinutes * 60_000;
    const left = Math.max(0, timer.phaseStart + total - now);
    const ready = timer.phase === 'ready';
    return (
      <div className="screen" style={{ gap: 16 }}>
        <div>
          <div className="title">{ready ? '다시 해볼까?' : '쉬는 시간'}</div>
          <div className="sub" style={{ fontSize: 14 }}>
            {nameOf(timer.activityId)} · 뽀모도로 {timer.round}번 끝
          </div>
        </div>
        <Ring progress={ready ? 1 : 1 - left / total} digits={ready ? '0:00' : fmtClock(left).replace(/^0:/, '')} label={ready ? '준비되면 눌러줘' : '쉬는 중'} mood="smile" />
        <button className="big-btn ink" onClick={s.nextPomo}>
          {ready ? '다음 집중 시작' : '쉬는 시간 건너뛰고 시작'}
        </button>
        <button className="pill clear" style={{ alignSelf: 'center' }} onClick={s.stopTimer}>
          뽀모도로 그만하기
        </button>
      </div>
    );
  }

  if (!main) {
    return (
      <div className="screen" style={{ gap: 16 }}>
        <div className="seg" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {MODES.map((m) => (
            <button key={m.id} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
              {m.name}
            </button>
          ))}
        </div>
        <Ring
          colors={Array(6).fill('#FFFFFF')}
          digits={mode === 'stopwatch' ? '0:00:00' : `${minutes}:00`}
          label={paused ? `${nameOf(paused)} 쉬는 중` : mode === 'pomo' ? `${minutes}분 집중 · 5분 쉬기` : mode === 'timer' ? '시간이 되면 알려줄게' : '멈춰 있어'}
          mood={paused ? 'smile' : 'idle'}
        />
        {mode !== 'stopwatch' && <Stepper value={minutes} onChange={setMinutes} />}
        {paused && mode === 'stopwatch' && (
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
        <div className="h2">뭘로 시작할까?</div>
        <StartGrid
          now={now}
          onStart={(id) => {
            setPaused(null);
            if (mode === 'stopwatch') s.startActivity(id);
            else s.startTimer(mode, id, minutes);
          }}
        />
      </div>
    );
  }

  const counting = timer && timer.activityId === main.activityId && (timer.phase === 'focus' || timer.phase === 'over') ? timer : null;
  const cells = focusCells(s.samples, main.activityId, main.start, now);
  const current = cells[cells.length - 1];
  let ring: { colors?: string[]; progress?: number; digits: string; label: string };
  if (counting) {
    const total = counting.minutes * 60_000;
    const left = counting.phaseStart + total - now;
    ring =
      left > 0
        ? { progress: 1 - left / total, digits: fmtClock(left).replace(/^0:/, ''), label: counting.mode === 'pomo' ? `뽀모도로 ${counting.round}번째` : `${counting.minutes}분 타이머` }
        : { progress: 1, digits: `+${fmtClock(-left).replace(/^0:/, '')}`, label: `${counting.minutes}분 넘겼어` };
  } else {
    // 이번 한 시간의 10분 여섯 칸. 지난 칸은 (이어진) 집중도 색으로.
    const hourStart = Math.floor(now / HOUR) * HOUR;
    const byAt = new Map(cells.map((c) => [c.at, c]));
    ring = {
      colors: Array.from({ length: 6 }, (_, k) => {
        const cs = hourStart + k * CELL;
        if (cs > now) return '#FFFFFF';
        if (now < cs + CELL) return '#26233A';
        const c = byAt.get(cs);
        return c ? (c.value ? FOCUS_SHADE[c.value] : UNRATED) : '#FFFFFF';
      }),
      digits: fmtClock(now - main.start),
      label: '하는 중',
    };
  }

  return (
    <div className="screen" style={{ gap: 14 }}>
      <div>
        <div className="title">{nameOf(main.activityId)}</div>
        <div className="sub" style={{ fontSize: 14 }}>
          {fmtHM(main.start)}부터{counting ? ` · 지금까지 ${fmtClock(now - main.start)}` : ''}
        </div>
      </div>

      <Ring {...ring} mood="focus" />

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

      <div className="card" style={{ gap: 10, padding: 16 }}>
        <div className="row between">
          <div className="h2">지금 집중 어때?</div>
          <div className="sub" style={{ fontSize: 12 }}>
            안 누르면 앞의 값이 이어져
          </div>
        </div>
        <div className="scores">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} aria-pressed={current?.value === n} style={{ background: FOCUS_SHADE[n], color: n === 5 ? '#fff' : undefined }} onClick={() => s.rateFocus(n)}>
              {n}
            </button>
          ))}
        </div>
        <FocusGrid activityId={main.activityId} start={main.start} now={now} />
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
