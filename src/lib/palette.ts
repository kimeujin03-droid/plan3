import type { Activity } from './types';

export const SLEEP_ID = 'sleep';

export const DEFAULT_ACTIVITIES: Activity[] = [
  { id: 'study', name: '공부', color: '#FFB3A1' },
  { id: 'hw', name: '과제', color: '#C9B8FF' },
  { id: 'job', name: '알바', color: '#FFB0D0' },
  { id: 'paper', name: '논문', color: '#A6D2FF' },
  { id: 'class', name: '수업', color: '#9CE8C4' },
  { id: 'move', name: '이동', color: '#FFE169' },
  { id: SLEEP_ID, name: '수면', color: '#D5D9E8' },
];

export const EXTRA_COLORS = ['#B8F0E9', '#FFCF9E', '#E3C4F5', '#C8EFA0', '#F5C6C6', '#BFD0FF'];

export const FOCUS_SHADE: Record<number, string> = {
  1: '#EDE7FF',
  2: '#D9CCFF',
  3: '#BFA9FF',
  4: '#9F86F5',
  5: '#7A5CE0',
};

/** 16진수 색을 연하게(계획 칠) 만든다. */
export function soft(hex: string, alpha = 0.34): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
