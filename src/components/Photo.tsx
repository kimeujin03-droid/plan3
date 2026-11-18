import { useEffect, useState } from 'react';
import { photoSrc } from '../lib/photos';

/** 저장된 사진 하나를 작은 정사각형으로 */
export function Photo({ refPath, size = 72, onRemove }: { refPath: string; size?: number; onRemove?: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void photoSrc(refPath).then((s) => alive && setSrc(s));
    return () => {
      alive = false;
    };
  }, [refPath]);
  return (
    <span className="photo" style={{ width: size, height: size }}>
      {src && <img src={src} alt="" />}
      {onRemove && (
        <button type="button" aria-label="사진 빼기" onClick={onRemove}>
          ×
        </button>
      )}
    </span>
  );
}
