import { Capacitor } from '@capacitor/core';

const NUDGE_ID = 1;
const TIMER_ID = 2;
const NUDGE_AFTER_MS = 3 * 60 * 60 * 1000;

async function plugin() {
  if (!Capacitor.isNativePlatform()) return null;
  const mod = await import('@capacitor/local-notifications');
  return mod.LocalNotifications;
}

/** 알림 권한을 요청한다. 웹에서는 아무 일도 하지 않고 false를 돌려준다. */
export async function requestNudgePermission(): Promise<boolean> {
  try {
    const ln = await plugin();
    if (!ln) return false;
    const res = await ln.requestPermissions();
    return res.display === 'granted';
  } catch {
    return false;
  }
}

/**
 * 마지막 기록 뒤 3시간 동안 조용하면 한 번만 묻는 알림을 다시 맞춘다.
 * 기록할 때마다 부르므로 알림은 늘 하나만 예약되어 있고, 답이 없어도 반복해서 울리지 않는다.
 */
export async function rescheduleNudge(enabled: boolean): Promise<void> {
  try {
    const ln = await plugin();
    if (!ln) return;
    await ln.cancel({ notifications: [{ id: NUDGE_ID }] });
    if (!enabled) return;
    await ln.schedule({
      notifications: [
        {
          id: NUDGE_ID,
          title: '모아',
          body: '지난 몇 시간 뭐 했어? 나중에 한꺼번에 알려줘도 돼.',
          schedule: { at: new Date(Date.now() + NUDGE_AFTER_MS), allowWhileIdle: false },
        },
      ],
    });
  } catch {
    // 알림은 최선 노력: 실패해도 기록은 계속된다.
  }
}

/** 타이머·뽀모도로가 끝나는 시각에 알림 하나를 맞춘다. at이 null이면 취소만 한다. */
export async function scheduleTimerAlert(at: number | null, body = ''): Promise<void> {
  try {
    const ln = await plugin();
    if (!ln) return;
    await ln.cancel({ notifications: [{ id: TIMER_ID }] });
    if (at === null || at <= Date.now()) return;
    const perm = await ln.checkPermissions();
    if (perm.display !== 'granted' && (await ln.requestPermissions()).display !== 'granted') return;
    await ensureChannel(ln);
    await ln.schedule({ notifications: [{ id: TIMER_ID, title: '모아', body, channelId: CHANNEL, schedule: { at: new Date(at), allowWhileIdle: true } }] });
  } catch {
    // 알림이 안 와도 화면의 타이머는 그대로 돈다.
  }
}

/* ───── 계획 알림 ───── */

const CHANNEL = 'moa-plan';
const PLAN_BASE = 1000;
const PLAN_MAX = 60;
let channelReady = false;

async function ensureChannel(ln: Awaited<ReturnType<typeof plugin>>): Promise<void> {
  if (!ln || channelReady) return;
  try {
    // 소리와 진동이 있고 화면 위로 뜨는 채널. 안드로이드 8 이상에서만 의미가 있다.
    await ln.createChannel({ id: CHANNEL, name: '계획 알림', description: '약속 1시간 전, 마감 전 알림', importance: 5, visibility: 1, vibration: true });
  } catch {
    /* 채널을 못 만들면 기본 채널로 간다 */
  }
  channelReady = true;
}

export interface PlanAlert {
  at: number;
  title: string;
  body: string;
}

interface PlanLike {
  id: string;
  text: string;
  done: boolean;
  due: number | null;
  start?: number;
  end?: number;
  dueAt?: number;
  type?: string;
  activityId?: string;
}

export interface AlertContext {
  /** 이 구간들 중 하나로 일정이 이미 시작됐으면 '시작했어?'를 보내지 않는다 */
  intervals?: { activityId: string; kind: string; start: number }[];
  activities?: { id: string; parentId?: string }[];
  /** 아침·밤 한 줄 */
  brief?: boolean;
}

const HM = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * 계획마다 언제 알릴지 정한다. 순수 함수라 테스트할 수 있다.
 * - 시각이 있는 일: 1시간 전, 10분 전
 * - 마감 시각까지 정한 마감: 하루 전, 3시간 전, 1시간 전
 * - 날짜만 정한 마감: 전날 저녁 9시, 그날 아침 9시
 */
export function planAlerts(todos: PlanLike[], now: number, ctx: AlertContext = {}): PlanAlert[] {
  const out: PlanAlert[] = [];
  const DAY_MS = 24 * 60 * 60 * 1000;
  const startedNear = (t: PlanLike) => {
    if (!t.activityId || !ctx.intervals) return false;
    const ids = new Set([t.activityId, ...(ctx.activities ?? []).filter((a) => a.parentId === t.activityId).map((a) => a.id)]);
    return ctx.intervals.some((iv) => iv.kind === 'exec' && ids.has(iv.activityId) && iv.start >= t.start! - 20 * 60_000);
  };
  for (const t of todos) {
    if (t.done || t.type === 'hours') continue;
    if (t.start !== undefined && t.dueAt === undefined) {
      out.push({ at: t.start - 60 * 60_000, title: `1시간 뒤 · ${t.text}`, body: `${HM(t.start)}에 시작해. 미리 준비하자.` });
      out.push({ at: t.start - 10 * 60_000, title: `10분 뒤 · ${t.text}`, body: '슬슬 일어나서 움직일 시간!' });
      // 시작할 수 있는 일(활동이 있는 일정)인데 5분이 지나도 기록이 없으면 딱 한 번만 묻는다.
      if (t.activityId && !startedNear(t)) out.push({ at: t.start + 5 * 60_000, title: `${t.text} 시작했어?`, body: '아직이면 딱 5분만 해볼까? 눌러서 열어줘.' });
    } else if (t.dueAt !== undefined) {
      out.push({ at: t.dueAt - DAY_MS, title: `내일 ${HM(t.dueAt)}까지 · ${t.text}`, body: '하루 남았어. 오늘 조금만 해둘까?' });
      out.push({ at: t.dueAt - 3 * 60 * 60_000, title: `3시간 남음 · ${t.text}`, body: `${HM(t.dueAt)}까지야.` });
      out.push({ at: t.dueAt - 60 * 60_000, title: `1시간 남음 · ${t.text}`, body: `${HM(t.dueAt)} 마감. 지금 시작하면 돼!` });
    } else if (t.due !== null) {
      out.push({ at: t.due - 3 * 60 * 60_000, title: `내일까지 · ${t.text}`, body: '내일이 마감이야.' });
      out.push({ at: t.due + 9 * 60 * 60_000, title: `오늘까지 · ${t.text}`, body: '오늘이 마감이야. 할 수 있어!' });
    }
  }
  if (ctx.brief) out.push(...briefs(todos, now));
  return out.filter((a) => a.at > now + 30_000).sort((a, b) => a.at - b.at).slice(0, PLAN_MAX);
}

/** 아침 8시: 그날 계획 한 줄. 밤 9시 반: 빈 시간 채우기. 앞으로 사흘 치만. */
function briefs(todos: PlanLike[], now: number): PlanAlert[] {
  const out: PlanAlert[] = [];
  const d0 = new Date(now);
  const base = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate()).getTime();
  for (let i = 0; i < 3; i++) {
    const day = new Date(base);
    day.setDate(day.getDate() + i);
    const t0 = day.getTime();
    const items = todos
      .filter((t) => !t.done && t.type !== 'hours' && t.due === t0)
      .sort((a, b) => (a.start ?? a.dueAt ?? Infinity) - (b.start ?? b.dueAt ?? Infinity));
    if (items.length) {
      const list = items
        .slice(0, 3)
        .map((t) => (t.start !== undefined ? `${HM(t.start)} ${t.text}` : t.dueAt !== undefined ? `${t.text}(${HM(t.dueAt)}까지)` : `${t.text} 마감`))
        .join(', ');
      out.push({ at: t0 + 8 * 60 * 60_000, title: `오늘 ${items.length}개`, body: `${list}${items.length > 3 ? ' …' : ''}` });
    }
    out.push({ at: t0 + 21.5 * 60 * 60_000, title: '오늘 하루 어땠어?', body: '비어 있는 시간이 있으면 한 번에 채우고 자자.' });
  }
  return out;
}

/** 계획 알림을 모두 지우고 다시 맞춘다. 계획이 바뀔 때마다 부른다. */
export async function reschedulePlanAlerts(todos: PlanLike[], enabled: boolean, ctx: AlertContext = {}): Promise<void> {
  try {
    const ln = await plugin();
    if (!ln) return;
    const pending = await ln.getPending();
    const old = pending.notifications.filter((n) => n.id >= PLAN_BASE && n.id < PLAN_BASE + 1000).map((n) => ({ id: n.id }));
    if (old.length) await ln.cancel({ notifications: old });
    if (!enabled && !ctx.brief) return;
    const alerts = planAlerts(enabled ? todos : [], Date.now(), ctx);
    if (!alerts.length) return;
    const perm = await ln.checkPermissions();
    if (perm.display !== 'granted' && (await ln.requestPermissions()).display !== 'granted') return;
    await ensureChannel(ln);
    await ln.schedule({
      notifications: alerts.map((a, i) => ({
        id: PLAN_BASE + i,
        title: a.title,
        body: a.body,
        channelId: CHANNEL,
        schedule: { at: new Date(a.at), allowWhileIdle: true },
      })),
    });
  } catch {
    // 알림은 최선 노력: 실패해도 계획은 그대로다.
  }
}

/** 정확한 시각에 울릴 수 있는지(안드로이드 12+). 웹이면 null. */
export async function exactAlarmStatus(): Promise<'granted' | 'denied' | null> {
  try {
    const ln = await plugin();
    if (!ln) return null;
    const r = await ln.checkExactNotificationSetting();
    return r.exact_alarm === 'granted' ? 'granted' : 'denied';
  } catch {
    return null;
  }
}

/** 정확한 알람 설정 화면을 연다. */
export async function openExactAlarmSetting(): Promise<void> {
  try {
    const ln = await plugin();
    await ln?.changeExactNotificationSetting();
  } catch {
    /* 지원하지 않는 기기 */
  }
}
