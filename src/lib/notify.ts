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
    await ln.schedule({ notifications: [{ id: TIMER_ID, title: '모아', body, schedule: { at: new Date(at), allowWhileIdle: true } }] });
  } catch {
    // 알림이 안 와도 화면의 타이머는 그대로 돈다.
  }
}
