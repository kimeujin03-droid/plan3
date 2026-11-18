import { useState } from 'react';
import { activeIntervals } from '../lib/intervals';
import { SLEEP_ID } from '../lib/palette';
import { fmtClock } from '../lib/time';
import type { Activity } from '../lib/types';
import { useStore } from '../store';
import { Icon } from './Icons';

function Caret({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform 0.15s', flex: 'none' }}>
      <polyline points="4,2 8,6 4,10" />
    </svg>
  );
}

function useGroups() {
  const activities = useStore((s) => s.activities);
  const tops = activities.filter((a) => !a.parentId && a.id !== SLEEP_ID);
  const childrenOf = (id: string) => activities.filter((a) => a.parentId === id);
  return { activities, tops, childrenOf };
}

/**
 * 한 번 누르면 바로 시작하고, 돌고 있는 걸 누르면 끝나는 스톱워치 버튼 묶음.
 * 하위 활동이 있는 대주제는 이름을 누르면 바로 시작하고, 옆 화살표를 누르면 세부 항목이 열린다.
 */
export function StartGrid({ now, onStart }: { now: number; onStart?: (activityId: string) => void }) {
  const { tops, childrenOf } = useGroups();
  const intervals = useStore((s) => s.intervals);
  const startNow = useStore((s) => s.startActivity);
  const start = onStart ?? startNow;
  const end = useStore((s) => s.endActivity);
  const [open, setOpen] = useState<string | null>(null);
  const running = new Map(activeIntervals(intervals).map((iv) => [iv.activityId, iv]));

  return (
    <div className="startgrid">
      {tops.map((top) => {
        const kids = childrenOf(top.id);
        const live: Activity | undefined = [top, ...kids].find((a) => running.has(a.id));
        if (live) {
          return (
            <button key={top.id} className="start live" style={{ background: live.color }} onClick={() => end(live.id)} aria-label={`${live.name} 끝내기`}>
              <span className="grow" style={{ textAlign: 'left' }}>
                {live.name}
              </span>
              <span className="jua">{fmtClock(now - running.get(live.id)!.start)}</span>
              <span className="stop" aria-hidden="true" />
            </button>
          );
        }
        if (!kids.length) {
          return (
            <button key={top.id} className="start" style={{ background: top.color }} onClick={() => start(top.id)}>
              <Icon name={top.id} />
              {top.name}
            </button>
          );
        }
        const isOpen = open === top.id;
        return [
          <div key={top.id} className="start split" style={{ background: top.color }}>
            <button className="grow" onClick={() => { start(top.id); setOpen(null); }} aria-label={`${top.name} 시작`}>
              <Icon name={top.id} />
              {top.name}
            </button>
            <button className="more" aria-expanded={isOpen} aria-label={`${top.name} 세부 항목`} onClick={() => setOpen(isOpen ? null : top.id)}>
              <Caret open={isOpen} />
            </button>
          </div>,
          isOpen && (
            <div key={`${top.id}-kids`} className="kids">
              {kids.map((k) => (
                <button key={k.id} className="chip" style={{ background: k.color }} onClick={() => { start(k.id); setOpen(null); }}>
                  {k.name}
                </button>
              ))}
            </div>
          ),
        ];
      })}
    </div>
  );
}

/** 칠할 활동 고르기: 윗줄은 대주제, 고른 대주제에 하위가 있으면 아랫줄이 열린다. */
export function CategoryChips({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { activities, tops, childrenOf } = useGroups();
  const current = activities.find((a) => a.id === value);
  const rootId = current?.parentId ?? value;
  const [folded, setFolded] = useState(false);
  const kids = folded ? [] : childrenOf(rootId);
  const sleep = activities.find((a) => a.id === SLEEP_ID);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="chips" role="group" aria-label="대주제">
        {[...tops, ...(sleep ? [sleep] : [])].map((a) => (
          <button
            key={a.id}
            className="chip"
            style={{ background: a.color }}
            aria-pressed={rootId === a.id}
            aria-expanded={childrenOf(a.id).length > 0 ? rootId === a.id && !folded : undefined}
            onClick={() => {
              // 이미 고른 대주제를 다시 누르면 하위 줄을 접었다 폈다 한다.
              if (rootId === a.id && childrenOf(a.id).length > 0) setFolded(!folded);
              else {
                setFolded(false);
                onChange(a.id);
              }
            }}
          >
            {a.name}
            {childrenOf(a.id).length > 0 && <Caret open={rootId === a.id && !folded} />}
          </button>
        ))}
      </div>
      {kids.length > 0 && (
        <div className="chips sub-chips" role="group" aria-label="하위 활동">
          {kids.map((k) => (
            <button key={k.id} className="chip" style={{ background: k.color }} aria-pressed={value === k.id} onClick={() => onChange(k.id)}>
              {k.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
