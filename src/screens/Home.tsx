import { useEffect, useState } from 'react';
import { Moa } from '../components/Moa';
import { NextSheet } from '../components/NextSheet';
import { StartGrid } from '../components/Pickers';
import { useMoaMood } from '../components/useMoaMood';
import { logicalToday } from '../lib/day';
import { findGap } from '../lib/gaps';
import { activeIntervals } from '../lib/intervals';
import { SLEEP_ID } from '../lib/palette';
import { DAY, fmtDate, fmtDur, fmtHM } from '../lib/time';
import { useStore } from '../store';
import { byUrgency, GoalRow, TodoRow, whenOf } from './Todos';
import { checkNotify, fixNotifyPermission } from '../lib/notify';

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
  const [splitting, setSplitting] = useState(false);
  const gap = findGap(intervals, now);
  if (!gap || skipped.includes(gap.start)) return null;
  return (
    <div className="card" style={{ gap: 8 }}>
      {splitting && <GapSplitSheet start={gap.start} end={gap.end} onClose={() => setSplitting(false)} />}
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
      <div className="chips wrap">
        {activities
          .filter((a) => a.id !== SLEEP_ID && !a.parentId)
          .map((a) => (
            <button key={a.id} className="chip" style={{ background: a.color }} onClick={() => fillGap(a.id, gap.start, gap.end)} aria-label={`${a.name}(으)로 ${fmtDur(gap.end - gap.start)} 채우기`}>
              {a.name}
            </button>
          ))}
        <button className="chip" style={{ background: 'var(--bg)' }} onClick={() => setSplitting(true)}>
          ✂ 나눠서
        </button>
      </div>
    </div>
  );
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const hmOf = (ms: number) => `${pad2(new Date(ms).getHours())}:${pad2(new Date(ms).getMinutes())}`;
/** "HH:MM"을 [lo, hi] 안의 ms로(자정을 넘는 빈칸도) */
function msOf(hm: string, lo: number, hi: number): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hm);
  if (!m) return null;
  const base = new Date(lo);
  let t = new Date(base.getFullYear(), base.getMonth(), base.getDate(), Number(m[1]), Number(m[2])).getTime();
  if (t < lo) t += DAY;
  return t > hi ? null : t;
}

/**
 * 빈 시간을 여러 조각으로 나눠 채우기. 조각마다 활동을 고르고(안 고르면 비워 둠),
 * 경계 시각을 바꾸면 다음 조각의 시작도 같이 바뀐다.
 */
function GapSplitSheet({ start, end, onClose }: { start: number; end: number; onClose: () => void }) {
  const activities = useStore((s) => s.activities);
  const fillGaps = useStore((s) => s.fillGaps);
  const [cuts, setCuts] = useState<number[]>(() => [snap(start + (end - start) / 2, start, end)]);
  const [acts, setActs] = useState<(string | null)[]>([null, null]);
  const bounds = [start, ...cuts, end];
  const parts = bounds.slice(0, -1).map((s, i) => ({ start: s, end: bounds[i + 1], act: acts[i] ?? null }));
  const color = (id: string | null) => activities.find((a) => a.id === id)?.color;
  const tops = activities.filter((a) => a.id !== SLEEP_ID && !a.parentId);

  const split = () => {
    // 가장 긴 조각을 반으로
    let k = 0;
    parts.forEach((p, i) => {
      if (p.end - p.start > parts[k].end - parts[k].start) k = i;
    });
    const p = parts[k];
    if (p.end - p.start < 20 * 60_000) return;
    const mid = snap(p.start + (p.end - p.start) / 2, p.start, p.end);
    setCuts([...cuts.slice(0, k), mid, ...cuts.slice(k)].sort((a, b) => a - b));
    setActs([...acts.slice(0, k + 1), null, ...acts.slice(k + 1)]);
  };
  const merge = (i: number) => {
    // i번째 조각을 앞 조각에 합친다(첫 조각이면 뒤와)
    const cut = i === 0 ? 0 : i - 1;
    setCuts(cuts.filter((_, j) => j !== cut));
    setActs(acts.filter((_, j) => j !== i));
  };
  const moveCut = (j: number, v: string) => {
    const t = msOf(v, start, end);
    if (t === null) return;
    const lo = (j === 0 ? start : cuts[j - 1]) + 10 * 60_000;
    const hi = (j === cuts.length - 1 ? end : cuts[j + 1]) - 10 * 60_000;
    setCuts(cuts.map((c, k) => (k === j ? Math.min(Math.max(t, lo), hi) : c)));
  };
  const filled = parts.filter((p) => p.act);

  return (
    <div className="sheet-back" onPointerDown={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="빈 시간 나눠 채우기" onPointerDown={(e) => e.stopPropagation()}>
        <div className="row between">
          <div className="jua" style={{ fontSize: 20 }}>
            {fmtHM(start)}–{fmtHM(end)} 나눠 채우기
          </div>
          <button className="pill" style={{ background: 'var(--bg)' }} onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="gap-bar" aria-hidden="true">
          {parts.map((p, i) => (
            <i key={i} style={{ flex: p.end - p.start, background: color(p.act) ?? 'var(--bg)' }} />
          ))}
        </div>
        {parts.map((p, i) => (
          <div key={i} className="gap-part">
            <div className="row" style={{ gap: 6, alignItems: 'center' }}>
              <span className="jua" style={{ fontSize: 15 }}>
                {fmtHM(p.start)}
              </span>
              <span>–</span>
              {i < parts.length - 1 ? (
                // 글자는 우리가 그리고 투명한 시간 입력을 덮는다(기기마다 오전/오후 표시가 잘리지 않게)
                <label className="gap-time">
                  <span className="jua">{fmtHM(p.end)}</span>
                  <span aria-hidden="true">✎</span>
                  <input type="time" step={600} aria-label={`${i + 1}번째 조각 끝`} value={hmOf(p.end)} onChange={(e) => moveCut(i, e.target.value)} />
                </label>
              ) : (
                <span className="jua" style={{ fontSize: 15 }}>
                  {fmtHM(p.end)}
                </span>
              )}
              <span className="sub grow" style={{ fontSize: 12 }}>
                {fmtDur(p.end - p.start)}
              </span>
              {parts.length > 1 && (
                <button className="step-x" aria-label={`${i + 1}번째 조각 합치기`} onClick={() => merge(i)}>
                  ×
                </button>
              )}
            </div>
            <div className="chips wrap">
              {tops.map((a) => (
                <button
                  key={a.id}
                  className="chip small"
                  style={{ background: a.color }}
                  aria-pressed={p.act === a.id}
                  onClick={() => setActs(parts.map((q, k) => (k === i ? (q.act === a.id ? null : a.id) : q.act)))}
                >
                  {a.name}
                </button>
              ))}
            </div>
          </div>
        ))}
        <button className="pill" style={{ background: 'var(--bg)', alignSelf: 'flex-start' }} onClick={split}>
          ✂ 한 번 더 나누기
        </button>
        <button
          className="big-btn ink"
          disabled={!filled.length}
          onClick={() => {
            fillGaps(filled.map((p) => ({ activityId: p.act!, start: p.start, end: p.end })));
            onClose();
          }}
        >
          {filled.length ? `${filled.length}조각 채우기` : '조각마다 활동을 골라 줘'}
        </button>
        <div className="hint">안 고른 조각은 비워 둬. 나중에 다시 물어볼게.</div>
      </div>
    </div>
  );
}

/** 10분 단위로 맞추고 양 끝에서 10분은 남긴다 */
function snap(t: number, lo: number, hi: number): number {
  const s = Math.round(t / 600_000) * 600_000;
  return Math.min(Math.max(s, lo + 600_000), hi - 600_000);
}

/** 오늘까지인 할 일을 세 개까지만. 눈앞에 있어야 잊지 않는다. */
function TodayTodos({ now, onOpen }: { now: number; onOpen: () => void }) {
  const todos = useStore((s) => s.todos);
  const today = useStore((s) => logicalToday(now, s.intervals));
  // 오늘 할 것 + 날짜와 상관없이 급한 것(1시간 안에 시작, 하루 안에 마감)
  const due = todos
    .filter((t) => !t.done && t.type !== 'hours' && ((t.due !== null && t.due <= today) || ['urgent', 'late'].includes(whenOf(t, today, now)?.level ?? '')))
    .sort(byUrgency(today, now));
  const goals = todos.filter((t) => t.type === 'hours');
  if (!due.length && !goals.length) return null;
  return (
    <div className="card" style={{ gap: 2, padding: '12px 8px 8px 16px' }}>
      <div className="row between" style={{ paddingRight: 8 }}>
        <div className="h2" style={{ fontSize: 15 }}>
          오늘 계획{due.length ? ` · ${due.length}개 남음` : ''}
        </div>
        <button className="pill clear" style={{ minHeight: 32, padding: 0 }} onClick={onOpen}>
          전체 보기
        </button>
      </div>
      {due.slice(0, 3).map((t) => (
        <TodoRow key={t.id} todo={t} today={today} clock={now} />
      ))}
      {goals.slice(0, 2).map((t) => (
        <GoalRow key={t.id} todo={t} today={today} />
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

/** 알림이 막혀 있으면 첫 화면 맨 위에 한 줄로 알려 준다(계획 알림을 켜 둔 경우만) */
function NotifyBanner({ onOpenSettings }: { onOpenSettings: () => void }) {
  const on = useStore((s) => s.planAlerts || s.dailyBrief);
  const [bad, setBad] = useState<string | null>(null);
  useEffect(() => {
    if (!on) return;
    const check = () =>
      void checkNotify().then((c) => {
        if (!c) return setBad(null);
        setBad(!c.allowed ? '알림이 꺼져 있어서 계획 알림이 안 와.' : c.channelOff ? "'계획 알림' 종류가 꺼져 있어." : null);
      });
    check();
    const again = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', again);
    return () => document.removeEventListener('visibilitychange', again);
  }, [on]);
  if (!bad) return null;
  return (
    <div className="notify-banner">
      <span className="grow">🔕 {bad}</span>
      <button className="act" style={{ background: 'var(--ink)', color: '#fff' }} onClick={() => void fixNotifyPermission()}>
        켜기
      </button>
      <button className="act" onClick={onOpenSettings}>
        점검
      </button>
    </div>
  );
}

export function Home({ now, onOpenSettings, onOpenTodos }: Props) {
  const sleeping = useStore((s) => s.sleeping);
  const say = useStore((s) => s.say);
  const mood = useMoaMood(now);
  const runningName = useStore((s) => {
    const iv = activeIntervals(s.intervals).find((v) => v.activityId !== SLEEP_ID);
    return iv ? s.activities.find((a) => a.id === iv.activityId)?.name : undefined;
  });
  const [nextOpen, setNextOpen] = useState(false);
  const look = useStore((s) => s.look);
  let [hello, sub] = HELLO[mood] ?? HELLO.idle;
  if (mood === 'focus' && runningName) hello = `${runningName} 하는 중`;

  return (
    <div className="screen">
      <NotifyBanner onOpenSettings={onOpenSettings} />
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
        <Moa size={120} mood={mood} pettable charm look={look} boardText={sleeping ? '쿨쿨' : runningName ?? '모아'} />
        <div className="grow">
          <div className="jua" style={{ fontSize: 24 }}>
            {hello}
          </div>
          <div className="sub" style={{ fontSize: 14, marginTop: 4 }}>
            {sub}
          </div>
          {!sleeping && mood !== 'focus' && (
            <button className="pill ink next-btn" onClick={() => setNextOpen(true)}>
              지금 뭐 하지?
            </button>
          )}
        </div>
      </div>
      {nextOpen && <NextSheet now={now} onClose={() => setNextOpen(false)} />}

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
