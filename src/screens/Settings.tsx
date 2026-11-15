import { useState } from 'react';
import { requestNudgePermission } from '../lib/notify';
import { SLEEP_ID } from '../lib/palette';
import { pickData, useStore } from '../store';

export function Settings({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [name, setName] = useState('');
  const [io, setIo] = useState('');
  const [msg, setMsg] = useState('');
  const [confirmWipe, setConfirmWipe] = useState(false);

  const toggleNudge = async () => {
    if (s.nudge) {
      s.setNudge(false);
      return;
    }
    const ok = await requestNudgePermission();
    if (ok) s.setNudge(true);
    else setMsg('알림 권한이 없어서 켜지 못했어. 폰 설정에서 MOA 알림을 허용해줘. (웹에서는 알림이 안 돼)');
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
            <input className="field grow" aria-label="새 활동 이름" placeholder="새 활동 이름" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="pill ink" type="submit">
              추가
            </button>
          </form>
        </div>

        <div className="card">
          <div className="row between">
            <div>
              <div className="h2">먼저 말 걸기</div>
              <div className="sub">3시간 동안 조용하면 한 번만 물어봐. 자는 동안은 안 물어.</div>
            </div>
            <button className={s.nudge ? 'pill ink' : 'pill'} style={{ background: s.nudge ? undefined : 'var(--bg)' }} aria-pressed={s.nudge} onClick={toggleNudge}>
              {s.nudge ? '켜짐' : '꺼짐'}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="h2">내보내기 · 가져오기</div>
          <div className="sub">기록 전체가 JSON 글자로 나와. 복사해서 어디든 보관할 수 있어.</div>
          <div className="row">
            <button
              className="pill ink"
              onClick={async () => {
                const json = JSON.stringify(pickData(s));
                setIo(json);
                try {
                  await navigator.clipboard.writeText(json);
                  setMsg('복사했어.');
                } catch {
                  setMsg('아래 칸의 글자를 직접 복사해줘.');
                }
              }}
            >
              내보내기(복사)
            </button>
            <button
              className="pill"
              style={{ background: 'var(--bg)' }}
              onClick={() => setMsg(s.importData(io) ? '가져왔어.' : '형식이 맞지 않아서 가져오지 못했어.')}
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
          <div className="sub">기록은 이 폰 안에만 있어. 지우면 되돌릴 수 없어.</div>
        </div>

        {msg && (
          <div className="reply" role="status">
            {msg}
          </div>
        )}
      </div>
    </div>
  );
}
