import { useEffect, useMemo, useRef, type PointerEvent } from 'react';
import { cellInfo } from '../lib/intervals';
import { soft } from '../lib/palette';
import { CELL, DAY, dayStart } from '../lib/time';
import type { PaintMode } from '../lib/types';
import { useStore } from '../store';

interface Props {
  day: number;
  mode: 'view' | PaintMode;
  activityId: string;
  now: number;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const radius = (joinL: boolean, joinR: boolean) => {
  const l = joinL ? '0' : '9px';
  const r = joinR ? '0' : '9px';
  return `${l} ${r} ${r} ${l}`;
};

export function Grid({ day, mode, activityId, now }: Props) {
  const intervals = useStore((s) => s.intervals);
  const activities = useStore((s) => s.activities);
  const paint = useStore((s) => s.paint);
  const beginStroke = useStore((s) => s.beginStroke);
  const drag = useRef<{ on: boolean; last: number }>({ on: false, last: -1 });
  const nowRow = useRef<HTMLDivElement>(null);
  const isToday = day === dayStart(now);
  const minute = Math.floor(now / 60_000);

  const cells = useMemo(() => {
    const byId = new Map(activities.map((a) => [a.id, a]));
    const dayIv = intervals.filter((iv) => iv.start < day + DAY && (iv.end === null ? now : iv.end) > day);
    const infos = Array.from({ length: 144 }, (_, i) => cellInfo(dayIv, day + i * CELL, now));
    const at = (i: number) => (i >= 0 && i < 144 ? infos[i] : { plan: null, exec: [] as string[] });
    return infos.map((c, i) => {
      const p = at(i - 1);
      const n = at(i + 1);
      const e1 = c.exec[0] ?? null;
      const e2 = c.exec[1] ?? null;
      let label = '';
      let muted = false;
      if (e1 && p.exec[0] !== e1) label = byId.get(e1)?.name ?? '';
      else if (!e1 && c.plan && p.plan !== c.plan) {
        label = byId.get(c.plan)?.name ?? '';
        muted = true;
      }
      return {
        planBg: c.plan ? soft(byId.get(c.plan)?.color ?? '#cccccc') : undefined,
        e1Bg: e1 ? byId.get(e1)?.color : undefined,
        e1R: radius(p.exec[0] === e1, n.exec[0] === e1),
        e2Bg: e2 ? byId.get(e2)?.color : undefined,
        e2R: radius(p.exec[1] === e2, n.exec[1] === e2),
        two: !!e2,
        label,
        muted,
        label2: e2 && p.exec[1] !== e2 ? byId.get(e2)?.name ?? '' : '',
      };
    });
    // 분 단위로만 다시 계산한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervals, activities, day, minute]);

  useEffect(() => {
    nowRow.current?.scrollIntoView({ block: 'start' });
  }, [day]);

  const cellAt = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const col = Math.max(0, Math.min(5, Math.floor(((e.clientX - r.left) / r.width) * 6)));
    const row = Math.max(0, Math.min(23, Math.floor(((e.clientY - r.top) / r.height) * 24)));
    return row * 6 + col;
  };
  const stroke = (e: PointerEvent<HTMLDivElement>) => {
    if (mode === 'view') return;
    const i = cellAt(e);
    if (drag.current.last === i) return;
    drag.current.last = i;
    paint(day + i * CELL, mode, activityId);
  };

  const scrollHour = isToday ? Math.max(0, new Date(now).getHours() - 2) : 7;

  return (
    <div className="daygrid">
      <div className="hours" aria-hidden="true">
        {HOURS.map((h) => (
          <div key={h} ref={h === scrollHour ? nowRow : undefined}>
            {String(h).padStart(2, '0')}
          </div>
        ))}
      </div>
      <div
        className={mode === 'view' ? 'cells' : 'cells painting'}
        role="img"
        aria-label="하루 24시간 격자. 한 시간이 가로 6칸."
        onPointerDown={(e) => {
          if (mode === 'view') return;
          beginStroke();
          drag.current = { on: true, last: -1 };
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* 일부 WebView에서는 실패해도 그리기는 된다 */
          }
          stroke(e);
        }}
        onPointerMove={(e) => {
          if (drag.current.on) stroke(e);
        }}
        onPointerUp={() => {
          drag.current.on = false;
        }}
        onPointerCancel={() => {
          drag.current.on = false;
        }}
      >
        {cells.map((c, i) => (
          <div className="cell" key={i}>
            {c.planBg && <i className="plan" style={{ background: c.planBg }} />}
            {c.e1Bg && (
              <i
                className="e1"
                style={{
                  background: c.e1Bg,
                  borderRadius: c.e1R,
                  // 위쪽 선은 늘 같은 자리에 두고, 둘째 일이 있을 때만 아래를 비워 준다.
                  top: '8%',
                  height: c.two ? '58%' : '80%',
                }}
              />
            )}
            {c.e2Bg && <i className="e2" style={{ background: c.e2Bg, borderRadius: c.e2R }} />}
            {c.label && (
              <span style={{ top: c.two ? 7 : 12, color: c.muted ? '#5b5680' : undefined }}>{c.label}</span>
            )}
            {c.label2 && <span className="l2">{c.label2}</span>}
          </div>
        ))}
        {isToday && <div className="nowline" style={{ top: `${((now - day) / DAY) * 100}%` }} />}
      </div>
    </div>
  );
}
