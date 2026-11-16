import { Capacitor } from '@capacitor/core';

const NUDGE_ID = 1;
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
