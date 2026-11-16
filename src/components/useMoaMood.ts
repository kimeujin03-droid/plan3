import { activeIntervals } from '../lib/intervals';
import { SLEEP_ID } from '../lib/palette';
import { useStore } from '../store';
import type { MoaMood } from './Moa';

const CHEER_MS = 2600;

/** 지금 상황에 맞는 모아의 표정. 위에 있는 조건일수록 먼저 본다. */
export function useMoaMood(now: number): MoaMood {
  const thinking = useStore((s) => s.thinking);
  const sleeping = useStore((s) => s.sleeping);
  const cheerAt = useStore((s) => s.cheerAt);
  const working = useStore((s) => activeIntervals(s.intervals).some((iv) => iv.activityId !== SLEEP_ID));
  if (thinking) return 'think';
  if (sleeping) return 'sleep';
  if (now - cheerAt < CHEER_MS) return 'excited';
  if (working) return 'focus';
  // 새벽에는 모아도 졸리다.
  const hour = new Date(now).getHours();
  if (hour >= 1 && hour < 6) return 'tired';
  return 'idle';
}
