// Clipboard image handling for the composer (ATTACH-1).
// Mirrors the official TUI flow (letta-code paste-registry + image-resize):
// resize to max 2000×2000 / 5MB via canvas, keep raw base64 (no data: prefix).

export const MAX_DIM = 2000;
export const MAX_BYTES = 5 * 1024 * 1024;

export interface PreparedImage {
  /** Raw base64, no data: prefix (SDK requirement). */
  base64: string;
  mediaType: string;
  width: number;
  height: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = src;
  });
}

function canvasToPngBase64(
  img: HTMLImageElement,
  w: number,
  h: number,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(img, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/png");
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

/** Decode, downscale if needed, return raw base64 + dims. */
export async function prepareImage(dataUrl: string): Promise<PreparedImage> {
  const img = await loadImage(dataUrl);
  let { naturalWidth: w, naturalHeight: h } = img;
  const scale = Math.min(1, MAX_DIM / Math.max(w, h));
  let base64: string;
  if (scale < 1) {
    w = Math.round(w * scale);
    h = Math.round(h * scale);
    base64 = canvasToPngBase64(img, w, h);
  } else {
    base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  }
  // Byte-limit re-encode pass (PNG rescale can still exceed 5MB).
  if (base64.length * 0.75 > MAX_BYTES) {
    const natural = { w: img.naturalWidth, h: img.naturalHeight };
    const shrink = Math.max(0.5, scale * (MAX_BYTES / (base64.length * 0.75)));
    w = Math.round(natural.w * shrink);
    h = Math.round(natural.h * shrink);
    base64 = canvasToPngBase64(img, w, h);
  }
  return { base64, mediaType: "image/png", width: w, height: h };
}

/** Extract image files from a ClipboardEvent/DataTransfer. */
export function imagesFromClipboard(
  e: ClipboardEvent | React.ClipboardEvent,
): string[] {
  const out: string[] = [];
  const items = e.clipboardData?.items;
  if (!items) return out;
  for (const item of Array.from(items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) out.push(file.name);
      // Note: the data URL is read by the caller (async) via fileToDataUrl.
    }
  }
  return out;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}
