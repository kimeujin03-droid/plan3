import { useState } from 'react';
import { deletePhoto, savePhoto } from '../lib/photos';
import { CELL, fmtDayLong, fmtDur, fmtHM } from '../lib/time';
import type { Memory } from '../lib/types';
import { MOOD_WORDS, useStore } from '../store';
import { Moa } from './Moa';
import { MOOD_FACE } from './MoodLog';
import { Photo } from './Photo';
import { CategoryChips } from './Pickers';

const pad = (n: number) => String(n).padStart(2, '0');
const hm = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** 그날 0시 + "HH:MM". 끝이 24:00을 넘지 않게. */
const at = (day: number, v: string) => {
  const [h, m] = v.split(':').map(Number);
  return day + (h * 60 + m) * 60_000;
};

/**
 * 격자를 꾸욱 눌러(끌어서) 연 메모 창. 공간에 자유롭게 적는 느낌으로.
 * 모든 칸은 선택: 글 한 줄, 사진 한 장만 남겨도 된다. 모아는 적지 않은 내용을 지어내지 않는다.
 * memory를 주면 그 메모를 고친다.
 */
export function MemoSheet({ day, from, to, now, memory, onClose }: { day: number; from: number; to: number; now: number; memory?: Memory | null; onClose: () => void }) {
  const updateMemory = useStore((s) => s.updateMemory);
  const removeMemory = useStore((s) => s.removeMemory);
  const removeInterval = useStore((s) => s.removeInterval);
  const [more, setMore] = useState(false);
  const intervals = useStore((s) => s.intervals);
  const activities = useStore((s) => s.activities);
  const todos = useStore((s) => s.todos);
  const memories = useStore((s) => s.memories);
  const recordRange = useStore((s) => s.recordRange);
  const [start, setStart] = useState(memory?.start ?? from);
  const [end, setEnd] = useState(memory?.end ?? to);
  const [actId, setActId] = useState<string>(memory?.activityId ?? '');
  // 메모는 기본으로 시간을 칠하지 않는다. 칠하고 싶을 때만 켠다.
  const [asActivity, setAsActivity] = useState(false);
  const [text, setText] = useState(memory?.text ?? '');
  const [place, setPlace] = useState(memory?.place ?? '');
  const [people, setPeople] = useState(memory?.people ?? '');
  const [mood, setMood] = useState<number | undefined>(memory?.mood);
  const [photos, setPhotos] = useState<string[]>(memory?.photos ?? []);
  const original = memory?.photos ?? [];
  const [busy, setBusy] = useState(false);

  const byId = new Map(activities.map((a) => [a.id, a]));
  // 이 구간과 겹치는 계획: 했다고 표시할 수 있다
  const plan = memory ? undefined : todos.find((t) => !t.done && t.start !== undefined && t.start < end && (t.end ?? t.start + 60 * 60_000) > start);
  // 이 시간에 이미 있는 기록(분 단위). 여기서 바로 지울 수도 있다.
  const here = intervals.filter((iv) => iv.start < end && (iv.end ?? now) > start).sort((a, b) => a.start - b.start);
  const [completePlan, setCompletePlan] = useState(true);
  const recentPlaces = [...new Set([...memories.map((m) => m.place), ...todos.map((t) => t.place)].filter((p): p is string => !!p).reverse())].slice(0, 4);
  const future = start >= now;
  const valid = end > start;
  // 남기지 않고 닫으면 붙였던 사진 파일도 지운다.
  const cancel = () => {
    // 새로 붙였다가 저장하지 않은 사진만 지운다.
    photos.filter((p) => !original.includes(p)).forEach((p) => void deletePhoto(p));
    onClose();
  };
  const hasSomething = (!!actId && asActivity && !future) || !!text.trim() || !!place.trim() || !!people.trim() || !!mood || photos.length > 0 || (!!plan && completePlan);

  return (
    <div className="sheet-back" onPointerDown={cancel}>
      <div className="sheet range-sheet" role="dialog" aria-modal="true" aria-label="이 시간 한마디" onPointerDown={(e) => e.stopPropagation()}>
        <div className="row between">
          <div>
            <div className="sub" style={{ fontSize: 12 }}>
              {fmtDayLong(day)}
            </div>
            <div className="jua" style={{ fontSize: 20 }}>
              {fmtHM(start)}–{fmtHM(end)} <span className="sub" style={{ fontSize: 13 }}>{valid ? fmtDur(end - start) : ''}</span>
            </div>
          </div>
          <button className="pill" style={{ background: 'var(--bg)' }} onClick={cancel}>
            닫기
          </button>
        </div>

        {/* 분 단위로 고치기 */}
        <div className="time-pair">
          <label className="picker">
            <span className="picker-label">시작</span>
            <span className="picker-value">{hm(start)}</span>
            <input type="time" step={60} aria-label="시작 시각" value={hm(start)} onChange={(e) => e.target.value && setStart(at(day, e.target.value))} />
          </label>
          <span aria-hidden="true">→</span>
          <label className="picker">
            <span className="picker-label">끝</span>
            <span className="picker-value">{hm(end)}</span>
            <input type="time" step={60} aria-label="끝 시각" value={hm(end)} onChange={(e) => e.target.value && setEnd(at(day, e.target.value))} />
          </label>
        </div>
        {!valid && <div className="hint" style={{ color: '#8a2444' }}>끝이 시작보다 뒤여야 해.</div>}

        <textarea className="field memo-text" aria-label="한마디" placeholder="여기에 자유롭게 (예: 친구랑 카페에서 케이크 먹으면서 수다)" maxLength={1000} rows={3} autoFocus={!memory} value={text} onChange={(e) => setText(e.target.value)} />

        <div className="chips place-row">
          <label className="place-field">
            <span aria-hidden="true">장소</span>
            <input aria-label="장소" placeholder="카페, 학교…" maxLength={30} value={place} onChange={(e) => setPlace(e.target.value)} />
          </label>
          {recentPlaces.map((p) => (
            <button key={p} type="button" className="chip" style={{ background: 'var(--bg)' }} aria-pressed={place === p} onClick={() => setPlace(place === p ? '' : p)}>
              {p}
            </button>
          ))}
        </div>
        <label className="place-field" style={{ alignSelf: 'flex-start' }}>
          <span aria-hidden="true">누구랑</span>
          <input aria-label="누구랑" placeholder="혼자면 비워둬" maxLength={40} value={people} onChange={(e) => setPeople(e.target.value)} />
        </label>

        <div className="moods" role="group" aria-label="기분">
          {[1, 2, 3, 4, 5].map((v) => (
            <button key={v} type="button" aria-pressed={mood === v} aria-label={MOOD_WORDS[v]} onClick={() => setMood(mood === v ? undefined : v)}>
              <Moa size={38} mood={MOOD_FACE[v]} decorative />
              <span>{MOOD_WORDS[v]}</span>
            </button>
          ))}
        </div>

        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {photos.map((p) => (
            <Photo
              key={p}
              refPath={p}
              size={64}
              onRemove={() => {
                setPhotos(photos.filter((x) => x !== p));
                if (!original.includes(p)) void deletePhoto(p);
              }}
            />
          ))}
          {photos.length < 12 && (
            <label className="photo add" aria-label="사진 붙이기">
              {busy ? '…' : '+ 사진'}
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={async (e) => {
                  const files = [...(e.target.files ?? [])].slice(0, 12 - photos.length);
                  e.target.value = '';
                  if (!files.length) return;
                  setBusy(true);
                  const saved = (await Promise.all(files.map(savePhoto))).filter((x): x is string => !!x);
                  setPhotos((cur) => [...cur, ...saved]);
                  setBusy(false);
                }}
              />
            </label>
          )}
        </div>

        <div className="sub" style={{ fontSize: 13 }}>
          무슨 일이었어? <span style={{ fontSize: 12 }}>(안 골라도 돼)</span>
        </div>
        <CategoryChips value={actId} onChange={(id) => setActId(id === actId ? '' : id)} />
        {actId && !memory && (
          <label className="row" style={{ gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={asActivity && !future} disabled={future} onChange={(e) => setAsActivity(e.target.checked)} />
            {future ? '아직 안 온 시간이라 한 일로 칠하지는 않아' : '이 시간을 한 일로도 칠하기'}
          </label>
        )}

        {plan && (
          <label className="row" style={{ gap: 8, fontSize: 14, background: 'var(--bg)', borderRadius: 14, padding: '10px 12px' }}>
            <input type="checkbox" checked={completePlan} onChange={(e) => setCompletePlan(e.target.checked)} />
            계획 &lsquo;{plan.text}&rsquo; 했다고 표시
          </label>
        )}

        {here.length > 0 && (
          <button className="pill clear" style={{ alignSelf: 'flex-start', minHeight: 32, padding: 0 }} aria-expanded={more} onClick={() => setMore(!more)}>
            이 시간의 기록 {here.length}개 {more ? '접기' : '보기'}
          </button>
        )}
        {more &&
          here.map((iv) => (
            <div key={iv.id} className="row" style={{ gap: 8 }}>
              <span className="chip small" style={{ background: byId.get(iv.activityId)?.color }}>
                {byId.get(iv.activityId)?.name ?? '활동'}
              </span>
              <span className="grow sub" style={{ fontSize: 13 }}>
                {iv.kind === 'plan' ? '계획' : '한 일'} · {fmtHM(iv.start)}–{iv.end === null ? '지금' : fmtHM(iv.end)} · {fmtDur((iv.end ?? now) - iv.start)}
              </span>
              <button className="pill clear" style={{ minHeight: 32 }} onClick={() => removeInterval(iv.id)}>
                지우기
              </button>
            </div>
          ))}

        <button
          className="big-btn ink"
          disabled={!valid || !hasSomething || busy}
          onClick={() => {
            if (memory) {
              const clean = (v: string) => v.trim() || undefined;
              updateMemory(memory.id, { start, end, activityId: actId || null, text: text.trim(), place: clean(place), people: clean(people), mood, photos });
              original.filter((p) => !photos.includes(p)).forEach((p) => void deletePhoto(p));
              onClose();
              return;
            }
            recordRange({
              start,
              end,
              activityId: actId || null,
              asActivity: asActivity && !future,
              text,
              place,
              people,
              mood,
              photos,
              ...(plan ? { todoId: plan.id, completeTodo: completePlan } : {}),
            });
            onClose();
          }}
        >
          {memory ? '고치기' : '남기기'}
        </button>
        {memory && (
          <button
            className="pill clear"
            style={{ alignSelf: 'center' }}
            onClick={() => {
              removeMemory(memory.id);
              onClose();
            }}
          >
            이 메모 지우기
          </button>
        )}
      </div>
    </div>
  );
}
