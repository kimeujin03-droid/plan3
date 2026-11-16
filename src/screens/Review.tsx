import { useState } from 'react';
import { Chevron } from '../components/common';
import { totalsByActivity, unionMs } from '../lib/intervals';
import { FOCUS_SHADE, rootOf, SLEEP_ID } from '../lib/palette';
import { addDays, DAY, fmtDur, fmtHM, fmtMD, weekStart } from '../lib/time';
import { useStore } from '../store';

const DOW = ['월', '화', '수', '목', '금', '토', '일'];

export function Review({ now }: { now: number }) {
  const s = useStore();
  const [tab, setTab] = useState<'week' | 'raw'>('week');
  const [week, setWeek] = useState(() => weekStart(now));
  const end = addDays(week, 7);
  const byId = new Map(s.activities.map((a) => [a.id, a]));

  // 하위 활동의 시간은 대주제로 모으고, 안쪽에 나눠서 보여준다.
  const perActivity = totalsByActivity(s.intervals, week, end, now);
  const groups = new Map<string, { total: number; parts: [string, number][] }>();
  for (const [id, ms] of Object.entries(perActivity)) {
    if (id === SLEEP_ID || ms < 60_000) continue;
    const root = rootOf(s.activities, id);
    const g = groups.get(root) ?? { total: 0, parts: [] };
    g.total += ms;
    if (id !== root) g.parts.push([id, ms]);
    groups.set(root, g);
  }
  const totals = [...groups.entries()].sort((a, b) => b[1].total - a[1].total);
  const union = unionMs(
    s.intervals.filter((iv) => iv.activityId !== SLEEP_ID),
    week,
    end,
    now,
  );
  const sleep = perActivity[SLEEP_ID] ?? 0;

  const days = Array.from({ length: 7 }, (_, i) => {
    const from = addDays(week, i);
    const vals = s.samples.filter((m) => m.kind === 'focus' && m.at >= from && m.at < from + DAY).map((m) => m.value);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });
  const anyFocus = days.some((d) => d !== null);

  return (
    <div className="screen">
      <div className="seg" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <button aria-pressed={tab === 'week'} onClick={() => setTab('week')}>
          이번 주
        </button>
        <button aria-pressed={tab === 'raw'} onClick={() => setTab('raw')}>
          내가 한 말
        </button>
      </div>

      {tab === 'week' && (
        <>
          <div className="row" style={{ background: 'var(--card)', borderRadius: 22, justifyContent: 'space-between' }}>
            <button className="icon-btn" aria-label="이전 주" onClick={() => setWeek(addDays(week, -7))}>
              <Chevron dir="left" />
            </button>
            <div style={{ fontSize: 15 }}>
              {fmtMD(week)} – {fmtMD(addDays(week, 6))}
            </div>
            <button className="icon-btn" aria-label="다음 주" onClick={() => setWeek(addDays(week, 7))}>
              <Chevron dir="right" />
            </button>
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
                <div className="bar" role="img" aria-label="대주제별 시간 비율">
                  {totals.map(([id, g]) => (
                    <div key={id} style={{ flex: `${g.total} 1 0`, background: byId.get(id)?.color }} />
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
                  {totals.map(([id, g]) => (
                    <div key={id}>
                      <div className="row" style={{ gap: 8 }}>
                        <div className="swatch" style={{ background: byId.get(id)?.color }} />
                        <div className="grow">{byId.get(id)?.name ?? '활동'}</div>
                        <div>{fmtDur(g.total)}</div>
                      </div>
                      {g.parts
                        .sort((a, b) => b[1] - a[1])
                        .map(([cid, ms]) => (
                          <div key={cid} className="row sub" style={{ gap: 8, paddingLeft: 22 }}>
                            <div className="swatch" style={{ background: byId.get(cid)?.color, width: 10, height: 10 }} />
                            <div className="grow">{byId.get(cid)?.name}</div>
                            <div>{fmtDur(ms)}</div>
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty" style={{ padding: 8 }}>
                이 주에는 아직 적어둔 게 없어.
              </div>
            )}
            {sleep > 0 && (
              <div className="sub" style={{ fontSize: 12 }}>
                수면 {fmtDur(sleep)}은 따로 셌어
              </div>
            )}
          </div>

          {anyFocus && (
            <div className="card">
              <div className="h2">요일별 집중도</div>
              <div className="week bars">
                {days.map((v, i) =>
                  v === null ? (
                    <div key={i} className="blank" />
                  ) : (
                    <div key={i} style={{ height: `${Math.max(30, v * 20)}%`, background: FOCUS_SHADE[Math.round(v)], color: Math.round(v) === 5 ? '#fff' : undefined }}>
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
          )}
        </>
      )}

      {tab === 'raw' && (
        <>
          {s.raw.length === 0 && <div className="empty">모아에게 한 말이 그대로 여기에 남아.</div>}
          {[...s.raw]
            .reverse()
            .slice(0, 200)
            .map((r) => (
              <div className="card" key={r.id} style={{ gap: 4 }}>
                <div className="sub">
                  {fmtMD(r.at)} {fmtHM(r.at)}
                </div>
                <div style={{ fontSize: 15 }}>{r.text}</div>
              </div>
            ))}
        </>
      )}
    </div>
  );
}
