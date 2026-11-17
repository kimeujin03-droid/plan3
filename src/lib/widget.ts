import { Capacitor, registerPlugin } from '@capacitor/core';
import { activeIntervals } from './intervals';
import { SLEEP_ID } from './palette';
import type { Activity, Interval, Look } from './types';

/** 바탕화면 위젯에서 누른 것. 앱이 열릴 때 그 시각 그대로 기록에 옮긴다. */
export interface WidgetAction {
  op: 'start' | 'end';
  id: string;
  at: number;
}

interface WidgetState {
  running: { id: string; name: string; color: string; start: number }[];
  quick: { id: string; name: string; color: string }[];
  sleeping: boolean;
  accessory: Look['accessory'];
  board: Look['board'];
}

interface MoaWidgetPlugin {
  sync(state: WidgetState): Promise<void>;
  drain(): Promise<{ actions: WidgetAction[] }>;
}

const Native = registerPlugin<MoaWidgetPlugin>('MoaWidget');

/** 위젯에 보여줄 것만 뽑는다: 하는 중인 일, 빠른 버튼 4개(첫 화면 순서대로), 꾸미기 */
export function widgetState(intervals: Interval[], activities: Activity[], sleeping: boolean, look: Look): WidgetState {
  const byId = new Map(activities.map((a) => [a.id, a]));
  const running = activeIntervals(intervals)
    .filter((iv) => iv.activityId !== SLEEP_ID)
    .map((iv) => ({ id: iv.activityId, name: byId.get(iv.activityId)?.name ?? '', color: byId.get(iv.activityId)?.color ?? '#CFC6F3', start: iv.start }));
  const quick = activities
    .filter((a) => !a.parentId && a.id !== SLEEP_ID)
    .slice(0, 4)
    .map((a) => ({ id: a.id, name: a.name, color: a.color }));
  return { running, quick, sleeping, accessory: look.accessory, board: look.board };
}

export async function syncWidget(state: WidgetState): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Native.sync(state);
  } catch {
    /* 위젯이 없거나 오래된 앱: 무시 */
  }
}

/** 위젯에서 쌓인 누름을 가져오고 비운다. */
export async function drainWidget(): Promise<WidgetAction[]> {
  if (!Capacitor.isNativePlatform()) return [];
  try {
    const r = await Native.drain();
    return Array.isArray(r.actions) ? r.actions.filter((a) => (a.op === 'start' || a.op === 'end') && typeof a.id === 'string' && Number.isFinite(a.at)) : [];
  } catch {
    return [];
  }
}
