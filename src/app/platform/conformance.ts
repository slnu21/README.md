// 컴파일 시간 계약 검사 — 웹 구현이 데스크톱 구현과 **같은 이름·같은 모양**의 값을 전부 내놓는가.
// 앱 코드는 `@platform` 하나로 닿고 빌드가 구현을 고르므로(vite.config.ts), 한쪽에만 함수를 더하면
// 다른 빌드가 런타임에 깨진다. 이 파일은 어디서도 import 하지 않는다(번들에 안 들어간다) — tsc 만 본다.
import type * as Desktop from "./tauri";
import * as Web from "./web";

export const webConformsToDesktop: typeof Desktop = Web;
