import { useMemo, useRef, type PointerEvent } from 'react';
import { cellInfo } from '../lib/intervals';
import { addDays, CELL, dayStart, HOUR } from '../lib/time';
import { useStore } from '../store';

interface Props {
  /** 그 주 월요일 0시 */
  week: number;
  erasing: boolean;
  activityId: string;
  now: number;
  onOpenDay: (day: number) => void;
}

const DOW = ['월', '화', '수', '목', '금', '토', '일'];

/** 가장 자주 나온 값 */
function top(values: (string | null)[]): string | null {
  const count = new Map<string, number>();
  for (const v of values) if (v) count.set(v, (count.get(v) ?? 0) + 1);
  let best: string | null = null;
  for (const [k, n] of count) if (best === null || n > count.get(best)!) best = k;
  return best;
}

/**
 * 한 주의 계획만 한 화면에. 가로가 요일, 세로가 시간이고 한 칸이 한 시간이다.
 * 문지르면 한 시간씩 계획이 칠해진다. 한 일과 메모는 하루 보기에서 다룬다.
 */
export function WeekGrid({ week, erasing, activityId, now, onOpenDay }: Props) {
  const intervals = useStore((s) => s.intervals);
  const activities = useStore((s) => s.activities);
  const paintRange = useStore((s) => s.paintRange);
  const beginStroke = useStore((s) => s.beginStroke);
  const drag = useRef({ on: false, last: -1 });
  const minute = Math.floor(now / 60_000);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const today = dayStart(now);

  const cells = useMemo(() => {
    const byId = new Map(activities.map((a) => [a.id, a]));
    const end = addDays(week, 7);
    const plans = intervals.filter((iv) => iv.kind === 'plan' && iv.start < end && (iv.end ?? now) > week);
    // 화면은 시간(행) 먼저, 요일(열) 다음 순서로 그린다.
    return Array.from({ length: 24 * 7 }, (_, i) => {
      const hourStart = days[i % 7] + Math.floor(i / 7) * HOUR;
      const infos = Array.from({ length: 6 }, (_, k) => cellInfo(plans, hourStart + k * CELL, now).plan);
      const plan = top(infos);
      const above = i >= 7 ? top(Array.from({ length: 6 }, (_, k) => cellInfo(plans, hourStart - HOUR + k * CELL, now).plan)) : null;
      return {
        bg: plan ? byId.get(plan)?.color : undefined,
        // 한 시간 중 계획이 잡힌 만큼만 채운다.
        fill: infos.filter(Boolean).length / 6,
        label: plan && plan !== above ? byId.get(plan)?.name ?? '' : '',
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervals, activities, week, minute]);

  const at = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const col = Math.max(0, Math.min(6, Math.floor(((e.clientX - r.left) / r.width) * 7)));
    const row = Math.max(0, Math.min(23, Math.floor(((e.clientY - r.top) / r.height) * 24)));
    return { index: row * 7 + col, start: days[col] + row * HOUR };
  };
  const stroke = (e: PointerEvent<HTMLDivElement>) => {
    const c = at(e);
    if (drag.current.last === c.index) return;
    drag.current.last = c.index;
    paintRange(c.start, 6, erasing ? 'erasePlan' : 'plan', activityId);
  };

  const nowRow = today >= week && today < addDays(week, 7) ? (now - today) / (24 * HOUR) : null;

  return (
    <div className="weekgrid">
      <div className="wk-head">
        <div />
        {days.map((d, i) => (
          <button key={d} className={d === today ? 'today' : undefined} onClick={() => onOpenDay(d)} aria-label={`${DOW[i]}요일 ${new Date(d).getDate()}일 하루 보기`}>
            <span>{DOW[i]}</span>
            <b>{new Date(d).getDate()}</b>
          </button>
        ))}
      </div>
      <div className="wk-body">
        <div className="wk-hours" aria-hidden="true">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h}>{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</div>
          ))}
        </div>
        <div
          className="wk-cells"
          role="img"
          aria-label="한 주 계획. 가로가 요일, 세로가 시간."
          onPointerDown={(e) => {
            drag.current = { on: true, last: -1 };
            beginStroke();
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              /* 캡처가 안 돼도 칠하기는 된다 */
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
            <div className="wk-cell" key={i}>
              {c.bg && <i style={{ background: c.bg, height: `${Math.max(34, c.fill * 100)}%` }} />}
              {c.label && <span>{c.label}</span>}
            </div>
          ))}
          {nowRow !== null && <div className="nowline" style={{ top: `${nowRow * 100}%`, left: `${(((today - week) / (24 * HOUR)) / 7) * 100}%`, width: `${100 / 7}%` }} />}
        </div>
      </div>
    </div>
  );
}
