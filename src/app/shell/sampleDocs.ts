// 셸(WBS 509) 플레이스홀더용 샘플 문서.
// 실제 에디터(WBS 522)·미리보기(WBS 511)가 붙기 전까지 시안의 모양을 유지하기 위한 정적 데이터.
// src: 하이라이트 스팬이 포함된 소스 줄 배열 / html: 조판된 미리보기 HTML.
// (모두 우리가 작성한 정적 콘텐츠 — 사용자 입력 아님)

export type DocId = "readme" | "guide";

export interface DocView {
  src: string[];
  html: string;
  words: number;
  ln: number;
  col: number;
  active: number; // 활성(커서) 줄 인덱스
}

export interface DocEntry {
  dirty: boolean;
  ko: DocView;
  en: DocView;
}

export const DOCS: Record<DocId, DocEntry> = {
  readme: {
    dirty: false,
    ko: {
      words: 30,
      ln: 3,
      col: 55,
      active: 2,
      src: [
        '<span class="t-h">#</span> <span class="t-h">md-reader</span>',
        "",
        '가볍고 100% 오프라인인 마크다운 <span class="t-b">**리더 &amp; 에디터**</span>.',
        "",
        '<span class="t-h">##</span> <span class="t-h">기능</span>',
        "",
        '<span class="t-m">- [</span><span class="t-x">x</span><span class="t-m">]</span> 파일 / 폴더 열기',
        '<span class="t-m">- [</span><span class="t-x">x</span><span class="t-m">]</span> 실시간 분할 미리보기',
        '<span class="t-m">- [ ]</span> HTML / PDF 내보내기',
        "",
        '<span class="t-q">&gt; 빠른 실행. 적은 메모리. 오프라인으로 온전히 내 것.</span>',
        "",
        '인라인 <span class="t-c">`코드`</span> 와 수식: <span class="t-c">$E = mc^2$</span>.',
      ],
      html:
        "<h1>md-reader</h1>" +
        '<p class="lead">가볍고 100% 오프라인인 마크다운 <strong>리더 &amp; 에디터</strong>.</p>' +
        "<h2>기능</h2>" +
        '<ul class="tasklist">' +
        '<li class="checked"><span class="box"></span>파일 / 폴더 열기</li>' +
        '<li class="checked"><span class="box"></span>실시간 분할 미리보기</li>' +
        '<li><span class="box"></span>HTML / PDF 내보내기</li></ul>' +
        "<blockquote>빠른 실행. 적은 메모리. 오프라인으로 온전히 내 것.</blockquote>" +
        '<p>인라인 <code>코드</code> 와 수식: <span class="math"><i>E</i> = <i>m</i><i>c</i><sup>2</sup></span>.</p>',
    },
    en: {
      words: 32,
      ln: 3,
      col: 55,
      active: 2,
      src: [
        '<span class="t-h">#</span> <span class="t-h">md-reader</span>',
        "",
        'A lightweight markdown <span class="t-b">**reader &amp; editor**</span> — 100% offline.',
        "",
        '<span class="t-h">##</span> <span class="t-h">Features</span>',
        "",
        '<span class="t-m">- [</span><span class="t-x">x</span><span class="t-m">]</span> Open file / folder',
        '<span class="t-m">- [</span><span class="t-x">x</span><span class="t-m">]</span> Live split preview',
        '<span class="t-m">- [ ]</span> Export to HTML / PDF',
        "",
        '<span class="t-q">&gt; Fast to start. Light on memory. Yours, offline.</span>',
        "",
        'Inline <span class="t-c">`code`</span> and math: <span class="t-c">$E = mc^2$</span>.',
      ],
      html:
        "<h1>md-reader</h1>" +
        '<p class="lead">A lightweight markdown <strong>reader &amp; editor</strong> — 100% offline.</p>' +
        "<h2>Features</h2>" +
        '<ul class="tasklist">' +
        '<li class="checked"><span class="box"></span>Open file / folder</li>' +
        '<li class="checked"><span class="box"></span>Live split preview</li>' +
        '<li><span class="box"></span>Export to HTML / PDF</li></ul>' +
        "<blockquote>Fast to start. Light on memory. Yours, offline.</blockquote>" +
        '<p>Inline <code>code</code> and math: <span class="math"><i>E</i> = <i>m</i><i>c</i><sup>2</sup></span>.</p>',
    },
  },

  guide: {
    dirty: true,
    ko: {
      words: 20,
      ln: 4,
      col: 30,
      active: 3,
      src: [
        '<span class="t-h">#</span> <span class="t-h">시작하기</span>',
        "",
        '<span class="t-m">1.</span> 상단바에서 폴더를 엽니다.',
        '<span class="t-m">2.</span> 사이드바 트리에서 파일을 고릅니다.',
        '<span class="t-m">3.</span> 왼쪽에 입력하면 오른쪽이 바로 조판됩니다.',
        "",
        '<span class="t-q">&gt; 팁: 이음새를 끌어 분할 비율을 조절하세요.</span>',
      ],
      html:
        "<h1>시작하기</h1>" +
        "<ol><li>상단바에서 폴더를 엽니다.</li><li>사이드바 트리에서 파일을 고릅니다.</li><li>왼쪽에 입력하면 오른쪽이 바로 조판됩니다.</li></ol>" +
        "<blockquote>팁: 이음새를 끌어 분할 비율을 조절하세요.</blockquote>",
    },
    en: {
      words: 22,
      ln: 4,
      col: 30,
      active: 3,
      src: [
        '<span class="t-h">#</span> <span class="t-h">Getting started</span>',
        "",
        '<span class="t-m">1.</span> Open a folder from the toolbar.',
        '<span class="t-m">2.</span> Pick a file in the sidebar tree.',
        '<span class="t-m">3.</span> Type on the left — it renders live.',
        "",
        '<span class="t-q">&gt; Tip: drag the seam to resize the split.</span>',
      ],
      html:
        "<h1>Getting started</h1>" +
        "<ol><li>Open a folder from the toolbar.</li><li>Pick a file in the sidebar tree.</li><li>Type on the left — it renders live.</li></ol>" +
        "<blockquote>Tip: drag the seam to resize the split.</blockquote>",
    },
  },
};
