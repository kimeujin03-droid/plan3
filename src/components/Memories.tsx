import { fmtDayLong, fmtDur, fmtHM, dayStart } from '../lib/time';
import type { Memory } from '../lib/types';
import { MOOD_WORDS, useStore } from '../store';
import { Moa } from './Moa';
import { MOOD_FACE } from './MoodLog';
import { Photo } from './Photo';

/** 기억 하나: 시간, 활동, 글, 장소·사람, 기분, 사진 */
export function MemoryCard({ m, onRemove }: { m: Memory; onRemove?: () => void }) {
  const act = useStore((s) => s.activities.find((a) => a.id === m.activityId));
  const plan = useStore((s) => (m.todoId ? s.todos.find((t) => t.id === m.todoId) : undefined));
  return (
    <div className="memory">
      <div className="row" style={{ gap: 8 }}>
        <span className="tag">
          {fmtHM(m.start)}–{fmtHM(m.end)}
        </span>
        {act && (
          <span className="chip small" style={{ background: act.color }}>
            {act.name}
          </span>
        )}
        <span className="sub grow" style={{ fontSize: 12 }}>
          {fmtDur(m.end - m.start)}
        </span>
        {m.mood && <Moa size={30} mood={MOOD_FACE[m.mood]} decorative />}
        {onRemove && (
          <button className="step-x" aria-label="기억 지우기" onClick={onRemove}>
            ×
          </button>
        )}
      </div>
      {m.text && <div className="memory-text">{m.text}</div>}
      {(m.place || m.people || m.mood || plan) && (
        <div className="todo-meta">
          {m.place && <span className="place">{m.place}</span>}
          {m.people && <span>{m.people}랑</span>}
          {m.mood && <span>{MOOD_WORDS[m.mood]}</span>}
          {plan && <span>계획: {plan.text}</span>}
        </div>
      )}
      {m.photos.length > 0 && (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {m.photos.map((p) => (
            <Photo key={p} refPath={p} size={84} />
          ))}
        </div>
      )}
    </div>
  );
}

/** 돌아보기 › 추억: 남긴 기억을 날짜별로(최근부터) */
export function MemoryList() {
  const memories = useStore((s) => s.memories);
  const remove = useStore((s) => s.removeMemory);
  const sorted = [...memories].sort((a, b) => b.start - a.start);
  const days: { day: number; items: Memory[] }[] = [];
  for (const m of sorted) {
    const d = dayStart(m.start);
    const last = days[days.length - 1];
    if (last && last.day === d) last.items.push(m);
    else days.push({ day: d, items: [m] });
  }
  if (!days.length) return <div className="empty">기록 › 하루 › 구간에서 시간을 고르면, 그 시간에 있었던 일을 글·사진으로 남길 수 있어.</div>;
  return (
    <>
      {days.map(({ day, items }) => (
        <div key={day} className="card" style={{ gap: 10 }}>
          <div className="sub" style={{ fontSize: 13 }}>
            {fmtDayLong(day)}
          </div>
          {items.map((m) => (
            <MemoryCard key={m.id} m={m} onRemove={() => remove(m.id)} />
          ))}
        </div>
      ))}
    </>
  );
}
