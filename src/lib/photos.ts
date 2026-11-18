import { Capacitor } from '@capacitor/core';

const MAX_SIDE = 1280;
const WEB_SIDE = 480;

/** 고른 사진을 줄여서 JPEG로 만든다(긴 변 1280px). */
async function shrink(file: File, side: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const k = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * k);
  canvas.height = Math.round(bitmap.height * k);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.82);
}

/**
 * 사진을 저장하고 가리키는 값을 돌려준다.
 * 앱: 앱 전용 폴더의 photos/…jpg (기록 파일과 따로 둬서 기록이 무거워지지 않게).
 * 웹: 미리보기용 작은 data URL.
 */
export async function savePhoto(file: File): Promise<string | null> {
  try {
    if (!Capacitor.isNativePlatform()) return await shrink(file, WEB_SIDE);
    const data = await shrink(file, MAX_SIDE);
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const path = `photos/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.jpg`;
    await Filesystem.writeFile({ path, data: data.split(',')[1], directory: Directory.Data, recursive: true });
    return path;
  } catch {
    return null;
  }
}

/** 화면에 띄울 주소 */
export async function photoSrc(ref: string): Promise<string> {
  if (ref.startsWith('data:') || !Capacitor.isNativePlatform()) return ref;
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const { uri } = await Filesystem.getUri({ path: ref, directory: Directory.Data });
  return Capacitor.convertFileSrc(uri);
}

export async function deletePhoto(ref: string): Promise<void> {
  if (ref.startsWith('data:') || !Capacitor.isNativePlatform()) return;
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    await Filesystem.deleteFile({ path: ref, directory: Directory.Data });
  } catch {
    /* 이미 없으면 그만 */
  }
}
