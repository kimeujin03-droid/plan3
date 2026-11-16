import { useEffect, useMemo, useRef, type PointerEvent } from 'react';
import { cellInfo } from '../lib/intervals';
import { soft } from '../lib/palette';
import { CELL, DAY, dayStart, fmtHM } from '../lib/time';
import type { PaintMode } from '../lib/types';
import { useStore } from '../store';

interface Props {
  day: number;
  /** 'note'면 칠하지 않고, 누른 칸을 onPickCell로 알려준다. */
  mode: PaintMode | 'note';
  onPickCell?: (cellStart: number) => void;
  /** 기록이 있는 칸을 톡 눌렀을 때(마우스는 오른쪽 버튼) */
  onOpenCell?: (cellStart: number) => void;
  activityId: string;
  now: number;
}

/** 10분 한 칸의 높이(px). 한 시간은 여섯 칸. */
export const ROW = 14;
const N = 144;
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const LONG_PRESS_MS = 320;

type Lane = 'plan' | 'e1' | 'e2';
interface Seg {
  lane: Lane;
  from: number;
  to: number;
  color: string;
  wide: boolean;
  joinTop: boolean;
  joinBottom: boolean;
}
interface Label {
  at: number;
  lane: Lane;
  text: string;
  muted: boolean;
}

/**
 * 하루 타임라인. 시간이 위에서 아래로 흐르고, 한 줄이 10분이다.
 * 계획은 폭 전체에 옅게 깔리고, 한 일은 그 위에 진하게 올라간다(같이 한 일은 오른쪽에 좁게).
 * 세로로 밀면 스크롤, 꾹 누른 채 끌면 칠하기, 톡 누르면 한 칸 칠하기 또는 상세 보기.
 */
export function Grid({ day, mode, activityId, now, onPickCell, onOpenCell }: Props) {
  const intervals = useStore((s) => s.intervals);
  const activities = useStore((s) => s.activities);
  const paint = useStore((s) => s.paint);
  const cellNotes = useStore((s) => s.cellNotes);
  const beginStroke = useStore((s) => s.beginStroke);
  const drag = useRef({ down: false, on: false, moved: false, last: -1, x: 0, y: 0, first: -1 });
  const press = useRef<ReturnType<typeof setTimeout>>();
  const canvas = useRef<HTMLDivElement>(null);
  const nowRow = useRef<HTMLDivElement>(null);
  const isToday = day === dayStart(now);
  const minute = Math.floor(now / 60_000);

  const view = useMemo(() => {
    const byId = new Map(activities.map((a) => [a.id, a]));
    const dayIv = intervals.filter((iv) => iv.start < day + DAY && (iv.end === null ? now : iv.end) > day);
    const infos = Array.from({ length: N }, (_, i) => cellInfo(dayIv, day + i * CELL, now));
    const get = (i: number, lane: Lane): string | null => {
      if (i < 0 || i >= N) return null;
      return lane === 'plan' ? infos[i].plan : infos[i].exec[lane === 'e1' ? 0 : 1] ?? null;
    };
    const segs: Seg[] = [];
    const labels: Label[] = [];
    for (const lane of ['plan', 'e1', 'e2'] as Lane[]) {
      let i = 0;
      while (i < N) {
        const id = get(i, lane);
        if (!id) {
          i++;
          continue;
        }
        // 같은 활동이 이어지는 구간 전체
        let end = i;
        while (get(end + 1, lane) === id) end++;
        const color = byId.get(id)?.color ?? '#cccccc';
        // 한 일 첫째 줄은 같이 한 일이 있는 동안만 폭을 줄인다.
        let a = i;
        while (a <= end) {
          const wide = lane !== 'e1' || !infos[a].exec[1];
          let b = a;
          while (b < end && (lane !== 'e1' || !infos[b + 1].exec[1] === wide)) b++;
          segs.push({ lane, from: a, to: b, color: lane === 'plan' ? soft(color) : color, wide, joinTop: a > i, joinBottom: b < end });
          a = b + 1;
        }
        const name = byId.get(id)?.name ?? '';
        const range = end > i ? ` ${fmtHM(day + i * CELL)}–${fmtHM(day + (end + 1) * CELL)}` : '';
        if (lane === 'plan') {
          // 계획 이름은 그 자리에 한 일이 없을 때만 보여준다.
          if (!infos[i].exec.length) labels.push({ at: i, lane, text: `${name}${range}`, muted: true });
        } else labels.push({ at: i, lane, text: lane === 'e2' ? name : `${name}${range}`, muted: false });
        i = end + 1;
      }
    }
    const notes = cellNotes.map((n) => ({ i: Math.floor((n.at - day) / CELL), text: n.text })).filter((n) => n.i >= 0 && n.i < N);
    return { segs, labels, notes, filled: infos.map((c) => !!c.plan || c.exec.length > 0) };
    // 분 단위로만 다시 계산한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervals, activities, cellNotes, day, minute]);

  useEffect(() => {
    nowRow.current?.scrollIntoView({ block: 'start' });
  }, [day]);

  // 꾹 눌러 칠하는 동안에는 화면이 같이 스크롤되지 않게 막는다.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const stop = (e: TouchEvent) => {
      if (drag.current.on && e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchmove', stop, { passive: false });
    return () => {
      el.removeEventListener('touchmove', stop);
      clearTimeout(press.current);
    };
  }, []);

  const cellAt = (e: { clientY: number; currentTarget: HTMLDivElement }) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(N - 1, Math.floor((e.clientY - r.top) / ROW)));
  };
  const paintTo = (i: number) => {
    if (mode === 'note') return;
    const d = drag.current;
    if (d.last === i) return;
    // 빠르게 끌어도 사이 칸이 빠지지 않게 채운다.
    const from = d.last < 0 ? i : d.last;
    const step = i >= from ? 1 : -1;
    for (let k = d.last < 0 ? i : from + step; step > 0 ? k <= i : k >= i; k += step) paint(day + k * CELL, mode, activityId);
    d.last = i;
  };
  const begin = (el: HTMLDivElement, pointerId: number) => {
    drag.current.on = true;
    beginStroke();
    try {
      el.setPointerCapture(pointerId);
    } catch {
      /* 일부 WebView에서는 실패해도 그리기는 된다 */
    }
    paintTo(drag.current.first);
  };

  const scrollHour = isToday ? Math.max(0, new Date(now).getHours() - 2) : 7;
  const geometry = (s: Seg) => {
    if (s.lane === 'plan') return { left: 0, right: 0 };
    if (s.lane === 'e2') return { right: 0, width: '32%' };
    return { left: 0, width: s.wide ? '82%' : '64%' };
  };
  const round = (s: Seg) => `${s.joinTop ? 0 : 8}px ${s.joinTop ? 0 : 8}px ${s.joinBottom ? 0 : 8}px ${s.joinBottom ? 0 : 8}px`;

  return (
    <div className="tl" style={{ height: N * ROW }}>
      <div className="tl-hours" aria-hidden="true">
        {HOURS.map((h) => (
          <div key={h} ref={h === scrollHour ? nowRow : undefined} style={{ height: ROW * 6 }}>
            {String(h).padStart(2, '0')}
          </div>
        ))}
      </div>
      <div
        className="tl-canvas"
        ref={canvas}
        role="img"
        aria-label="하루 타임라인. 위에서 아래로 시간이 흐르고 한 줄이 10분."
        onContextMenu={(e) => {
          e.preventDefault();
          if (!('ontouchstart' in window)) onOpenCell?.(day + cellAt(e) * CELL);
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const first = cellAt(e);
          drag.current = { down: true, on: false, moved: false, last: -1, x: e.clientX, y: e.clientY, first };
          // 마우스는 스크롤과 헷갈릴 일이 없으니 누른 채 움직이면 바로 칠한다.
          if (e.pointerType === 'mouse') return;
          const el = e.currentTarget;
          const id = e.pointerId;
          clearTimeout(press.current);
          if (mode === 'note') return;
          press.current = setTimeout(() => {
            const d = drag.current;
            if (!d.down || d.on || d.moved) return;
            navigator.vibrate?.(12);
            begin(el, id);
          }, LONG_PRESS_MS);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d.down) return;
          if (!d.on) {
            if (Math.abs(e.clientX - d.x) < 6 && Math.abs(e.clientY - d.y) < 6) return;
            d.moved = true;
            clearTimeout(press.current);
            if (e.pointerType !== 'mouse' || mode === 'note') return;
            begin(e.currentTarget, e.pointerId);
          }
          paintTo(cellAt(e));
        }}
        onPointerUp={() => {
          clearTimeout(press.current);
          const d = drag.current;
          // 움직이지 않고 뗐으면 톡 누른 것.
          if (d.down && !d.on && !d.moved) {
            const at = day + d.first * CELL;
            if (mode === 'note') onPickCell?.(at);
            else if (mode !== 'erase' && view.filled[d.first]) onOpenCell?.(at);
            else {
              beginStroke();
              paintTo(d.first);
            }
          }
          drag.current = { ...d, down: false, on: false };
        }}
        onPointerCancel={() => {
          // 브라우저가 스크롤로 가져갔다: 아무것도 칠하지 않는다.
          clearTimeout(press.current);
          drag.current = { ...drag.current, down: false, on: false };
        }}
      >
        {view.segs.map((s) => (
          <i key={`${s.lane}${s.from}`} className={s.lane} style={{ top: s.from * ROW, height: (s.to - s.from + 1) * ROW, background: s.color, borderRadius: round(s), ...geometry(s) }} />
        ))}
        {view.labels.map((l) => (
          <span key={`${l.lane}${l.at}`} className={l.muted ? 'muted' : undefined} style={{ top: l.at * ROW, ...(l.lane === 'e2' ? { left: '69%' } : { left: 8 }) }}>
            {l.text}
          </span>
        ))}
        {view.notes.map((n) => (
          <span key={`n${n.i}`} className="memo" style={{ top: n.i * ROW }}>
            {n.text}
          </span>
        ))}
        {isToday && <div className="nowline" style={{ top: `${((now - day) / DAY) * 100}%` }} />}
      </div>
    </div>
  );
}
