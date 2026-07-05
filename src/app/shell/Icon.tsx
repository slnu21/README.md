// 인라인 SVG 아이콘. 스프라이트(<symbol>) 1회 + <use> 참조.
// 색/획은 .ic CSS(fill:none; stroke:currentColor)가 담당하므로 심볼은 경로만 정의.
// 아이콘 라이브러리 미설치(오프라인 원칙) → 자체 스프라이트 사용.

export type IconName =
  | "folder"
  | "file"
  | "star"
  | "clock"
  | "search"
  | "sun"
  | "moon"
  | "paper"
  | "save"
  | "export"
  | "chev"
  | "plus"
  | "x"
  | "min"
  | "max"
  | "list"
  | "gear"
  | "type"
  | "zoom"
  | "pin"
  | "read"
  | "present";

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={className ? `ic ${className}` : "ic"} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}

export function IconSprite() {
  return (
    <svg className="sprite" aria-hidden="true">
      <defs>
        <symbol id="i-folder" viewBox="0 0 24 24">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </symbol>
        <symbol id="i-file" viewBox="0 0 24 24">
          <path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
          <path d="M14 3v5h5" />
        </symbol>
        <symbol id="i-star" viewBox="0 0 24 24">
          <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
        </symbol>
        <symbol id="i-clock" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5V12l3 2" />
        </symbol>
        <symbol id="i-search" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.6-3.6" />
        </symbol>
        <symbol id="i-sun" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19" />
        </symbol>
        <symbol id="i-moon" viewBox="0 0 24 24">
          <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
        </symbol>
        <symbol id="i-paper" viewBox="0 0 24 24">
          <path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
          <path d="M9 10h6M9 13.5h6M9 17h4" />
        </symbol>
        <symbol id="i-save" viewBox="0 0 24 24">
          <path d="M5 3h11l3 3v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
          <path d="M8 3v5h7V3M8 21v-6h8v6" />
        </symbol>
        <symbol id="i-export" viewBox="0 0 24 24">
          <path d="M12 15V4M8.5 7.5L12 4l3.5 3.5" />
          <path d="M5 14v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" />
        </symbol>
        <symbol id="i-chev" viewBox="0 0 24 24">
          <path d="M9 6l6 6-6 6" />
        </symbol>
        <symbol id="i-plus" viewBox="0 0 24 24">
          <path d="M12 5v14M5 12h14" />
        </symbol>
        <symbol id="i-x" viewBox="0 0 24 24">
          <path d="M6 6l12 12M18 6L6 18" />
        </symbol>
        <symbol id="i-min" viewBox="0 0 24 24">
          <path d="M5 12h14" />
        </symbol>
        <symbol id="i-max" viewBox="0 0 24 24">
          <rect x="5" y="5" width="14" height="14" rx="1.5" />
        </symbol>
        <symbol id="i-list" viewBox="0 0 24 24">
          <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
        </symbol>
        <symbol id="i-gear" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4L5.3 5.3" />
        </symbol>
        <symbol id="i-type" viewBox="0 0 24 24">
          <path d="M5 7V5h14v2M12 5v14M9 19h6" />
        </symbol>
        <symbol id="i-zoom" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.6-3.6M8 11h6M11 8v6" />
        </symbol>
        <symbol id="i-pin" viewBox="0 0 24 24">
          <path d="M9 3h6l-1 6 3 3v2H7v-2l3-3zM12 14v7" />
        </symbol>
        <symbol id="i-read" viewBox="0 0 24 24">
          <path d="M12 6C10 4.7 7.5 4.5 4 5v13c3.5-.5 6-.3 8 1z" />
          <path d="M12 6c2-1.3 4.5-1.5 8-1v13c-3.5-.5-6-.3-8 1z" />
        </symbol>
        <symbol id="i-present" viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="12" rx="1.5" />
          <path d="M12 16v3M8.5 21h7M10.5 8l3.5 2-3.5 2z" />
        </symbol>
      </defs>
    </svg>
  );
}
