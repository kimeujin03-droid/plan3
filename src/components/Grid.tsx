import { useEffect, useMemo, useRef, type PointerEvent } from 'react';
import { cellInfo } from '../lib/intervals';
import { soft } from '../lib/palette';
import { CELL, DAY, dayStart } from '../lib/time';
import { useStore } from '../store';

interface Props {
  day: number;
  /** 지금 다루는 종류. 칠하기와 지우개 모두 이 종류에만 닿는다. */
  kind: 'exec' | 'plan' | 'note';
  erasing: boolean;
  activityId: string;
  now: number;
  /** 메모 종류에서 칸을 눌렀을 때 */
  onPickCell?: (cellStart: number) => void;
  /** 칸을 길게 눌렀을 때(마우스는 오른쪽 버튼) */
  onOpenCell?: (cellStart: number) => void;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const LONG_PRESS_MS = 450;

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

const radius = (joinLeft: boolean, joinRight: boolean) => `${joinLeft ? 0 : 9}px ${joinRight ? 0 : 9}px ${joinRight ? 0 : 9}px ${joinLeft ? 0 : 9}px`;

/** 하루 격자. 한 줄이 한 시간, 가로 여섯 칸이 10분씩. 옆으로 문지르면 칠해진다. */
export function Grid({ day, kind, erasing, activityId, now, onPickCell, onOpenCell }: Props) {
  const intervals = useStore((s) => s.intervals);
  const activities = useStore((s) => s.activities);
  const cellNotes = useStore((s) => s.cellNotes);
  const paintRange = useStore((s) => s.paintRange);
  const eraseNotes = useStore((s) => s.eraseNotes);
  const beginStroke = useStore((s) => s.beginStroke);
  const drag = useRef({ down: false, on: false, last: -1, x: 0, y: 0, first: -1 });
  const press = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(press.current), []);
  const nowRow = useRef<HTMLDivElement>(null);
  const isToday = day === dayStart(now);
  const minute = Math.floor(now / 60_000);
  /** 메모 종류에서 지우개가 꺼져 있으면 칠하지 않고 칸을 고르기만 한다. */
  const picking = kind === 'note' && !erasing;

  const cells = useMemo(() => {
    const byId = new Map(activities.map((a) => [a.id, a]));
    const dayIv = intervals.filter((iv) => iv.start < day + DAY && (iv.end === null ? now : iv.end) > day);
    const infos = Array.from({ length: 144 }, (_, i) => cellInfo(dayIv, day + i * CELL, now));
    const none = { plan: null as string | null, exec: [] as string[] };
    const notes = new Map<number, string>();
    for (const n of cellNotes) {
      const i = Math.floor((n.at - day) / CELL);
      if (i >= 0 && i < 144) notes.set(i, n.text);
    }
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
        note: notes.get(i) ?? '',
      };
    });
    // 분 단위로만 다시 계산한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervals, activities, cellNotes, day, minute]);

  useEffect(() => {
    nowRow.current?.scrollIntoView({ block: 'start' });
  }, [day]);

  const cellAt = (e: { clientX: number; clientY: number; currentTarget: HTMLDivElement }) => {
    const r = e.currentTarget.getBoundingClientRect();
    const col = Math.max(0, Math.min(5, Math.floor(((e.clientX - r.left) / r.width) * 6)));
    const row = Math.max(0, Math.min(23, Math.floor(((e.clientY - r.top) / r.height) * 24)));
    return row * 6 + col;
  };
  const paintAt = (i: number) => {
    if (picking || drag.current.last === i) return;
    drag.current.last = i;
    const at = day + i * CELL;
    if (kind === 'note') eraseNotes(at, 1);
    else paintRange(at, 1, erasing ? (kind === 'plan' ? 'erasePlan' : 'eraseExec') : kind, activityId);
  };
  const begin = (e: PointerEvent<HTMLDivElement>) => {
    drag.current.on = true;
    beginStroke();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* 일부 WebView에서는 실패해도 그리기는 된다 */
    }
    paintAt(cellAt(e));
  };

  const scrollHour = isToday ? Math.max(0, new Date(now).getHours() - 3) : 7;
  const t = new Date(now);

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
          role="img"
          aria-label="하루 격자. 한 줄이 한 시간, 한 칸이 10분."
          onContextMenu={(e) => {
            e.preventDefault();
            if (!('ontouchstart' in window)) onOpenCell?.(day + cellAt(e) * CELL);
          }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            const first = cellAt(e);
            drag.current = { down: true, on: false, last: -1, x: e.clientX, y: e.clientY, first };
            // 마우스는 스크롤과 헷갈릴 일이 없으니 바로 칠한다.
            if (e.pointerType === 'mouse') {
              if (!picking) begin(e);
              return;
            }
            // 움직이지 않고 누르고 있으면 칠하지 않고 상세를 연다.
            clearTimeout(press.current);
            press.current = setTimeout(() => {
              if (!drag.current.down || drag.current.on) return;
              drag.current.down = false;
              onOpenCell?.(day + first * CELL);
            }, LONG_PRESS_MS);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d.down || picking) return;
            if (!d.on) {
              const dx = Math.abs(e.clientX - d.x);
              const dy = Math.abs(e.clientY - d.y);
              if (dx > 8 || dy > 8) clearTimeout(press.current);
              // 옆으로 움직였을 때만 칠하기로 본다. 세로는 스크롤.
              if (dx < 8 || dx < dy) return;
              begin(e);
            }
            paintAt(cellAt(e));
          }}
          onPointerUp={() => {
            clearTimeout(press.current);
            const d = drag.current;
            if (d.down && !d.on) {
              if (picking) onPickCell?.(day + d.first * CELL);
              else {
                beginStroke();
                paintAt(d.first);
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
          {cells.map((c, i) => (
            <div className="cell" key={i}>
              {c.planBg && <i className="plan" style={{ background: c.planBg }} />}
              {c.e1Bg && <i className="exec" style={{ background: c.e1Bg, borderRadius: c.e1R, top: `${TOP}%`, bottom: `${100 - (c.two ? SPLIT : BOTTOM)}%` }} />}
              {c.e2Bg && <i className="exec" style={{ background: c.e2Bg, borderRadius: c.e2R, top: `${SPLIT + GAP}%`, bottom: `${100 - BOTTOM}%` }} />}
              {c.label && <span className={c.two ? 'l1 small' : 'l1'}>{c.label}</span>}
              {c.planLabel && <span className="l1 muted">{c.planLabel}</span>}
              {c.label2 && <span className="l2">{c.label2}</span>}
              {c.note && <span className="memo">{c.note}</span>}
            </div>
          ))}
          {/* 지금 시각: 이 시간 줄 안에서 분만큼 오른쪽으로 간 세로선. 1분마다 움직인다. */}
          {isToday && <div className="nowline-v" style={{ top: `calc(var(--row) * ${t.getHours()})`, left: `${((t.getMinutes() + t.getSeconds() / 60) / 60) * 100}%` }} />}
        </div>
      </div>
    </div>
  );
}
