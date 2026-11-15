import { useState } from 'react';
import { Chevron, LastReply } from '../components/common';
import { Grid } from '../components/Grid';
import { activeIntervals } from '../lib/intervals';
import { SLEEP_ID } from '../lib/palette';
import { addDays, dayStart, fmtClock, fmtDate } from '../lib/time';
import type { PaintMode } from '../lib/types';
import { useStore } from '../store';

export type TodayMode = 'view' | PaintMode;

interface Props {
  now: number;
  mode: TodayMode;
  setMode: (m: TodayMode) => void;
  onOpenClock: () => void;
}

const MODES: { id: TodayMode; name: string }[] = [
  { id: 'view', name: '보기' },
  { id: 'plan', name: '계획' },
  { id: 'exec', name: '실행' },
  { id: 'erase', name: '지우개' },
];

export function Today({ now, mode, setMode, onOpenClock }: Props) {
  const activities = useStore((s) => s.activities);
  const intervals = useStore((s) => s.intervals);
  const [day, setDay] = useState(() => dayStart(now));
  const [actId, setActId] = useState(activities[1]?.id ?? activities[0].id);
  const active = activeIntervals(intervals).filter((iv) => iv.activityId !== SLEEP_ID);
  const byId = new Map(activities.map((a) => [a.id, a]));
  const isToday = day === dayStart(now);

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

      <div className="seg" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        {MODES.map((m) => (
          <button key={m.id} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
            {m.name}
          </button>
        ))}
      </div>

      {(mode === 'plan' || mode === 'exec') && (
        <div className="chips">
          {activities.map((a) => (
            <button
              key={a.id}
              className="chip"
              style={{ background: a.color }}
              aria-pressed={actId === a.id}
              onClick={() => setActId(a.id)}
            >
              {a.name}
            </button>
          ))}
        </div>
      )}

      <div className="sub">
        {mode === 'view' && '보기에서는 화면이 스크롤돼. 칠하려면 계획이나 실행을 골라줘.'}
        {mode === 'plan' && '문지르면 칸 전체가 연하게 칠해져. 스크롤은 왼쪽 시간 줄을 잡고.'}
        {mode === 'exec' && '한 칸에 2개까지. 둘째는 아래 30%에 들어가.'}
        {mode === 'erase' && '문지른 칸의 계획과 실행을 지워.'}
      </div>

      <LastReply now={now} />

      {active.length > 0 && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {active.map((iv) => (
            <button key={iv.id} className="pill" style={{ background: byId.get(iv.activityId)?.color }} onClick={onOpenClock}>
              {byId.get(iv.activityId)?.name}
              <span className="jua">{fmtClock(now - iv.start)}</span>
            </button>
          ))}
        </div>
      )}
      </div>

      <div className="screen" style={{ paddingTop: 4 }}>
        <Grid day={day} mode={mode} activityId={actId} now={now} />
      </div>
    </>
  );
}
