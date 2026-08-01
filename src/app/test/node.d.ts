// 테스트 전용 Node 표준 모듈 최소 선언. (앱 코드에서 import 하지 않는다.)
//
// @types/node 를 devDependency 로 들이지 않으려고 필요한 표면만 손으로 적는다 — bytes.test.ts 가
// Buffer 를 지역 선언하는 것과 같은 이유(의존성 추가는 별도 결정이고, 앱은 Node API 를 쓰지 않는다).
// 쓰는 곳: lib/mermaid.upstream.test.ts (상류 mermaid 번들을 읽어 대조).

declare module "node:fs" {
  export function readFileSync(path: string, encoding: string): string;
  export function readdirSync(path: string): string[];
}

declare module "node:path" {
  export function dirname(p: string): string;
  export function join(...parts: string[]): string;
}

declare module "node:url" {
  export function fileURLToPath(url: string): string;
}
