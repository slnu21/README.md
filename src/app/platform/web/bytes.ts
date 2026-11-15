// 바이트 도우미 — base64url · deflate-raw(브라우저 내장 CompressionStream). 새 의존성 없음.
// static-kit(slnu21, MIT) `src/save/bytes.ts` 에서 옮겨 왔다(같은 저작자). 모듈 최상위 부작용 없음.

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
let B64_REV: Int16Array | undefined;

/** 바이트 → base64url(RFC 4648 §5, 패딩 없음). */
export function toBase64Url(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[n >>> 18] + B64[(n >>> 12) & 63] + B64[(n >>> 6) & 63] + B64[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B64[n >>> 18] + B64[(n >>> 12) & 63];
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[n >>> 18] + B64[(n >>> 12) & 63] + B64[(n >>> 6) & 63];
  }
  return out;
}

/** base64url → 바이트. 잘못된 글자·불가능한 길이면 undefined. */
export function fromBase64Url(text: string): Uint8Array | undefined {
  if (!B64_REV) {
    B64_REV = new Int16Array(128).fill(-1);
    for (let i = 0; i < 64; i++) B64_REV[B64.charCodeAt(i)] = i;
  }
  const rev = B64_REV;
  if (text.length % 4 === 1) return undefined;
  const out = new Uint8Array(Math.floor((text.length * 3) / 4));
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const v = c < 128 ? rev[c] : -1;
    if (v < 0) return undefined;
    acc = ((acc << 6) | v) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >>> bits) & 0xff;
    }
  }
  return out;
}

/** CRC-32(IEEE) — 공유 문서의 가상 경로 식별자용(보안 아님). */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    let c = (crc ^ bytes[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function pipe(bytes: Uint8Array, stream: TransformStream<Uint8Array, Uint8Array>): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** `CompressionStream('deflate-raw')` 를 쓸 수 있나(Chrome 103+ · Firefox 113+ · Safari 16.4+ · Node 21.2+). */
export function hasDeflateRaw(): boolean {
  try {
    if (typeof CompressionStream !== "function" || typeof DecompressionStream !== "function") return false;
    new CompressionStream("deflate-raw" as CompressionFormat);
    return true;
  } catch {
    return false;
  }
}

export const deflateRaw = (bytes: Uint8Array): Promise<Uint8Array> =>
  pipe(bytes, new CompressionStream("deflate-raw" as CompressionFormat) as unknown as TransformStream<Uint8Array, Uint8Array>);

export const inflateRaw = (bytes: Uint8Array): Promise<Uint8Array> =>
  pipe(bytes, new DecompressionStream("deflate-raw" as CompressionFormat) as unknown as TransformStream<Uint8Array, Uint8Array>);

/** ArrayBuffer → 표준 base64(이미지 data: URI 용). */
export function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
