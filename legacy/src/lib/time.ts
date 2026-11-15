export function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function formatDateKorean(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const dayOfWeek = weekdays[date.getDay()];
  return `${y}년 ${m}월 ${d}일 ${dayOfWeek}요일`;
}

export function cellTimeText(hour: number, col: number): string {
  const min = col * 10;
  return `${pad2(hour)}:${pad2(min)}`;
}
