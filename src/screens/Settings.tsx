import { useState } from 'react';
import pkg from '../../package.json';
import { DEFAULT_API } from '../lib/ai';
import { requestNudgePermission } from '../lib/notify';
import { SLEEP_ID } from '../lib/palette';
import { shareExport } from '../lib/storage';
import { pickData, useStore } from '../store';

export const PRIVACY_URL = 'https://github.com/kimeujin03-droid/plan3/blob/moa/docs/privacy.md';

function Switch({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return <button className="switch" role="switch" aria-checked={on} aria-label={label} onClick={onToggle} />;
}

export function Settings({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [name, setName] = useState('');
  const [io, setIo] = useState('');
  const [msg, setMsg] = useState('');
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [showServer, setShowServer] = useState(false);
  const [server, setServer] = useState(s.apiOverride);
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
          {s.activities
            .filter((a) => a.id !== SLEEP_ID)
            .map((a) => (
              <div className="row" key={a.id}>
                <div className="swatch" style={{ background: a.color, width: 22, height: 22, borderRadius: 8 }} />
                <input
                  className="field grow"
                  aria-label={`${a.name} 이름`}
                  defaultValue={a.name}
                  maxLength={20}
                  onBlur={(e) => s.renameActivity(a.id, e.target.value)}
                />
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
            <input className="field grow" aria-label="새 활동 이름" placeholder="새 활동 이름" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
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
