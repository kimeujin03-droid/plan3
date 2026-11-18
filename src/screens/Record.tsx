import { useState } from 'react';
import { Chevron } from '../components/common';
import { Grid } from '../components/Grid';
import { MemoSheet } from '../components/MemoSheet';
import { CategoryChips } from '../components/Pickers';
import { addDays, CELL, dayStart, fmtDate, fmtHM } from '../lib/time';
import type { Memory } from '../lib/types';
import { useStore } from '../store';
import { Review } from './Review';

type View = 'day' | 'stats';
type Kind = 'exec' | 'plan' | 'say';

const VIEWS: { id: View; name: string }[] = [
  { id: 'day', name: '하루' },
  { id: 'stats', name: '돌아보기' },
];

const KINDS: { id: Kind; name: string }[] = [
  { id: 'exec', name: '한 일' },
  { id: 'plan', name: '계획' },
  { id: 'say', name: '한마디' },
];

function Eraser({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button className="icon-btn eraser" aria-label={`${label} 지우개`} aria-pressed={on} onClick={onToggle}>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 16.5l-4.6-4.6a1.4 1.4 0 0 1 0-2L10 3.3a1.4 1.4 0 0 1 2 0l4.7 4.7a1.4 1.4 0 0 1 0 2L10.2 16.5z" />
        <path d="M7 6.5l6.5 6.5" />
        <path d="M6 16.5h11" />
      </svg>
    </button>
  );
}

interface Open {
  from: number;
  to: number;
  memory: Memory | null;
}

export function Record({ now }: { now: number }) {
  const activities = useStore((s) => s.activities);
  const [view, setView] = useState<View>('day');
  const [day, setDay] = useState(() => dayStart(now));
  const [kind, setKind] = useState<Kind>('exec');
  // 지우개는 지금 고른 종류만 지운다: 한 일이면 한 일만, 계획이면 계획만.
  const [erasing, setErasing] = useState(false);
  const [actId, setActId] = useState(activities[0].id);
  // 한마디: 먼저 누른 칸
  const [anchor, setAnchor] = useState<number | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const selected = activities.some((a) => a.id === actId) ? actId : activities[0].id;
  const isNow = dayStart(now) === day;
  const say = kind === 'say';

  return (
    <>
      <div className="today-top">
        <div className="seg" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          {VIEWS.map((v) => (
            <button
              key={v.id}
              aria-pressed={view === v.id}
              onClick={() => {
                setView(v.id);
                setErasing(false);
              }}
            >
              {v.name}
            </button>
          ))}
        </div>

        {view === 'day' && (
          <>
            <div className="datebar">
              <button aria-label="전날" onClick={() => setDay(addDays(day, -1))}>
                <Chevron dir="left" />
              </button>
              <button className="jua grow" onClick={() => setDay(dayStart(now))}>
                {fmtDate(day)}
                {!isNow && <span className="back">오늘로</span>}
              </button>
              <button aria-label="다음 날" onClick={() => setDay(addDays(day, 1))}>
                <Chevron dir="right" />
              </button>
            </div>

            <div className="row" style={{ gap: 8 }}>
              <div className="seg thin grow" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                {KINDS.map((k) => (
                  <button
                    key={k.id}
                    aria-pressed={kind === k.id}
                    onClick={() => {
                      setKind(k.id);
                      setAnchor(null);
                      if (k.id === 'say') setErasing(false);
                    }}
                  >
                    {k.name}
                  </button>
                ))}
              </div>
              {!say && <Eraser on={erasing} label={kind === 'plan' ? '계획' : '한 일'} onToggle={() => setErasing(!erasing)} />}
            </div>

            {erasing && <div className="erase-note">{kind === 'plan' ? '계획' : '한 일'}만 지우는 중 · 지우개를 다시 누르면 꺼져</div>}
            {!erasing && !say && <CategoryChips value={selected} onChange={setActId} />}
            <div className="hint">
              {say ? (
                anchor === null ? (
                  '이 시간 어떻게 보냈어? 시작 칸 톡, 끝 칸 톡 (옆으로 문질러도 돼)'
                ) : (
                  <>
                    {fmtHM(day + anchor * CELL)}부터… 이제 끝 칸을 톡
                    <button className="pill clear" style={{ minHeight: 28, padding: '0 0 0 8px' }} onClick={() => setAnchor(null)}>
                      취소
                    </button>
                  </>
                )
              ) : (
                '옆으로 문지르면 칠해져 · 꾸욱 누르면 한마디'
              )}
            </div>
          </>
        )}
      </div>

      {view === 'day' && (
        <div className="screen" style={{ paddingTop: 0 }}>
          <Grid
            day={day}
            kind={kind === 'plan' ? 'plan' : 'exec'}
            erasing={erasing}
            activityId={selected}
            now={now}
            select={say}
            anchor={anchor}
            onTapCell={(i) => {
              if (anchor === null) setAnchor(i);
              else {
                setOpen({ from: Math.min(anchor, i), to: Math.max(anchor, i), memory: null });
                setAnchor(null);
              }
            }}
            onMemo={(from, to, memory) => {
              setAnchor(null);
              setOpen({ from, to, memory });
            }}
          />
        </div>
      )}
      {view === 'stats' && <Review now={now} />}
      {open && (
        <MemoSheet
          key={`${day}-${open.from}-${open.to}-${open.memory?.id ?? ''}`}
          day={day}
          from={day + open.from * CELL}
          to={day + (open.to + 1) * CELL}
          memory={open.memory}
          now={now}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
