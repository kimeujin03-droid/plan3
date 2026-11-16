import type { ReactNode } from 'react';

const base = { width: 20, height: 20, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

const PATHS: Record<string, ReactNode> = {
  // 하단 탭
  home: (
    <>
      <path d="M4 8.5L5 3.5l3.5 2.6h3L15 3.5l1 5" />
      <rect x="3" y="6.5" width="14" height="10.5" rx="5" />
      <path d="M7.8 11v1.6M12.2 11v1.6" />
    </>
  ),
  record: (
    <>
      <rect x="3.5" y="4" width="13" height="13" rx="3" />
      <path d="M7 2.5v3M13 2.5v3M6.5 9.5h4M6.5 13h7" />
    </>
  ),
  todos: (
    <>
      <rect x="3.5" y="3.5" width="13" height="13" rx="3.5" />
      <path d="M7 10.2l2.2 2.2L13.2 8" />
    </>
  ),
  clock: (
    <>
      <circle cx="10" cy="10.5" r="6.5" />
      <path d="M10 7v3.8l2.4 1.4M8 2.5h4" />
    </>
  ),
  // 기본 활동
  study: <path d="M10 5.5C8.5 4.3 6 4 3.5 4.5v10c2.5-.5 5-.2 6.500 1 1.500-1.200 4-1.500 6.500-1v-10C14 4 11.500 4.300 10 5.500zm0 0v10" />,
  hw: (
    <>
      <rect x="4.500" y="3.500" width="11" height="13.500" rx="2.500" />
      <path d="M7.500 2.500h5v2.500h-5zM7.500 9h5M7.500 12.500h3.500" />
    </>
  ),
  job: (
    <>
      <rect x="3" y="6.500" width="14" height="10" rx="2.500" />
      <path d="M7.500 6.500V5a1.500 1.500 0 0 1 1.500-1.500h2A1.500 1.500 0 0 1 12.500 5v1.500M3 11h14" />
    </>
  ),
  paper: (
    <>
      <path d="M2.500 8L10 4.500 17.500 8 10 11.500z" />
      <path d="M5.500 9.800v3.700c1.300 1.300 2.800 1.900 4.500 1.900s3.200-.600 4.500-1.900V9.800M17.500 8v4" />
    </>
  ),
  class: (
    <>
      <path d="M3 8l7-4.500L17 8M4.500 8v8M15.500 8v8M3 16.500h14M8 16v-4.500h4V16" />
    </>
  ),
  move: (
    <>
      <path d="M3.500 11l1.300-4.200A2 2 0 0 1 6.700 5.400h6.600a2 2 0 0 1 1.900 1.400L16.500 11v4h-13z" />
      <path d="M3.500 11h13M6.500 13.200h.01M13.500 13.200h.01M5 15v1.500M15 15v1.500" />
    </>
  ),
  sleep: <path d="M15.500 12.500A6.500 6.500 0 0 1 7.500 4.500a6.500 6.500 0 1 0 8 8z" />,
};

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const body = PATHS[name];
  if (!body) return null;
  return (
    <svg {...base} width={size} height={size} style={{ flex: 'none' }}>
      {body}
    </svg>
  );
}

export const hasIcon = (name: string) => name in PATHS;
