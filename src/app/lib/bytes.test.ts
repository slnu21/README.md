import { describe, expect, it } from "vitest";
import { bytesToBase64 } from "./bytes";

// 정답지 = Node Buffer. 이미지 붙여넣기가 이 변환에 걸려 있어 바이너리 정확성이 중요하다.
// @types/node를 프로젝트에 들이지 않으려고 필요한 만큼만 지역 선언한다(런타임엔 vitest=node 환경).
declare const Buffer: { from(b: Uint8Array): { toString(enc: "base64"): string } };
const ref = (b: Uint8Array) => Buffer.from(b).toString("base64");

describe("bytesToBase64", () => {
  it("빈 배열", () => expect(bytesToBase64(new Uint8Array(0))).toBe(ref(new Uint8Array(0))));

  it.each([
    ["1바이트", [0]],
    ["패딩 1 (2바이트)", [1, 2]],
    ["패딩 0 (3바이트)", [1, 2, 3]],
    ["PNG 시그니처", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ])("%s", (_label, arr) => {
    const b = new Uint8Array(arr as number[]);
    expect(bytesToBase64(b)).toBe(ref(b));
  });

  it("0~255 전 바이트값 (상위 비트 켜진 바이트도)", () => {
    const b = new Uint8Array(256).map((_, i) => i);
    expect(bytesToBase64(b)).toBe(ref(b));
  });

  // 청크(0x8000) 경계에서 이어 붙이기가 어긋나면 여기서 깨진다.
  it.each([0x7fff, 0x8000, 0x8001, 0x10000, 0x10001])("청크 경계 %i바이트", (n) => {
    const b = new Uint8Array(n).map((_, i) => (i * 31 + 7) & 0xff);
    expect(bytesToBase64(b)).toBe(ref(b));
  });

  it("5MB — 정확하고 스택도 넘지 않는다", () => {
    const b = new Uint8Array(5 * 1024 * 1024).map((_, i) => (i * 131 + 17) & 0xff);
    expect(bytesToBase64(b)).toBe(ref(b));
  });

  // 청크가 왜 필요한가 — 한 번에 펼치면 실제로 죽는다는 근거를 테스트로 고정한다.
  it("청크 없이 펼치면 스택이 터진다(청크가 필요한 이유)", () => {
    const b = new Uint8Array(5 * 1024 * 1024);
    expect(() => String.fromCharCode(...b)).toThrow();
  });
});
