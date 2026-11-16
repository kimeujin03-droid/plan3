import { useState } from 'react';
import { Chevron } from '../components/common';
import { Grid } from '../components/Grid';
import { CategoryChips } from '../components/Pickers';
import { addDays, dayStart, fmtDate } from '../lib/time';
import type { PaintMode } from '../lib/types';
import { useStore } from '../store';

const MODES: { id: PaintMode; name: string }[] = [
  { id: 'exec', name: '한 일' },
  { id: 'plan', name: '계획' },
  { id: 'erase', name: '지우개' },
];

export function Today({ now }: { now: number }) {
  const activities = useStore((s) => s.activities);
  const [day, setDay] = useState(() => dayStart(now));
  const [mode, setMode] = useState<PaintMode>('exec');
  const [actId, setActId] = useState(activities[0].id);
  const isToday = day === dayStart(now);
  // 고른 활동이 지워졌으면 첫 활동으로 돌아간다.
  const selected = activities.some((a) => a.id === actId) ? actId : activities[0].id;

  return (
    <>
      <div className="today-top">
        <div className="row between">
          <button className="icon-btn" aria-label="전날" onClick={() => setDay(addDays(day, -1))}>
            <Chevron dir="left" />
          </button>
          <button className="pill jua" style={{ fontSize: 17 }} onClick={() => setDay(dayStart(now))}>
            {fmtDate(day)}
            {isToday ? '' : ' · 오늘로'}
          </button>
          <button className="icon-btn" aria-label="다음 날" onClick={() => setDay(addDays(day, 1))}>
            <Chevron dir="right" />
          </button>
        </div>

        <div className="seg" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {MODES.map((m) => (
            <button key={m.id} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
              {m.name}
            </button>
          ))}
        </div>

        {mode !== 'erase' && <CategoryChips value={selected} onChange={setActId} />}
      </div>

      <div className="screen" style={{ paddingTop: 4 }}>
        <Grid day={day} mode={mode} activityId={selected} now={now} />
      </div>
    </>
  );
}
