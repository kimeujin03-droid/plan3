import { describe, expect, it } from 'vitest';
import { memoBoxes } from '../components/Grid';
import { HOUR, MIN } from './time';

const day = new Date(2026, 10, 17).getTime();
const memo = (start: number, end: number, text: string) => ({ id: 'm', start, end, activityId: null, text, photos: [], createdAt: 0 });

describe('한마디 상자', () => {
  it('여러 시간에 걸치면 줄마다 상자를 나누고 글을 이어서 담는다', () => {
    const boxes = memoBoxes(memo(day + 15 * HOUR + 20 * MIN, day + 17 * HOUR + 40 * MIN, '친구랑 카페에서 케이크 먹으면서 수다 떨고 산책했어'), day, '#FFE0A8', '친구랑 카페에서 케이크 먹으면서 수다 떨고 산책했어');
    expect(boxes.map((b) => [b.row, b.col, b.span, b.first, b.last])).toEqual([
      [15, 2, 4, true, false],
      [16, 0, 6, false, false],
      [17, 0, 4, false, true],
    ]);
    expect(boxes.map((b) => b.text).join('')).toBe('친구랑 카페에서 케이크 먹으면서 수다 떨고 산책했어');
  });
  it('글이 넘치면 마지막 상자 끝을 …로 줄인다', () => {
    const boxes = memoBoxes(memo(day, day + 10 * MIN, 'x'), day, '#000000', '가나다라마바사');
    expect(boxes).toHaveLength(1);
    expect(boxes[0].text).toBe('가나다…');
  });
});
