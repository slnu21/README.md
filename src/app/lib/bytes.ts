// 바이트 ↔ base64. IPC(Rust 커맨드)와 data URI 가 문자열만 실어 나르므로 공용으로 둔다.

/** Uint8Array → base64.
 *  청크로 나누는 이유: `String.fromCharCode(...bytes)`는 인자를 스택에 펼치므로 큰 이미지(수 MB)에서
 *  "Maximum call stack size exceeded"로 죽는다. 0x8000 씩 잘라 이어 붙인다. */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
