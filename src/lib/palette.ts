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

/** 일상: 공부·일 말고도 남길 가치가 있는 시간 */
export const LIFE_ID = 'life';
export const LIFE_ACTIVITIES: Activity[] = [
  { id: LIFE_ID, name: '일상', color: '#FFD3B6' },
  { id: 'date', name: '데이트', color: '#FFC2D4', parentId: LIFE_ID },
  { id: 'friends', name: '친구', color: '#FFE0A8', parentId: LIFE_ID },
  { id: 'rest', name: '휴식', color: '#C9E7FF', parentId: LIFE_ID },
  { id: 'cafe', name: '카페', color: '#E8D5C4', parentId: LIFE_ID },
  { id: 'etc', name: '기타', color: '#E0E0EA', parentId: LIFE_ID },
];

export const EXTRA_COLORS = ['#B8F0E9', '#FFCF9E', '#E3C4F5', '#C8EFA0', '#F5C6C6', '#BFD0FF'];

/** 활동 색 고르기에서 보여 줄 색들(파스텔 위주, 격자에서 글씨가 읽히는 밝기) */
export const PICK_COLORS = [
  '#FFB3A1', '#FFB0D0', '#FFC2D4', '#F5C6C6', '#FFCF9E', '#FFD3B6', '#FFE169', '#FFE0A8',
  '#C8EFA0', '#9CE8C4', '#B8F0E9', '#C9E7FF', '#A6D2FF', '#BFD0FF', '#C9B8FF', '#E3C4F5',
  '#E8D5C4', '#D5D9E8', '#E0E0EA', '#B5B3C9',
];

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

function mix(hex: string, target: number, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => {
    const v = (n >> shift) & 255;
    return Math.round(v + (target - v) * t)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** 하위 활동 색: 대주제 색을 번갈아 진하게·연하게 해서 같은 계열로 보이면서 구분되게 한다. */
export function childColor(parent: string, index: number): string {
  const step = Math.floor(index / 2) + 1;
  return index % 2 === 0 ? mix(parent, 60, Math.min(0.5, 0.22 * step)) : mix(parent, 255, Math.min(0.6, 0.38 * step));
}

/** 대주제 id. 하위 활동이면 그 부모, 아니면 자기 자신. */
export function rootOf(activities: Activity[], id: string): string {
  return activities.find((a) => a.id === id)?.parentId ?? id;
}
