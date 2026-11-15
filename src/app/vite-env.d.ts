/// <reference types="vite/client" />

/** 웹 에디션 빌드인가 — vite.config.ts `define` 이 빌드 때 리터럴로 바꾼다(데스크톱·vitest·프로브 = false).
 *  웹 전용 코드는 반드시 이 상수 뒤에 둔다 — 데스크톱 번들에서 상수 접기로 통째로 빠지게. */
declare const __WEB__: boolean;
