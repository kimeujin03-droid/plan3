import { useState } from 'react';
import { Moa } from '../components/Moa';
import { StartGrid } from '../components/Pickers';
import { useMoaMood } from '../components/useMoaMood';
import { findGap } from '../lib/gaps';
import { activeIntervals } from '../lib/intervals';
import { SLEEP_ID } from '../lib/palette';
import { dayStart, fmtDate, fmtDur, fmtHM } from '../lib/time';
import { useStore } from '../store';
import { TodoRow } from './Todos';

interface Props {
  now: number;
  onOpenSettings: () => void;
  onOpenTodos: () => void;
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

/** 오늘까지인 할 일을 세 개까지만. 눈앞에 있어야 잊지 않는다. */
function TodayTodos({ now, onOpen }: { now: number; onOpen: () => void }) {
  const todos = useStore((s) => s.todos);
  const today = dayStart(now);
  const due = todos.filter((t) => !t.done && t.due !== null && t.due <= today).sort((a, b) => (a.due ?? 0) - (b.due ?? 0));
  if (!due.length) return null;
  return (
    <div className="card" style={{ gap: 2, padding: '12px 8px 8px 16px' }}>
      <div className="row between" style={{ paddingRight: 8 }}>
        <div className="h2" style={{ fontSize: 15 }}>
          오늘 할 일 · {due.length}개 남음
        </div>
        <button className="pill clear" style={{ minHeight: 32, padding: 0 }} onClick={onOpen}>
          전체 보기
        </button>
      </div>
      {due.slice(0, 3).map((t) => (
        <TodoRow key={t.id} todo={t} now={now} />
      ))}
    </div>
  );
}

const HELLO: Record<string, [string, string]> = {
  sleep: ['수면 기록 중', '일어나면 눌러줘'],
  focus: ['하는 중', '다시 누르면 끝'],
  excited: ['해냈다!', '수고했어'],
  think: ['음…', '알아듣는 중'],
  tired: ['늦었네…', '무리하지 마'],
  idle: ['지금 뭐 해?', '누르면 바로 시작'],
};

export function Home({ now, onOpenSettings, onOpenTodos }: Props) {
  const sleeping = useStore((s) => s.sleeping);
  const say = useStore((s) => s.say);
  const mood = useMoaMood(now);
  const runningName = useStore((s) => {
    const iv = activeIntervals(s.intervals).find((v) => v.activityId !== SLEEP_ID);
    return iv ? s.activities.find((a) => a.id === iv.activityId)?.name : undefined;
  });
  let [hello, sub] = HELLO[mood] ?? HELLO.idle;
  if (mood === 'focus' && runningName) hello = `${runningName} 하는 중`;

  return (
    <div className="screen">
      <div className="row between">
        <div className="jua" style={{ fontSize: 20 }}>
          {fmtDate(now)}
        </div>
        <div className="row" style={{ gap: 8 }}>
          {!sleeping && (
            <button className="pill" aria-label="수면 시작" onClick={() => say('나 잘게')}>
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

      <div className="row" style={{ gap: 14 }}>
        <Moa size={120} mood={mood} pettable charm />
        <div className="grow">
          <div className="jua" style={{ fontSize: 24 }}>
            {hello}
          </div>
          <div className="sub" style={{ fontSize: 14, marginTop: 4 }}>
            {sub}
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
          <TodayTodos now={now} onOpen={onOpenTodos} />
          <GapCard now={now} />
        </>
      )}
    </div>
  );
}
