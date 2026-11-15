import { useState } from 'react';
import { Chevron } from '../components/common';
import { intentProgress } from '../lib/intents';
import { totalsByActivity, unionMs } from '../lib/intervals';
import { FOCUS_SHADE, SLEEP_ID } from '../lib/palette';
import { addDays, DAY, fmtDays, fmtDur, fmtMD, weekStart } from '../lib/time';
import { useStore } from '../store';

const DOW = ['월', '화', '수', '목', '금', '토', '일'];

export function Review({ now }: { now: number }) {
  const s = useStore();
  const [week, setWeek] = useState(() => weekStart(now));
  const end = addDays(week, 7);
  const byId = new Map(s.activities.map((a) => [a.id, a]));

  const totals = Object.entries(totalsByActivity(s.intervals, week, end, now))
    .filter(([id, ms]) => id !== SLEEP_ID && ms >= 60_000)
    .sort((a, b) => b[1] - a[1]);
  const awake = s.intervals.filter((iv) => iv.activityId !== SLEEP_ID);
  const union = unionMs(awake, week, end, now);
  const sleep = totalsByActivity(s.intervals, week, end, now)[SLEEP_ID] ?? 0;

  const days = Array.from({ length: 7 }, (_, i) => {
    const from = addDays(week, i);
    const vals = s.samples.filter((m) => m.kind === 'focus' && m.at >= from && m.at < from + DAY).map((m) => m.value);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });

  const intents = s.intents.map((it) => ({ it, p: intentProgress(it, s.intervals, now) }));

  return (
    <div className="screen">
      <div className="row between">
        <div className="title">돌아보기</div>
        <div className="row" style={{ background: 'var(--card)', borderRadius: 22, gap: 2 }}>
          <button className="icon-btn" aria-label="이전 주" onClick={() => setWeek(addDays(week, -7))}>
            <Chevron dir="left" />
          </button>
          <div style={{ fontSize: 14 }}>
            {fmtMD(week)} – {fmtMD(addDays(week, 6))}
          </div>
          <button className="icon-btn" aria-label="다음 주" onClick={() => setWeek(addDays(week, 7))}>
            <Chevron dir="right" />
          </button>
        </div>
      </div>

      <div className="card">
        <div className="row between">
          <div className="sub" style={{ fontSize: 14 }}>
            적어둔 시간
          </div>
          <div className="jua" style={{ fontSize: 26 }}>
            {fmtDur(union)}
          </div>
        </div>
        {totals.length ? (
          <>
            <div className="bar" role="img" aria-label="활동별 시간 비율">
              {totals.map(([id, ms]) => (
                <div key={id} style={{ flex: `${ms} 1 0`, background: byId.get(id)?.color }} />
              ))}
            </div>
            <div className="legend">
              {totals.map(([id, ms]) => (
                <div key={id}>
                  <div className="swatch" style={{ background: byId.get(id)?.color, width: 12, height: 12 }} />
                  <div className="grow">{byId.get(id)?.name ?? '활동'}</div>
                  <div>{fmtDur(ms)}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="empty" style={{ padding: 8 }}>
            이 주에는 적어둔 실행이 없어.
          </div>
        )}
        <div className="sub" style={{ fontSize: 12 }}>
          위 숫자는 겹친 시간을 한 번만 센 것 · 활동별 시간은 각각 셈 · 안 적은 시간은 0이 아니라 빈칸
          {sleep ? ` · 수면 ${fmtDur(sleep)}은 따로` : ''}
        </div>
      </div>

      <div className="card">
        <div className="row between">
          <div className="h2">요일별 집중도</div>
          <div className="sub" style={{ fontSize: 12 }}>
            적은 날만 평균
          </div>
        </div>
        <div className="week bars">
          {days.map((v, i) =>
            v === null ? (
              <div key={i} className="blank">
                빈칸
              </div>
            ) : (
              <div
                key={i}
                style={{
                  height: `${Math.max(30, v * 20)}%`,
                  background: FOCUS_SHADE[Math.round(v)],
                  color: Math.round(v) === 5 ? '#fff' : undefined,
                }}
              >
                {v.toFixed(1)}
              </div>
            ),
          )}
        </div>
        <div className="week days">
          {DOW.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
      </div>

      <div className="card" style={{ fontSize: 14, gap: 8 }}>
        <div className="h2">하려던 일, 시작까지</div>
        {intents.length === 0 && <div className="sub">아직 적어둔 하려던 일이 없어.</div>}
        {intents.map(({ it, p }) => (
          <div className="row between" key={it.id}>
            <div>{it.label}</div>
            <div>
              {p.meaningfulAt
                ? fmtDays(p.meaningfulAt - p.firstMention)
                : `${Math.floor((now - p.firstMention) / DAY) + 1}일째, 아직 진행 중`}
            </div>
          </div>
        ))}
        {intents.length > 0 && intents.length < 10 && (
          <div className="sub" style={{ fontSize: 12 }}>
            {intents.length}건뿐이라 경향은 아직 말하기 일러
          </div>
        )}
      </div>
    </div>
  );
}
