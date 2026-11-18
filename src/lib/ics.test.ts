import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { parseIcs, readCalendarFile } from './ics';

const ICS = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'UID:calc@google.com',
  'SUMMARY:기초미적분학',
  'LOCATION:공학관 301',
  'DTSTART;TZID=Asia/Tokyo:20260903T100000',
  'DTEND;TZID=Asia/Tokyo:20260903T113000',
  'RRULE:FREQ=WEEKLY;BYDAY=MO,TH;UNTIL=20261231T145959Z',
  'EXDATE;TZID=Asia/Tokyo:20261123T100000',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:calc@google.com',
  'RECURRENCE-ID;TZID=Asia/Tokyo:20261119T100000',
  'SUMMARY:기초미적분학 (보강)',
  'DTSTART;TZID=Asia/Tokyo:20261119T130000',
  'DTEND;TZID=Asia/Tokyo:20261119T143000',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:dental',
  'SUMMARY:치과\\, 스케일링',
  'DTSTART:20261120T060000Z',
  'DURATION:PT30M',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:bday',
  'SUMMARY:생일',
  'DTSTART;VALUE=DATE:20261121',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:gone',
  'SUMMARY:취소된 약속',
  'STATUS:CANCELLED',
  'DTSTART:20261120T010000Z',
  'DTEND:20261120T020000Z',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:long',
  'SUMMARY:아주 긴 제목이 다음 줄로',
  '  이어진다',
  'DTSTART;TZID=Asia/Tokyo:20261122T090000',
  'DTEND;TZID=Asia/Tokyo:20261122T100000',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const jst = (mo: number, d: number, h: number, mi = 0) => Date.UTC(2026, mo - 1, d, h - 9, mi);
const from = jst(11, 18, 0);
const to = jst(11, 25, 0);

describe('캘린더 파일 읽기', () => {
  const { events, allDay } = parseIcs(ICS, from, to);

  it('반복 수업을 이번 주 안에서 펼치고, 뺀 날과 옮긴 날을 반영한다', () => {
    const calc = events.filter((e) => e.text.startsWith('기초미적분학'));
    // 11/19(목)은 13시 보강으로 옮겨졌고, 11/23(월)은 휴강(EXDATE)
    expect(calc.map((e) => [e.text, e.start, e.end])).toEqual([['기초미적분학 (보강)', jst(11, 19, 13), jst(11, 19, 14, 30)]]);
  });

  it('UTC 시각, DURATION, 이스케이프, 줄 이어짐을 읽는다', () => {
    expect(events.find((e) => e.text === '치과, 스케일링')).toMatchObject({ start: jst(11, 20, 15), end: jst(11, 20, 15, 30) });
    expect(events.find((e) => e.text.startsWith('아주 긴'))?.text).toBe('아주 긴 제목이 다음 줄로 이어진다');
  });

  it('종일 일정은 세기만 하고, 취소된 일정은 뺀다', () => {
    expect(allDay).toBe(1);
    expect(events.some((e) => e.text === '취소된 약속')).toBe(false);
  });

  it('같은 회차는 같은 표지를 가진다', () => {
    const again = parseIcs(ICS, from, to).events.map((e) => e.ext);
    expect(again).toEqual(events.map((e) => e.ext));
    expect(new Set(again).size).toBe(again.length);
  });

  it('반복 수업을 몇 주에 걸쳐 펼친다', () => {
    const many = parseIcs(ICS, jst(11, 1, 0), jst(12, 1, 0)).events.filter((e) => e.text === '기초미적분학');
    // 11월 월·목: 2,5,9,12,16,(19 보강),(23 휴강),26,30 → 7회
    expect(many).toHaveLength(7);
    expect(many.every((e) => (e.start - jst(11, 2, 10)) % (24 * 3600_000) === 0)).toBe(true);
  });

  it('구글 내보내기 zip에서도 꺼낸다', async () => {
    const zip = zipSync({ 'me@gmail.com.ics': strToU8(ICS), 'readme.txt': strToU8('x') });
    const file = { arrayBuffer: async () => zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) } as unknown as File;
    const texts = await readCalendarFile(file);
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain('기초미적분학');
  });
});
