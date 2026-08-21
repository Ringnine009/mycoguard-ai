import React, { useRef, useState } from 'react';
import { Camera, Trash, Upload } from './icons';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_EDGE = 1600;

export interface PreparedPhoto {
  blob: Blob;
  previewUrl: string;
  fileName: string;
  width: number;
  height: number;
}

/** Downscale + re-encode to JPEG client-side (smaller payload, strips EXIF). */
async function preparePhoto(file: File): Promise<PreparedPhoto> {
  let width = 0;
  let height = 0;
  let bitmap: ImageBitmap | HTMLImageElement | null = null;

  try {
    if ('createImageBitmap' in window) {
      bitmap = await createImageBitmap(file);
      width = bitmap.width;
      height = bitmap.height;
    }
  } catch {
    bitmap = null;
  }

  if (!bitmap) {
    // Fallback: upload as-is (server still downscales + strips metadata).
    return {
      blob: file,
      previewUrl: URL.createObjectURL(file),
      fileName: file.name,
      width: 0,
      height: 0,
    };
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 不可用');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('图片编码失败'))), 'image/jpeg', 0.85);
  });

  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '.jpg';
  const fileName = file.name.replace(ext, '') + '.jpg';
  return { blob, previewUrl: URL.createObjectURL(blob), fileName, width: canvas.width, height: canvas.height };
}

interface PhotoCaptureProps {
  photo: PreparedPhoto | null;
  disabled?: boolean;
  onPhoto: (photo: PreparedPhoto) => void;
  onClear: () => void;
}

export const PhotoCapture: React.FC<PhotoCaptureProps> = ({ photo, disabled, onPhoto, onClear }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined | null) => {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('请上传图片文件（jpeg / png / webp）。');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('图片超过 8MB 上限，请压缩后重试。');
      return;
    }
    try {
      onPhoto(await preparePhoto(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : '图片处理失败。');
    }
  };

  return (
    <div className="input-scroll">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {!photo ? (
        <div
          className={`dropzone${dragging ? ' dragging' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void handleFile(e.dataTransfer.files?.[0]);
          }}
        >
          <div className="dz-icon">
            <Camera size={34} />
          </div>
          <div className="dz-title">点击或拖入蘑菇照片</div>
          <div className="dz-sub">jpeg / png / webp · 最大 8MB</div>
          <div className="dz-sub" style={{ marginTop: 8 }}>
            <Upload size={12} /> 需后端视觉服务；不可用时自动回退离线模式
          </div>
        </div>
      ) : (
        <div className="photo-preview">
          <img src={photo.previewUrl} alt="待分析蘑菇照片预览" />
          <div className="photo-actions">
            <button type="button" className="icon-btn" onClick={onClear} aria-label="移除照片" title="移除照片">
              <Trash size={15} />
            </button>
          </div>
        </div>
      )}

      {photo && (
        <div className="photo-meta">
          {photo.fileName} · {photo.width > 0 ? `${photo.width}×${photo.height}px` : '原尺寸'} ·{' '}
          {(photo.blob.size / 1024 / 1024).toFixed(2)} MB
        </div>
      )}

      {error && <div className="form-error">{error}</div>}

      <div className="form-note">
        视觉识别通过后端代理调用多模态模型（qwen-vl-plus），模型只会记录它实际看到的性状；
        不足 3 项时同样强制「无法判断」。模型输出仅作为观察补充，不改变离线规则引擎的风险语言。
      </div>

      {photo && !disabled && (
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => inputRef.current?.click()}>
            更换照片
          </button>
        </div>
      )}
    </div>
  );
};
