import { Capacitor } from '@capacitor/core';
import type { StateStorage } from 'zustand/middleware';

const FILE = 'moa-v1.json';
const TMP = 'moa-v1.tmp.json';
const DEBOUNCE_MS = 400;

let pending: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let writing: Promise<void> = Promise.resolve();

async function fs() {
  const mod = await import('@capacitor/filesystem');
  return mod;
}

async function writeNow(value: string): Promise<void> {
  const { Filesystem, Directory, Encoding } = await fs();
  // 임시 파일에 다 쓴 뒤 이름을 바꿔서, 쓰는 도중 앱이 죽어도 기존 기록이 깨지지 않게 한다.
  await Filesystem.writeFile({ path: TMP, data: value, directory: Directory.Data, encoding: Encoding.UTF8 });
  await Filesystem.rename({ from: TMP, to: FILE, directory: Directory.Data, toDirectory: Directory.Data });
}

/** 미뤄둔 저장을 지금 끝낸다. 앱이 백그라운드로 갈 때 부른다. */
export function flushStorage(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (pending !== null) {
    const value = pending;
    pending = null;
    writing = writing.then(() => writeNow(value)).catch(() => undefined);
  }
  return writing;
}

/**
 * 기록 저장소. 앱에서는 앱 전용 폴더의 파일에, 웹에서는 localStorage에 둔다.
 * WebView의 localStorage는 저장 공간이 부족하면 시스템이 비울 수 있어서 앱에서는 쓰지 않는다.
 */
export const moaStorage: StateStorage = {
  async getItem(name) {
    if (!Capacitor.isNativePlatform()) return localStorage.getItem(name);
    try {
      const { Filesystem, Directory, Encoding } = await fs();
      const res = await Filesystem.readFile({ path: FILE, directory: Directory.Data, encoding: Encoding.UTF8 });
      if (typeof res.data === 'string' && res.data) return res.data;
    } catch {
      // 파일이 아직 없다: 예전 버전이 localStorage에 남긴 기록이 있으면 그걸 이어받는다.
    }
    return localStorage.getItem(name);
  },

  setItem(name, value) {
    if (!Capacitor.isNativePlatform()) {
      localStorage.setItem(name, value);
      return;
    }
    pending = value;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void flushStorage();
    }, DEBOUNCE_MS);
  },

  async removeItem(name) {
    localStorage.removeItem(name);
    if (!Capacitor.isNativePlatform()) return;
    pending = null;
    try {
      const { Filesystem, Directory } = await fs();
      await Filesystem.deleteFile({ path: FILE, directory: Directory.Data });
    } catch {
      /* 없으면 지울 것도 없다 */
    }
  },
};

/** 기록 전체를 파일로 만들어 공유 시트를 연다. 앱이 아니면 false. */
export async function shareExport(json: string, filename: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  const { Filesystem, Directory, Encoding } = await fs();
  const { Share } = await import('@capacitor/share');
  const file = await Filesystem.writeFile({ path: filename, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 });
  await Share.share({ title: 'MOA 기록 내보내기', files: [file.uri] });
  return true;
}

/* ───── 하루 한 번 자동 백업 ───── */

const BACKUP_DIR = 'backups';
const KEEP = 7;
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * 하루에 한 번, 그날의 기록을 backups/moa-YYYY-MM-DD.json으로 남기고 최근 7개만 둔다.
 * 이 폴더는 안드로이드 자동 백업(구글 계정 백업)에도 같이 올라가서, 폰을 바꾸거나 다시 깔아도 돌아온다.
 */
export async function dailyBackup(json: string, now = Date.now()): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Filesystem, Directory, Encoding } = await fs();
    const d = new Date(now);
    const name = `moa-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
    let files: string[] = [];
    try {
      files = (await Filesystem.readdir({ path: BACKUP_DIR, directory: Directory.Data })).files.map((f) => f.name);
    } catch {
      await Filesystem.mkdir({ path: BACKUP_DIR, directory: Directory.Data, recursive: true });
    }
    if (files.includes(name)) return;
    await Filesystem.writeFile({ path: `${BACKUP_DIR}/${name}`, data: json, directory: Directory.Data, encoding: Encoding.UTF8 });
    const old = [...files, name].filter((f) => /^moa-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(0, -KEEP);
    for (const f of old) await Filesystem.deleteFile({ path: `${BACKUP_DIR}/${f}`, directory: Directory.Data }).catch(() => undefined);
  } catch {
    // 백업은 최선 노력: 실패해도 기록은 그대로다.
  }
}

/** 남아 있는 자동 백업 목록(새것부터). 앱이 아니면 빈 목록. */
export async function listBackups(): Promise<string[]> {
  if (!Capacitor.isNativePlatform()) return [];
  try {
    const { Filesystem, Directory } = await fs();
    return (await Filesystem.readdir({ path: BACKUP_DIR, directory: Directory.Data })).files
      .map((f) => f.name)
      .filter((f) => /^moa-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export async function readBackup(name: string): Promise<string | null> {
  try {
    const { Filesystem, Directory, Encoding } = await fs();
    const res = await Filesystem.readFile({ path: `${BACKUP_DIR}/${name}`, directory: Directory.Data, encoding: Encoding.UTF8 });
    return typeof res.data === 'string' ? res.data : null;
  } catch {
    return null;
  }
}
