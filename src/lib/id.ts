let n = 0;
export function uid(prefix = 'x'): string {
  n += 1;
  return `${prefix}-${Date.now().toString(36)}-${n.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
