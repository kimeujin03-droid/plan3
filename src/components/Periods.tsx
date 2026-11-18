import { useState } from 'react';
import { DAY, addDays, dayStart } from '../lib/time';
import type { Period } from '../lib/types';
import { dayOf, ymd } from '../lib/weekplan';
import { useStore } from '../store';

const md = (d: number) => `${new Date(d).getMonth() + 1}/${new Date(d).getDate()}`;

/** 오늘 기준 기간 상태 한 줄: "D-12", "3일째 · 9일 남음", "끝" */
export function periodState(p: Period, today: number): { label: string; now: boolean; past: boolean } {
  if (today < p.start) return { label: `D-${Math.round((p.start - today) / DAY)}`, now: false, past: false };
  if (today > p.end) return { label: '끝', now: false, past: true };
  const left = Math.round((p.end - today) / DAY);
  return { label: `${Math.round((today - p.start) / DAY) + 1}일째${left ? ` · ${left}일 남음` : ' · 마지막 날'}`, now: true, past: false };
}

/** 그날이 든 기간들 */
export function periodsOn(periods: Period[], day: number): Period[] {
  return periods.filter((p) => day >= p.start && day <= p.end);
}

/** 기간 넣기·고치기 */
export function PeriodSheet({ period, today, onClose }: { period?: Period; today: number; onClose: () => void }) {
  const save = useStore((s) => s.savePeriod);
  const remove = useStore((s) => s.removePeriod);
  const [name, setName] = useState(period?.name ?? '시험 기간');
  const [start, setStart] = useState(period?.start ?? today);
  const [end, setEnd] = useState(period?.end ?? addDays(today, 13));
  const [pause, setPause] = useState(period?.pause ?? true);
  const bad = end < start;
  return (
    <div className="sheet-back" onPointerDown={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="기간 정하기" onPointerDown={(e) => e.stopPropagation()}>
        <div className="row between">
          <div className="jua" style={{ fontSize: 20 }}>
            {period ? '기간 고치기' : '시험 기간 정하기'}
          </div>
          <button className="pill" style={{ background: 'var(--bg)' }} onClick={onClose}>
            닫기
          </button>
        </div>
        <input className="field" aria-label="기간 이름" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 기말고사" />
        <div className="chips" role="group" aria-label="이름 고르기">
          {['중간고사', '기말고사', '시험 기간', '방학'].map((n) => (
            <button key={n} type="button" className="chip" style={{ background: 'var(--bg)' }} aria-pressed={name === n} onClick={() => setName(n)}>
              {n}
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <input
            className="field grow"
            type="date"
            aria-label="시작하는 날"
            value={ymd(start)}
            onChange={(e) => {
              const d = dayOf(e.target.value);
              if (d !== null) setStart(d);
            }}
          />
          <span>~</span>
          <input
            className="field grow"
            type="date"
            aria-label="끝나는 날"
            value={ymd(end)}
            min={ymd(start)}
            onChange={(e) => {
              const d = dayOf(e.target.value);
              if (d !== null) setEnd(d);
            }}
          />
        </div>
        <label className="row" style={{ gap: 10, alignItems: 'center', minHeight: 44 }}>
          <input type="checkbox" checked={pause} onChange={(e) => setPause(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--ink)' }} />
          <span>
            이 기간엔 매주 고정 일정(수업 등) 쉬기
            <span className="hint" style={{ display: 'block' }}>
              켜면 그동안의 반복 일정이 달력·격자에서 빠져. 끄거나 기간을 지우면 다시 생겨.
            </span>
          </span>
        </label>
        {bad && <div className="hint" style={{ color: '#8a2444' }}>끝나는 날이 시작하는 날보다 뒤여야 해.</div>}
        <div className="row" style={{ gap: 8 }}>
          {period && (
            <button
              className="pill"
              style={{ background: 'var(--bg)', minHeight: 52, padding: '0 18px' }}
              onClick={() => {
                remove(period.id);
                onClose();
              }}
            >
              지우기
            </button>
          )}
          <button
            className="big-btn ink grow"
            disabled={bad}
            onClick={() => {
              save({ id: period?.id, name, start: dayStart(start), end: dayStart(end), pause });
              onClose();
            }}
          >
            {period ? '고치기' : '정하기'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 계획 화면 위쪽: 지금·다가오는 기간과 D-day, ＋ 기간 */
export function PeriodBar({ today }: { today: number }) {
  const periods = useStore((s) => s.periods);
  const [editing, setEditing] = useState<Period | null | 'new'>(null);
  const shown = periods.filter((p) => p.end >= today).sort((a, b) => a.start - b.start);
  return (
    <div className="period-bar">
      {shown.map((p) => {
        const st = periodState(p, today);
        return (
          <button key={p.id} className={`period-chip${st.now ? ' now' : ''}`} aria-label={`${p.name} 고치기`} onClick={() => setEditing(p)}>
            <b>{p.name}</b>
            <span>{st.label}</span>
            <span className="sub">
              {md(p.start)}~{md(p.end)}
              {p.pause ? ' · 수업 쉼' : ''}
            </span>
          </button>
        );
      })}
      <button className="period-add" onClick={() => setEditing('new')}>
        ＋ 시험 기간
      </button>
      {editing && <PeriodSheet period={editing === 'new' ? undefined : editing} today={today} onClose={() => setEditing(null)} />}
    </div>
  );
}
