import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { cellInfo } from '../lib/intervals';
import { soft } from '../lib/palette';
import { CELL, DAY, dayStart } from '../lib/time';
import type { Memory } from '../lib/types';
import { useStore } from '../store';

interface Props {
  day: number;
  /** 칠하는 종류. 지우개도 이 종류에만 닿는다. */
  kind: 'exec' | 'plan';
  erasing: boolean;
  activityId: string;
  now: number;
  /**
   * 꾸욱 눌렀다 뗐을 때(끌었으면 그만큼): 그 칸들에 메모를 남긴다.
   * 누른 곳에 이미 메모가 있으면 그 메모를 넘긴다(고치기).
   */
  onMemo: (from: number, to: number, existing: Memory | null) => void;
  /** 한마디 모드: 톡은 칠하지 않고 시작·끝 칸을 고른다. 옆으로 문지르면 그 시간을 바로 고른다. */
  select?: boolean;
  /** 한마디 모드에서 먼저 고른 칸 */
  anchor?: number | null;
  onTapCell?: (index: number) => void;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const LONG_PRESS_MS = 420;

/*
 * 한 칸 안의 세로 배치(칸 높이에 대한 %). 한 일이 하나든 둘이든 위·아래 선은 같은 자리에 있다.
 *   계획: 칸 전체에 옅게
 *   한 일 하나: TOP ~ BOTTOM
 *   한 일 둘:   첫째 TOP ~ SPLIT, 둘째 SPLIT+GAP ~ BOTTOM
 */
const TOP = 10;
const BOTTOM = 84;
const SPLIT = 52;
const GAP = 4;
/** 메모 글이 한 칸에 대략 몇 글자 들어가는지(줄마다 이어서 쓴다) */
const CHARS_PER_CELL = 4;

const radius = (joinLeft: boolean, joinRight: boolean) => `${joinLeft ? 0 : 9}px ${joinRight ? 0 : 9}px ${joinRight ? 0 : 9}px ${joinLeft ? 0 : 9}px`;

/** 색을 진하게(테두리용) */
export function darker(hex: string, k = 0.38): string {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return '#6E64A8';
  const c = (i: number) => Math.round(parseInt(m[i], 16) * (1 - k) + 38 * k);
  return `rgb(${c(1)}, ${c(2)}, ${c(3)})`;
}

export interface MemoBox {
  key: string;
  row: number;
  col: number;
  span: number;
  first: boolean;
  last: boolean;
  text: string;
  color: string;
}

/** 메모 하나를 줄(시간)마다 상자로 나누고, 글을 상자 순서대로 이어서 나눠 담는다. */
export function memoBoxes(m: Memory, day: number, color: string, label: string): MemoBox[] {
  const a = Math.max(0, Math.floor((m.start - day) / CELL));
  const b = Math.min(143, Math.ceil((m.end - day) / CELL) - 1);
  if (b < a) return [];
  const out: MemoBox[] = [];
  let rest = label;
  for (let row = Math.floor(a / 6); row <= Math.floor(b / 6); row++) {
    const from = Math.max(a, row * 6);
    const to = Math.min(b, row * 6 + 5);
    const span = to - from + 1;
    const last = to === b;
    const room = span * CHARS_PER_CELL;
    let text = rest.slice(0, room);
    rest = rest.slice(room);
    if (last && rest) text = `${text.slice(0, -1)}…`;
    out.push({ key: `${m.id}-${row}`, row, col: from % 6, span, first: from === a, last, text, color });
  }
  return out;
}

/** 하루 격자. 한 줄이 한 시간, 가로 여섯 칸이 10분씩. 옆으로 문지르면 칠하고, 꾸욱 누르면 메모. */
export function Grid({ day, kind, erasing, activityId, now, onMemo, select = false, anchor = null, onTapCell }: Props) {
  const intervals = useStore((s) => s.intervals);
  const activities = useStore((s) => s.activities);
  const memories = useStore((s) => s.memories);
  const paintRange = useStore((s) => s.paintRange);
  const beginStroke = useStore((s) => s.beginStroke);
  const drag = useRef({ down: false, on: false, memo: false, last: -1, x: 0, y: 0, first: -1 });
  const press = useRef<ReturnType<typeof setTimeout>>();
  const canvas = useRef<HTMLDivElement>(null);
  const [memoSel, setMemoSel] = useState<[number, number] | null>(null);
  const nowRow = useRef<HTMLDivElement>(null);
  const isToday = day === dayStart(now);
  const minute = Math.floor(now / 60_000);

  const cells = useMemo(() => {
    const byId = new Map(activities.map((a) => [a.id, a]));
    const dayIv = intervals.filter((iv) => iv.start < day + DAY && (iv.end === null ? now : iv.end) > day);
    const infos = Array.from({ length: 144 }, (_, i) => cellInfo(dayIv, day + i * CELL, now));
    const none = { plan: null as string | null, exec: [] as string[] };
    return infos.map((c, i) => {
      // 줄이 바뀌면 이어 그리지 않는다.
      const p = i % 6 === 0 ? none : infos[i - 1];
      const n = i % 6 === 5 ? none : infos[i + 1];
      const e1 = c.exec[0] ?? null;
      const e2 = c.exec[1] ?? null;
      return {
        planBg: c.plan ? soft(byId.get(c.plan)?.color ?? '#cccccc') : undefined,
        e1Bg: e1 ? byId.get(e1)?.color : undefined,
        // 둘째 일이 생기거나 사라지는 자리에서는 높이가 달라지므로 모서리를 닫는다.
        e1R: radius(p.exec[0] === e1 && !!p.exec[1] === !!e2, n.exec[0] === e1 && !!n.exec[1] === !!e2),
        e2Bg: e2 ? byId.get(e2)?.color : undefined,
        e2R: radius(p.exec[1] === e2, n.exec[1] === e2),
        two: !!e2,
        label: e1 && p.exec[0] !== e1 ? byId.get(e1)?.name ?? '' : '',
        planLabel: !e1 && c.plan && p.plan !== c.plan ? byId.get(c.plan)?.name ?? '' : '',
        label2: e2 && p.exec[1] !== e2 ? byId.get(e2)?.name ?? '' : '',
      };
    });
    // 분 단위로만 다시 계산한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervals, activities, day, minute]);

  const dayMemos = useMemo(() => memories.filter((m) => m.start < day + DAY && m.end > day), [memories, day]);
  const boxes = useMemo(() => {
    const byId = new Map(activities.map((a) => [a.id, a]));
    return dayMemos.flatMap((m) => {
      const label = m.text.replace(/\s+/g, ' ').trim() || [m.place, m.people && `${m.people}랑`].filter(Boolean).join(' · ') || (m.photos.length ? '사진' : '메모');
      return memoBoxes(m, day, byId.get(m.activityId ?? '')?.color ?? '#C9B8FF', label);
    });
  }, [dayMemos, activities, day]);

  useEffect(() => {
    nowRow.current?.scrollIntoView({ block: 'start' });
  }, [day]);

  // 꾸욱 누른 뒤 끄는 동안에는 화면이 스크롤되지 않게 막는다.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const stop = (e: TouchEvent) => {
      if (drag.current.memo && e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchmove', stop, { passive: false });
    return () => {
      el.removeEventListener('touchmove', stop);
      clearTimeout(press.current);
    };
  }, []);

  const cellAt = (e: { clientX: number; clientY: number; currentTarget: HTMLDivElement }) => {
    const r = e.currentTarget.getBoundingClientRect();
    const col = Math.max(0, Math.min(5, Math.floor(((e.clientX - r.left) / r.width) * 6)));
    const row = Math.max(0, Math.min(23, Math.floor(((e.clientY - r.top) / r.height) * 24)));
    return row * 6 + col;
  };
  const paintAt = (i: number) => {
    if (drag.current.last === i) return;
    drag.current.last = i;
    paintRange(day + i * CELL, 1, erasing ? (kind === 'plan' ? 'erasePlan' : 'eraseExec') : kind, activityId);
  };
  const capture = (e: PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* 일부 WebView에서는 실패해도 된다 */
    }
  };
  const memoAt = (i: number) => dayMemos.find((m) => m.start < day + (i + 1) * CELL && m.end > day + i * CELL) ?? null;

  const scrollHour = isToday ? Math.max(0, new Date(now).getHours() - 3) : 7;
  const t = new Date(now);
  const sel = memoSel ? [Math.min(...memoSel), Math.max(...memoSel)] : anchor !== null ? [anchor, anchor] : null;

  return (
    <div>
      <div className="minutes" aria-hidden="true">
        {[0, 10, 20, 30, 40, 50].map((m) => (
          <div key={m}>{m === 0 ? '정각' : `${m}분`}</div>
        ))}
      </div>
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
          ref={canvas}
          role="img"
          aria-label="하루 격자. 한 줄이 한 시간, 한 칸이 10분. 옆으로 문지르면 칠하고, 꾸욱 누르면 메모."
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            const first = cellAt(e);
            drag.current = { down: true, on: false, memo: false, last: -1, x: e.clientX, y: e.clientY, first };
            if (e.pointerType === 'mouse') capture(e);
            // 움직이지 않고 꾸욱 누르고 있으면 메모로 바뀐다.
            clearTimeout(press.current);
            press.current = setTimeout(() => {
              const d = drag.current;
              if (!d.down || d.on) return;
              d.memo = true;
              navigator.vibrate?.(12);
              setMemoSel([first, first]);
            }, LONG_PRESS_MS);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d.down) return;
            if (d.memo) {
              // 메모: 위아래·옆 어느 쪽으로든 끌어서 늘린다.
              setMemoSel([d.first, cellAt(e)]);
              return;
            }
            if (!d.on) {
              const dx = Math.abs(e.clientX - d.x);
              const dy = Math.abs(e.clientY - d.y);
              if (dx > 6 || dy > 6) clearTimeout(press.current);
              // 옆으로 움직였을 때만 칠하기로 본다. 세로는 스크롤.
              if (dx < 8 || (e.pointerType !== 'mouse' && dx < dy)) return;
              if (select) {
                // 한마디 모드: 문지른 만큼을 고른다(칠하지 않는다).
                d.memo = true;
                capture(e);
                setMemoSel([d.first, cellAt(e)]);
                return;
              }
              d.on = true;
              beginStroke();
              capture(e);
              paintAt(d.first);
            }
            paintAt(cellAt(e));
          }}
          onPointerUp={() => {
            clearTimeout(press.current);
            const d = drag.current;
            if (d.memo && memoSel) {
              const a = Math.min(...memoSel);
              const b = Math.max(...memoSel);
              // 한 칸만 꾸욱 눌렀고 그 자리에 메모가 있으면 그 메모를 고친다.
              onMemo(a, b, a === b ? memoAt(a) : null);
            } else if (d.down && !d.on) {
              if (select) onTapCell?.(d.first);
              else {
                // 톡: 한 칸 칠하기
                beginStroke();
                paintAt(d.first);
              }
            }
            setMemoSel(null);
            drag.current = { ...d, down: false, on: false, memo: false };
          }}
          onPointerCancel={() => {
            // 브라우저가 스크롤로 가져갔다: 아무것도 하지 않는다.
            clearTimeout(press.current);
            setMemoSel(null);
            drag.current = { ...drag.current, down: false, on: false, memo: false };
          }}
        >
          {cells.map((c, i) => (
            <div className={sel && i >= sel[0] && i <= sel[1] ? 'cell sel' : 'cell'} key={i}>
              {c.planBg && <i className="plan" style={{ background: c.planBg }} />}
              {c.e1Bg && <i className="exec" style={{ background: c.e1Bg, borderRadius: c.e1R, top: `${TOP}%`, bottom: `${100 - (c.two ? SPLIT : BOTTOM)}%` }} />}
              {c.e2Bg && <i className="exec" style={{ background: c.e2Bg, borderRadius: c.e2R, top: `${SPLIT + GAP}%`, bottom: `${100 - BOTTOM}%` }} />}
              {c.label && <span className={c.two ? 'l1 small' : 'l1'}>{c.label}</span>}
              {c.planLabel && <span className="l1 muted">{c.planLabel}</span>}
              {c.label2 && <span className="l2">{c.label2}</span>}
            </div>
          ))}
          {/*
            한마디: 계획·한 일 띠처럼 칸에 딱 붙여 그린다. 진한 테두리, 반투명 바탕.
            시작과 끝만 둥글고, 다음 시간 줄로 넘어가는 쪽은 열어 둬서 이어지는 띠로 보인다.
          */}
          {boxes.map((b) => (
            <div
              key={b.key}
              className="memo-box"
              style={{
                top: `calc(var(--row) * ${b.row} + 2px)`,
                left: `${(b.col / 6) * 100}%`,
                width: `${(b.span / 6) * 100}%`,
                background: `${b.color}66`,
                borderColor: darker(b.color),
                borderLeftWidth: b.first ? 2 : 0,
                borderRightWidth: b.last ? 2 : 0,
                borderRadius: `${b.first ? 14 : 0}px ${b.last ? 14 : 0}px ${b.last ? 14 : 0}px ${b.first ? 14 : 0}px`,
              }}
            >
              <span>{b.text}</span>
            </div>
          ))}
          {/* 지금 시각: 이 시간 줄 안에서 분만큼 오른쪽으로 간 세로선. 1분마다 움직인다. */}
          {isToday && <div className="nowline-v" style={{ top: `calc(var(--row) * ${t.getHours()})`, left: `${((t.getMinutes() + t.getSeconds() / 60) / 60) * 100}%` }} />}
        </div>
      </div>
    </div>
  );
}
