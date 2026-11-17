import { useMemo, useState } from 'react';
import { logicalToday } from '../lib/day';
import { pickNext } from '../lib/next';
import { useStore } from '../store';
import { Moa } from './Moa';
import { CategoryChips } from './Pickers';

const LENGTHS = [10, 25, 50];

/**
 * "지금 뭐 하지?": 하나만 보여준다. 고르는 데 힘 빼지 않게.
 * 시작을 누르면 그 활동으로 타이머가 바로 돈다. 쪼갠 단계가 있으면 첫 단계만 보여준다.
 */
export function NextSheet({ now, onClose }: { now: number; onClose: () => void }) {
  const todos = useStore((s) => s.todos);
  const intervals = useStore((s) => s.intervals);
  const activities = useStore((s) => s.activities);
  const startTimer = useStore((s) => s.startTimer);
  const linkTodo = useStore((s) => s.linkTodo);
  // 처음 열 때의 목록으로 고정: 보는 동안 순서가 바뀌지 않게.
  const picks = useMemo(() => pickNext(todos, intervals, activities, logicalToday(now, intervals), now), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0);
  const [minutes, setMinutes] = useState(25);
  const pick = picks[i % Math.max(1, picks.length)];
  const [actId, setActId] = useState<string | null>(pick?.activityId ?? null);
  const step = pick?.todo.steps?.find((s) => !s.done);

  return (
    <div className="sheet-back" onPointerDown={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="지금 할 일" onPointerDown={(e) => e.stopPropagation()}>
        {!pick ? (
          <>
            <div className="row" style={{ gap: 12 }}>
              <Moa size={72} mood="smile" decorative />
              <div className="grow">
                <div className="jua" style={{ fontSize: 20 }}>
                  급한 건 없어!
                </div>
                <div className="sub">계획에 적어두면 여기서 골라줄게. 아니면 그냥 쉬어도 돼.</div>
              </div>
            </div>
            <button className="big-btn" onClick={onClose}>
              알겠어
            </button>
          </>
        ) : (
          <>
            <div className="row" style={{ gap: 12 }}>
              <Moa size={72} mood="cheer" decorative />
              <div className="grow">
                <div className="sub" style={{ fontSize: 13 }}>
                  이거 하자
                </div>
                <div className="jua" style={{ fontSize: 22 }}>
                  {pick.todo.text}
                </div>
                <div className="sub" style={{ fontSize: 13 }}>
                  {pick.why}
                </div>
              </div>
            </div>
            {step && (
              <div className="next-step">
                첫 단계: <b>{step.text}</b>
              </div>
            )}
            <div className="sub" style={{ fontSize: 13 }}>
              무엇으로 적을까?
            </div>
            <CategoryChips value={actId ?? ''} onChange={setActId} />
            <div className="seg thin" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', background: 'var(--bg)' }}>
              {LENGTHS.map((m) => (
                <button key={m} aria-pressed={minutes === m} onClick={() => setMinutes(m)}>
                  {m}분만
                </button>
              ))}
            </div>
            <button
              className="big-btn ink"
              disabled={!actId}
              onClick={() => {
                if (!actId) return;
                if (!pick.todo.activityId) linkTodo(pick.todo.id, actId);
                startTimer('timer', actId, minutes);
                onClose();
              }}
            >
              {actId ? `${minutes}분 시작` : '무엇으로 적을지 골라줘'}
            </button>
            {picks.length > 1 && (
              <button
                className="pill clear"
                style={{ alignSelf: 'center' }}
                onClick={() => {
                  const next = picks[(i + 1) % picks.length];
                  setI(i + 1);
                  setActId(next.activityId);
                }}
              >
                다른 거 ({((i + 1) % picks.length) + 1}/{picks.length})
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
