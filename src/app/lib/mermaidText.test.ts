// mermaid 라벨 안 인라인 HTML 정규화 테스트.
//
// 지키는 것 둘:
//  ① 사용자가 쓴 `<br>`은 어떤 형태로 써도 줄바꿈이 된다(v0.7.1까지 `<BR>`·`<br class>`가 샜다).
//  ② 살릴 수 없는 서식 태그는 **글자만 남기고** 사라진다 — 태그가 도형 안에 글자로 찍히지 않는다.
// 그리고 무엇보다 **mermaid 문법을 건드리지 않는다**(화살표·스테레오타입).
import { describe, expect, it } from "vitest";
import { detectDiagramKind, normalizeDiagramHtml } from "./mermaidText";

describe("detectDiagramKind", () => {
  it("첫 낱말을 종류로 읽는다", () => {
    expect(detectDiagramKind("flowchart TD\n  A --> B")).toBe("flowchart");
    expect(detectDiagramKind("sequenceDiagram\n  A->>B: hi")).toBe("sequencediagram");
    expect(detectDiagramKind("pie title 파이")).toBe("pie");
  });

  it("graph·flowchart-elk는 flowchart로 모은다", () => {
    expect(detectDiagramKind("graph LR\n  A --> B")).toBe("flowchart");
    expect(detectDiagramKind("flowchart-elk TD\n  A --> B")).toBe("flowchart");
  });

  it("-beta 접미사를 떼고, v2 별칭도 모은다", () => {
    expect(detectDiagramKind("xychart-beta\n  bar [1]")).toBe("xychart");
    expect(detectDiagramKind("block-beta\n  A")).toBe("block");
    expect(detectDiagramKind("stateDiagram-v2\n  [*] --> S")).toBe("statediagram");
  });

  it("gitGraph 뒤의 콜론에서 끊는다", () => {
    expect(detectDiagramKind("gitGraph:\n  commit")).toBe("gitgraph");
  });

  it("frontmatter를 건너뛴다 — title이 종류로 잡히면 안 된다", () => {
    const src = "---\ntitle: 내 제목\nconfig:\n  theme: base\n---\npie title 파이\n  \"가\" : 1";
    expect(detectDiagramKind(src)).toBe("pie");
  });

  it("주석·init 지시자·빈 줄을 건너뛴다", () => {
    const src = "\n\n%% 설명 주석\n%%{init: {'theme':'base'}}%%\njourney\n  title 여정";
    expect(detectDiagramKind(src)).toBe("journey");
  });

  it("읽을 게 없으면 빈 문자열", () => {
    expect(detectDiagramKind("")).toBe("");
    expect(detectDiagramKind("   \n\n")).toBe("");
    expect(detectDiagramKind("%% 주석뿐")).toBe("");
  });
});

describe("normalizeDiagramHtml — <br> 정규화", () => {
  const fc = (label: string) => `flowchart TD\n  A["${label}"] --> B`;

  it("모든 변형을 bare <br>로 통일한다", () => {
    // mermaid의 자체 정규화는 `/<br\s*\/?>/`(대소문자 구분·속성 없음) 하나뿐이라
    // 대문자·속성이 붙으면 그물을 빠져나가 글자로 남았다. timeline은 bare만 자른다.
    expect(normalizeDiagramHtml(fc("가<br/>나"))).toBe(fc("가<br>나"));
    expect(normalizeDiagramHtml(fc("가<br />나"))).toBe(fc("가<br>나"));
    expect(normalizeDiagramHtml(fc("가<BR>나"))).toBe(fc("가<br>나"));
    expect(normalizeDiagramHtml(fc("가<Br/>나"))).toBe(fc("가<br>나"));
    expect(normalizeDiagramHtml(fc('가<br class="x">나'))).toBe(fc("가<br>나"));
  });

  it("이미 bare면 그대로 두고, 여러 개도 모두 고친다", () => {
    expect(normalizeDiagramHtml(fc("가<br>나"))).toBe(fc("가<br>나"));
    expect(normalizeDiagramHtml(fc("가<BR>나<br/>다"))).toBe(fc("가<br>나<br>다"));
  });

  it("br로 시작하는 다른 낱말은 건드리지 않는다", () => {
    expect(normalizeDiagramHtml(fc("<brother>"))).toBe(fc("<brother>"));
  });

  it("줄바꿈을 못 하는 다이어그램에서는 공백으로 바꾼다", () => {
    // 놔두면 mermaid가 `<br>`을 글자로 그린다 — 사용자가 겪는 증상 그대로다.
    expect(normalizeDiagramHtml('pie title 파이\n  "가<br>나" : 40')).toBe(
      'pie title 파이\n  "가 나" : 40',
    );
    expect(normalizeDiagramHtml("journey\n  t<br>x: 5: 나")).toBe("journey\n  t x: 5: 나");
    expect(normalizeDiagramHtml('gitGraph\n  commit id: "가<br/>나"')).toBe(
      'gitGraph\n  commit id: "가 나"',
    );
    expect(normalizeDiagramHtml('xychart-beta\n  title "가<br>나"')).toBe(
      'xychart-beta\n  title "가 나"',
    );
  });

  it("모르는 종류는 현행 유지 — 될 줄바꿈까지 잃지 않는다", () => {
    expect(normalizeDiagramHtml("newDiagram-beta\n  X[가<br/>나]")).toBe(
      "newDiagram-beta\n  X[가<br>나]",
    );
  });
});

describe("normalizeDiagramHtml — 서식 태그", () => {
  const fc = (label: string) => `flowchart TD\n  A["${label}"] --> B`;

  it("태그만 지우고 글자는 남긴다", () => {
    expect(normalizeDiagramHtml(fc("가<b>굵게</b>나"))).toBe(fc("가굵게나"));
    expect(normalizeDiagramHtml(fc("가<strong>굵게</strong>나"))).toBe(fc("가굵게나"));
    expect(normalizeDiagramHtml(fc("가<i>기울임</i>나"))).toBe(fc("가기울임나"));
    expect(normalizeDiagramHtml(fc("가<em>기울임</em>나"))).toBe(fc("가기울임나"));
    expect(normalizeDiagramHtml(fc("가<u>밑줄</u>나"))).toBe(fc("가밑줄나"));
    expect(normalizeDiagramHtml(fc("가<code>코드</code>나"))).toBe(fc("가코드나"));
    expect(normalizeDiagramHtml(fc('가<span style="color:red">빨강</span>나'))).toBe(fc("가빨강나"));
  });

  it("<a>는 남긴다 — 주소를 흔적 없이 지우지 않는다", () => {
    const src = fc('<a href="https://a.b">링크</a>');
    expect(normalizeDiagramHtml(src)).toBe(src);
  });
});

describe("normalizeDiagramHtml — mermaid 문법은 건드리지 않는다", () => {
  it("화살표를 그대로 둔다", () => {
    for (const src of [
      "flowchart LR\n  A --> B\n  B -.-> C\n  C ==> D",
      "classDiagram\n  A <|-- B\n  C <-- D\n  E <|.. F",
      "sequenceDiagram\n  A->>B: hi\n  B-->>A: bye\n  A-)B: async",
      "erDiagram\n  A ||--o{ B : has",
    ]) {
      expect(normalizeDiagramHtml(src)).toBe(src);
    }
  });

  it("클래스 스테레오타입 <<interface>>를 지우지 않는다", () => {
    // 목록에 `i`·`ins`·`s`가 있어 낱말 경계를 잘못 잡으면 여기서 바로 깨진다.
    const src = "classDiagram\n  class A {\n    <<interface>>\n    +run()\n  }";
    expect(normalizeDiagramHtml(src)).toBe(src);
    const src2 = "classDiagram\n  class B {\n    <<service>>\n  }";
    expect(normalizeDiagramHtml(src2)).toBe(src2);
  });

  it("제네릭·주석을 그대로 둔다", () => {
    const src = "classDiagram\n  %% 목록<T>\n  class A~T~ {\n    +items List~int~\n  }";
    expect(normalizeDiagramHtml(src)).toBe(src);
  });
});

describe("normalizeDiagramHtml — &nbsp;", () => {
  it("NBSP 문자로 바꾼다 — sequence·journey는 &nbsp;를 만나면 파싱이 통째로 실패한다", () => {
    const out = normalizeDiagramHtml("sequenceDiagram\n  A->>B: 가&nbsp;나");
    expect(out).toBe(`sequenceDiagram\n  A->>B: 가${String.fromCharCode(0xa0)}나`);
    expect(out).not.toContain("&nbsp;");
  });

  it("다른 엔티티는 건드리지 않는다 — &lt;를 풀면 파서에 <가 들어간다", () => {
    const src = "flowchart TD\n  A[\"가&lt;나&gt;다 &amp; 라\"] --> B";
    expect(normalizeDiagramHtml(src)).toBe(src);
  });
});

describe("normalizeDiagramHtml — 성질", () => {
  it("두 번 돌려도 같다(멱등)", () => {
    const src = 'flowchart TD\n  A["가<BR>나<b>굵게</b>&nbsp;다"] --> B';
    const once = normalizeDiagramHtml(src);
    expect(normalizeDiagramHtml(once)).toBe(once);
  });

  it("건드릴 게 없으면 원본을 그대로 돌려준다", () => {
    const src = "flowchart TD\n  A[보통 라벨] --> B[또 하나]";
    expect(normalizeDiagramHtml(src)).toBe(src);
    expect(normalizeDiagramHtml("")).toBe("");
  });
});
