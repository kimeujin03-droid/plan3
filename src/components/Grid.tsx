import { useEffect, useMemo, useRef, type PointerEvent } from 'react';
import { cellInfo } from '../lib/intervals';
import { soft } from '../lib/palette';
import { CELL, DAY, dayStart } from '../lib/time';
import type { PaintMode } from '../lib/types';
import { useStore } from '../store';

interface Props {
  day: number;
  /** 'note'면 칠하지 않고, 누른 칸을 onPickCell로 알려준다. */
  mode: PaintMode | 'note';
  onPickCell?: (cellStart: number) => void;
  activityId: string;
  now: number;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const radius = (joinL: boolean, joinR: boolean) => {
  const l = joinL ? '0' : '9px';
  const r = joinR ? '0' : '9px';
  return `${l} ${r} ${r} ${l}`;
};

export function Grid({ day, mode, activityId, now, onPickCell }: Props) {
  const intervals = useStore((s) => s.intervals);
  const activities = useStore((s) => s.activities);
  const paint = useStore((s) => s.paint);
  const cellNotes = useStore((s) => s.cellNotes);
  const beginStroke = useStore((s) => s.beginStroke);
  // 손가락이 닿은 뒤 가로로 움직이기 시작해야 칠한다. 세로로 움직이면 브라우저가 스크롤로 가져간다.
  const drag = useRef<{ down: boolean; on: boolean; last: number; x: number; y: number; first: number }>({
    down: false,
    on: false,
    last: -1,
    x: 0,
    y: 0,
    first: -1,
  });
  const nowRow = useRef<HTMLDivElement>(null);
  const isToday = day === dayStart(now);
  const minute = Math.floor(now / 60_000);

  const cells = useMemo(() => {
    const byId = new Map(activities.map((a) => [a.id, a]));
    const dayIv = intervals.filter((iv) => iv.start < day + DAY && (iv.end === null ? now : iv.end) > day);
    const infos = Array.from({ length: 144 }, (_, i) => cellInfo(dayIv, day + i * CELL, now));
    const at = (i: number) => (i >= 0 && i < 144 ? infos[i] : { plan: null, exec: [] as string[] });
    const notes = new Map<number, string>();
    for (const n of cellNotes) {
      const i = Math.floor((n.at - day) / CELL);
      if (i >= 0 && i < 144) notes.set(i, n.text);
    }
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
        note: notes.get(i) ?? '',
      };
    });
    // 분 단위로만 다시 계산한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervals, activities, cellNotes, day, minute]);

  useEffect(() => {
    nowRow.current?.scrollIntoView({ block: 'start' });
  }, [day]);

  const cellAt = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const col = Math.max(0, Math.min(5, Math.floor(((e.clientX - r.left) / r.width) * 6)));
    const row = Math.max(0, Math.min(23, Math.floor(((e.clientY - r.top) / r.height) * 24)));
    return row * 6 + col;
  };
  const paintAt = (i: number) => {
    if (mode === 'note' || drag.current.last === i) return;
    drag.current.last = i;
    paint(day + i * CELL, mode, activityId);
  };
  const begin = (e: PointerEvent<HTMLDivElement>) => {
    drag.current.on = true;
    beginStroke();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* 일부 WebView에서는 실패해도 그리기는 된다 */
    }
    paintAt(drag.current.first);
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
        className="cells"
        role="img"
        aria-label="하루 24시간 격자. 한 시간이 가로 6칸."
        onPointerDown={(e) => {
          drag.current = { down: true, on: false, last: -1, x: e.clientX, y: e.clientY, first: cellAt(e) };
          // 마우스는 스크롤과 헷갈릴 일이 없으니 바로 칠한다.
          if (e.pointerType === 'mouse' && mode !== 'note') begin(e);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d.down || mode === 'note') return;
          if (!d.on) {
            const dx = Math.abs(e.clientX - d.x);
            const dy = Math.abs(e.clientY - d.y);
            if (dx < 8 || dx < dy) return;
            begin(e);
          }
          paintAt(cellAt(e));
        }}
        onPointerUp={() => {
          const d = drag.current;
          // 움직이지 않고 뗐으면 한 칸 톡 누른 것.
          if (d.down && !d.on) {
            if (mode === 'note') onPickCell?.(day + d.first * CELL);
            else {
              beginStroke();
              paintAt(d.first);
            }
          }
          drag.current = { ...d, down: false, on: false };
        }}
        onPointerCancel={() => {
          // 브라우저가 스크롤로 가져갔다: 아무것도 칠하지 않는다.
          drag.current = { ...drag.current, down: false, on: false };
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
            {c.note && <span className="memo">{c.note}</span>}
          </div>
        ))}
        {isToday && <div className="nowline" style={{ top: `${((now - day) / DAY) * 100}%` }} />}
      </div>
    </div>
  );
}
