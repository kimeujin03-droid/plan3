import { useEffect, useState } from 'react';
import pkg from '../../package.json';
import { DEFAULT_API } from '../lib/ai';
import { exactAlarmStatus, openExactAlarmSetting, requestNudgePermission } from '../lib/notify';
import { SLEEP_ID } from '../lib/palette';
import { shareExport } from '../lib/storage';
import { pickData, useStore } from '../store';

export const PRIVACY_URL = 'https://github.com/kimeujin03-droid/plan3/blob/moa/docs/privacy.md';

function Switch({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return <button className="switch" role="switch" aria-checked={on} aria-label={label} onClick={onToggle} />;
}

function ActivityRow({ id, onMsg, onAddChild }: { id: string; onMsg: (m: string) => void; onAddChild?: () => void }) {
  const a = useStore((s) => s.activities.find((x) => x.id === id));
  const rename = useStore((s) => s.renameActivity);
  const remove = useStore((s) => s.removeActivity);
  if (!a) return null;
  return (
    <div className="row">
      <div className="swatch" style={{ background: a.color, width: 22, height: 22, borderRadius: 8 }} />
      <input className="field grow" aria-label={`${a.name} 이름`} defaultValue={a.name} maxLength={20} onBlur={(e) => rename(a.id, e.target.value)} />
      {onAddChild && (
        <button className="icon-btn" style={{ background: 'var(--bg)' }} aria-label={`${a.name}에 하위 활동 추가`} onClick={onAddChild}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="7" y1="2" x2="7" y2="12" />
            <line x1="2" y1="7" x2="12" y2="7" />
          </svg>
        </button>
      )}
      <button
        className="icon-btn"
        style={{ background: 'var(--bg)' }}
        aria-label={`${a.name} 지우기`}
        onClick={() => {
          if (!remove(a.id)) onMsg(`${a.name}은(는) 기록에 쓰였거나 하위 활동이 있어서 지울 수 없어. 이름은 바꿀 수 있어.`);
        }}
      >
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="2" y1="2" x2="12" y2="12" />
          <line x1="12" y1="2" x2="2" y2="12" />
        </svg>
      </button>
    </div>
  );
}

export function Settings({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [name, setName] = useState('');
  const [io, setIo] = useState('');
  const [msg, setMsg] = useState('');
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [showServer, setShowServer] = useState(false);
  const [server, setServer] = useState(s.apiOverride);
  const [subFor, setSubFor] = useState<string | null>(null);
  const [subName, setSubName] = useState('');
  const api = s.apiOverride || DEFAULT_API;

  const toggleNudge = async () => {
    if (s.nudge) {
      s.setNudge(false);
      return;
    }
    const ok = await requestNudgePermission();
    if (ok) s.setNudge(true);
    else setMsg('알림 권한이 없어서 켜지 못했어. 폰 설정에서 MOA 알림을 허용해줘. (웹에서는 알림이 안 돼)');
  };

  const exportAll = async () => {
    // 내보내는 파일에는 기록만 담는다. 서버 주소 같은 기기 설정은 뺀다.
    const { ai: _ai, apiOverride: _api, nudge: _nudge, ...records } = pickData(s);
    const json = JSON.stringify(records);
    setIo(json);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      if (await shareExport(json, `moa-${stamp}.json`)) {
        setMsg('파일로 만들었어. 보관할 곳을 골라줘.');
        return;
      }
      await navigator.clipboard.writeText(json);
      setMsg('복사했어.');
    } catch {
      setMsg('아래 칸의 글자를 직접 복사해줘.');
    }
  };

  return (
    <div className="overlay">
      <div className="screen">
        <div className="row between">
          <div className="title">설정</div>
          <button className="pill" onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="card">
          <div className="h2">활동</div>
          <div className="sub">＋를 누르면 대주제 아래에 하위 활동이 생겨. 예: 논문 › Starlink</div>
          {s.activities
            .filter((a) => !a.parentId && a.id !== SLEEP_ID)
            .map((top) => (
              <div key={top.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <ActivityRow id={top.id} onMsg={setMsg} onAddChild={() => { setSubFor(top.id); setSubName(''); }} />
                {s.activities
                  .filter((k) => k.parentId === top.id)
                  .map((k) => (
                    <div key={k.id} style={{ paddingLeft: 30 }}>
                      <ActivityRow id={k.id} onMsg={setMsg} />
                    </div>
                  ))}
                {subFor === top.id && (
                  <form
                    className="row"
                    style={{ paddingLeft: 30 }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      s.addActivity(subName, top.id);
                      setSubName('');
                      setSubFor(null);
                    }}
                  >
                    <input className="field grow" aria-label={`${top.name}의 하위 활동 이름`} placeholder={`${top.name} › 하위 이름`} maxLength={20} autoFocus value={subName} onChange={(e) => setSubName(e.target.value)} />
                    <button className="pill ink" type="submit">
                      추가
                    </button>
                  </form>
                )}
              </div>
            ))}
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              s.addActivity(name);
              setName('');
            }}
          >
            <input className="field grow" aria-label="새 대주제 이름" placeholder="새 대주제 이름" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
            <button className="pill ink" type="submit">
              추가
            </button>
          </form>
        </div>

        <div className="card">
          <div className="row between">
            <div className="grow">
              <div className="h2">AI로 알아듣기</div>
              <div className="sub">
                {api
                  ? '규칙으로 못 알아들은 말만 서버로 보내 해석해. 보내는 건 그 한 문장, 활동 이름, 지금 시각뿐이고 지난 기록은 보내지 않아.'
                  : '아직 연결된 서버가 없어. 아래에서 서버 주소를 넣으면 켤 수 있어.'}
              </div>
            </div>
            <Switch on={s.ai && !!api} label="AI로 알아듣기" onToggle={() => (api ? s.setAi(!s.ai) : setShowServer(true))} />
          </div>
          {s.ai && !!api && <div className="sub">보낸 문장은 Google의 Gemini가 처리해. 서버는 문장을 저장하지 않아.</div>}
          <button className="pill clear" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={() => setShowServer(!showServer)}>
            서버 주소 {showServer ? '접기' : '바꾸기'}
          </button>
          {showServer && (
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                const url = server.trim();
                if (url && !/^https:\/\/[^\s/]+/.test(url)) {
                  setMsg('https:// 로 시작하는 주소만 쓸 수 있어.');
                  return;
                }
                s.setApiOverride(url);
                if (!url && !DEFAULT_API) s.setAi(false);
                setMsg(url ? '서버 주소를 바꿨어.' : '기본 주소로 돌렸어.');
              }}
            >
              <input
                className="field grow"
                aria-label="AI 서버 주소"
                placeholder={DEFAULT_API || 'https://…workers.dev'}
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                value={server}
                onChange={(e) => setServer(e.target.value)}
              />
              <button className="pill ink" type="submit">
                저장
              </button>
            </form>
          )}
        </div>

        <PlanAlertCard />

        <div className="card">
          <div className="row between">
            <div className="grow">
              <div className="h2">먼저 말 걸기</div>
              <div className="sub">3시간 동안 조용하면 한 번만 물어봐. 자는 동안은 안 물어.</div>
            </div>
            <Switch on={s.nudge} label="먼저 말 걸기" onToggle={toggleNudge} />
          </div>
        </div>

        <div className="card">
          <div className="h2">내보내기 · 가져오기</div>
          <div className="sub">기록은 이 폰 안에만 있어. 가끔 내보내서 보관해 두면 폰을 바꿔도 이어 쓸 수 있어.</div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="pill ink" onClick={exportAll}>
              내보내기
            </button>
            <button
              className="pill"
              style={{ background: 'var(--bg)' }}
              onClick={() => setMsg(s.importData(io) ? '가져왔어. 지금 기록은 가져온 것으로 바뀌었어.' : '형식이 맞지 않아서 가져오지 못했어.')}
            >
              아래 글자 가져오기
            </button>
          </div>
          <textarea className="field" aria-label="기록 JSON" value={io} onChange={(e) => setIo(e.target.value)} placeholder="가져올 JSON을 여기에 붙여넣기" />
        </div>

        <div className="card">
          <div className="h2">모든 기록 지우기</div>
          {confirmWipe ? (
            <div className="row">
              <button
                className="pill ink"
                onClick={() => {
                  s.wipe();
                  setConfirmWipe(false);
                  setMsg('전부 지웠어.');
                }}
              >
                정말 지우기
              </button>
              <button className="pill" style={{ background: 'var(--bg)' }} onClick={() => setConfirmWipe(false)}>
                취소
              </button>
            </div>
          ) : (
            <button className="pill" style={{ background: 'var(--bg)', alignSelf: 'flex-start' }} onClick={() => setConfirmWipe(true)}>
              지우기
            </button>
          )}
          <div className="sub">이 폰에 있는 기록과 설정이 모두 사라지고 되돌릴 수 없어.</div>
        </div>

        {msg && (
          <div className="reply" role="status">
            {msg}
          </div>
        )}

        <div className="sub" style={{ textAlign: 'center', padding: '4px 0 12px' }}>
          MOA {pkg.version} ·{' '}
          <a className="link" href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">
            개인정보 처리방침
          </a>
        </div>
      </div>
    </div>
  );
}

/** 계획 알림 켜고 끄기, 그리고 알림이 늦게 올 때 정확한 알람 허용으로 보내기 */
function PlanAlertCard() {
  const on = useStore((s) => s.planAlerts);
  const set = useStore((s) => s.setPlanAlerts);
  const [exact, setExact] = useState<'granted' | 'denied' | null>(null);
  useEffect(() => {
    const check = () => void exactAlarmStatus().then(setExact);
    check();
    // 설정 화면에 갔다 오면 다시 확인한다.
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return (
    <div className="card">
      <div className="row between">
        <div className="grow">
          <div className="h2">계획 알림</div>
          <div className="sub">시간 정한 일은 1시간 전·10분 전, 마감은 하루 전·3시간 전·1시간 전에 알려줘.</div>
        </div>
        <Switch on={on} label="계획 알림" onToggle={() => set(!on)} />
      </div>
      {on && exact === 'denied' && (
        <div className="row" style={{ gap: 8, background: 'var(--bg)', borderRadius: 16, padding: '10px 12px' }}>
          <div className="grow sub" style={{ fontSize: 13 }}>
            지금은 폰이 알림을 몇 분 늦출 수 있어. &lsquo;알람 및 리마인더&rsquo;를 허용하면 정확한 시각에 울려.
          </div>
          <button className="pill ink" onClick={() => void openExactAlarmSetting()}>
            허용하러 가기
          </button>
        </div>
      )}
      {on && exact === 'granted' && <div className="sub" style={{ fontSize: 13 }}>정확한 시각에 울리도록 허용돼 있어.</div>}
    </div>
  );
}
