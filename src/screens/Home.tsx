import { useState } from 'react';
import { Moa } from '../components/Moa';
import { StartGrid } from '../components/Pickers';
import { findGap } from '../lib/gaps';
import { activeIntervals } from '../lib/intervals';
import { SLEEP_ID } from '../lib/palette';
import { fmtDate, fmtDur, fmtHM } from '../lib/time';
import { useStore } from '../store';

interface Props {
  now: number;
  onOpenSettings: () => void;
}

/** 비어 있는 시간을 한 번의 탭으로 채우는 카드. "몰라"를 누르면 그 빈칸은 다시 묻지 않는다. */
function GapCard({ now }: { now: number }) {
  const intervals = useStore((s) => s.intervals);
  const activities = useStore((s) => s.activities);
  const fillGap = useStore((s) => s.fillGap);
  const [skipped, setSkipped] = useState<number[]>([]);
  const gap = findGap(intervals, now);
  if (!gap || skipped.includes(gap.start)) return null;
  return (
    <div className="card" style={{ gap: 8 }}>
      <div className="row between">
        <div style={{ fontSize: 15 }}>
          <span className="jua">
            {fmtHM(gap.start)}–{fmtHM(gap.end)}
          </span>{' '}
          비었어. 뭐 했어?
        </div>
        <button className="pill clear" style={{ padding: '0 4px' }} onClick={() => setSkipped([...skipped, gap.start])}>
          몰라
        </button>
      </div>
      <div className="chips">
        {activities
          .filter((a) => a.id !== SLEEP_ID)
          .map((a) => (
            <button key={a.id} className="chip" style={{ background: a.color }} onClick={() => fillGap(a.id, gap.start, gap.end)} aria-label={`${a.name}(으)로 ${fmtDur(gap.end - gap.start)} 채우기`}>
              {a.name}
            </button>
          ))}
      </div>
    </div>
  );
}

export function Home({ now, onOpenSettings }: Props) {
  const sleeping = useStore((s) => s.sleeping);
  const say = useStore((s) => s.say);
  const working = useStore((s) => activeIntervals(s.intervals).some((iv) => iv.activityId !== SLEEP_ID));

  let hello = '지금 뭐 해?';
  if (sleeping) hello = '쿨쿨…';
  else if (working) hello = '같이 하는 중';

  return (
    <div className="screen">
      <div className="row between">
        <div className="jua" style={{ fontSize: 20 }}>
          {fmtDate(now)}
        </div>
        <div className="row" style={{ gap: 8 }}>
          {!sleeping && (
            <button className="pill" onClick={() => say('나 잘게')}>
              잘게
            </button>
          )}
          <button className="icon-btn" aria-label="설정" onClick={onOpenSettings}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <line x1="2" y1="5" x2="16" y2="5" />
              <line x1="2" y1="13" x2="16" y2="13" />
              <circle cx="6" cy="5" r="2" fill="#fff" />
              <circle cx="12" cy="13" r="2" fill="#fff" />
            </svg>
          </button>
        </div>
      </div>

      <div className="row" style={{ gap: 16, marginTop: 4 }}>
        <Moa size={7.5} bob={!sleeping && !working} closed={sleeping || working} />
        <div className="grow">
          <div className="jua" style={{ fontSize: 24 }}>
            {hello}
          </div>
          <div className="sub" style={{ fontSize: 14, marginTop: 4 }}>
            {sleeping ? '일어나면 눌러줘' : '누르면 바로 시작, 다시 누르면 끝'}
          </div>
        </div>
      </div>

      {sleeping ? (
        <button className="big-btn" style={{ background: '#FFE169' }} onClick={() => say('나 일어났어')}>
          일어났어
        </button>
      ) : (
        <>
          <StartGrid now={now} />
          <GapCard now={now} />
        </>
      )}
    </div>
  );
}
