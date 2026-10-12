import { describe, expect, it } from "vitest";
import { CanvasParseError, colorCss, drawable, paintOrder, parseCanvas, removeNode, serializeCanvas, validNode, type CanvasNode } from "./format";
import { anchor, autoSides, curve, edgeSides, fitView, groupMembers, nearestSide, relink, snapTarget, toWorld, zoomAt } from "./geometry";
import { fileCandidates, isAbsolute, pathForNode } from "./paths";

// 옵시디언이 실제로 쓰는 모양(탭 들여쓰기 · 노드 안 미지 필드 styleAttributes · 최상위 미지 필드).
const OBSIDIAN = `{
\t"nodes":[
\t\t{"id":"a1b2c3d4e5f60718","type":"file","file":"notes/plan.md","subpath":"#Goals","x":-300,"y":-80,"width":400,"height":400,"styleAttributes":{"border":"dashed"}},
\t\t{"id":"0f1e2d3c4b5a6978","type":"text","text":"# Hello\\n**bold**","x":200,"y":-80,"width":250,"height":60,"color":"4"},
\t\t{"id":"9a8b7c6d5e4f3021","type":"group","label":"Area","x":-340,"y":-140,"width":840,"height":500,"background":"img.png"},
\t\t{"id":"1111222233334444","type":"link","url":"https://jsoncanvas.org","x":200,"y":60,"width":250,"height":120},
\t\t{"id":"broken","type":"text","x":0,"y":0}
\t],
\t"edges":[
\t\t{"id":"e1","fromNode":"a1b2c3d4e5f60718","fromSide":"right","toNode":"0f1e2d3c4b5a6978","toSide":"left","toEnd":"arrow","label":"refs","x-future":1},
\t\t{"id":"e2","fromNode":"0f1e2d3c4b5a6978","toNode":"gone-node"}
\t],
\t"metadata":{"version":"1.0-1.0","frontmatter":{}}
}`;

describe("JSON Canvas 형식", () => {
  it("왕복 — 모르는 필드(노드 안 · 선 안 · 최상위)와 틀린 노드·선을 그대로 보존", () => {
    const doc = parseCanvas(OBSIDIAN);
    const again = JSON.parse(serializeCanvas(doc));
    expect(again).toEqual(JSON.parse(OBSIDIAN));
    expect(serializeCanvas(doc)).toContain('\t"nodes"');
  });

  it("그릴 것만 고른다 — 틀린 노드·매달린 선은 그리지 않을 뿐", () => {
    const { nodes, edges } = drawable(parseCanvas(OBSIDIAN));
    expect(nodes.map((n) => n.id)).not.toContain("broken");
    expect(edges.map((e) => e.id)).toEqual(["e1"]);
  });

  it("고쳐도 모르는 필드는 남는다", () => {
    const doc = parseCanvas(OBSIDIAN);
    const n = doc.nodes[0] as CanvasNode;
    n.x += 100;
    const out = JSON.parse(serializeCanvas(doc));
    expect(out.nodes[0].styleAttributes).toEqual({ border: "dashed" });
    expect(out.nodes[0].x).toBe(-200);
    expect(out.metadata.version).toBe("1.0-1.0");
  });

  it("빈 글은 빈 캔버스, JSON 이 아니면 던진다(빈 캔버스로 덮어쓰지 않게)", () => {
    expect(parseCanvas("  ")).toEqual({ nodes: [], edges: [] });
    expect(parseCanvas("\uFEFF{}")).toEqual({ nodes: [], edges: [] });
    expect(() => parseCanvas("{nope")).toThrow(CanvasParseError);
    expect(() => parseCanvas("[1]")).toThrow(CanvasParseError);
  });

  it("노드를 지우면 붙은 선도", () => {
    const doc = parseCanvas(OBSIDIAN);
    removeNode(doc, "0f1e2d3c4b5a6978");
    expect(doc.edges).toEqual([]);
  });

  it("색은 프리셋 1~6(테마 변수) 또는 hex 만 — 나머지는 CSS 에 안 넣는다", () => {
    expect(colorCss("4")).toBe("var(--canvas-c4)");
    expect(colorCss("#ff00aa")).toBe("#ff00aa");
    expect(colorCss("red; background:url(x)")).toBeNull();
    expect(colorCss("7")).toBeNull();
  });

  it("그룹은 늘 아래(파일 순서는 그대로)", () => {
    const doc = parseCanvas(OBSIDIAN);
    const order = paintOrder(drawable(doc).nodes).map((n) => n.type);
    expect(order[0]).toBe("group");
    expect(doc.nodes[2].type).toBe("group");
  });

  it("validNode — 종류별 필수 필드", () => {
    expect(validNode({ id: "a", type: "file", x: 0, y: 0, width: 1, height: 1 })).toBe(false);
    expect(validNode({ id: "a", type: "group", x: 0, y: 0, width: 1, height: 1 })).toBe(true);
  });
});

const box = (id: string, x: number, y: number, w = 100, h = 60, type = "text"): CanvasNode => ({ id, type, x, y, width: w, height: h, text: "" });

describe("기하", () => {
  it("자동 변 — 더 먼 축", () => {
    expect(autoSides(box("a", 0, 0), box("b", 300, 20))).toEqual(["right", "left"]);
    expect(autoSides(box("a", 0, 0), box("b", 20, -300))).toEqual(["top", "bottom"]);
  });

  it("연결점 · 가장 가까운 변", () => {
    const n = box("a", 0, 0);
    expect(anchor(n, "bottom")).toEqual([50, 60]);
    expect(nearestSide(n, 98, 30)).toBe("right");
    expect(nearestSide(n, 50, -5)).toBe("top");
  });

  it("달라붙기 — 카드 밖 pad 까지, 그룹보다 카드", () => {
    const g = box("g", -50, -50, 400, 300, "group");
    const a = box("a", 0, 0);
    const b = box("b", 200, 0);
    const t = snapTarget([g, a, b], 310, 30, a, 28);
    expect(t?.node.id).toBe("b");
    expect(t?.side).toBe("right");
    expect(snapTarget([g, a, b], 150, 200, a, 28)?.node.id).toBe("g");
    expect(snapTarget([a], 500, 500, null, 28)).toBeNull();
  });

  it("끝을 옮기면 반대쪽 변을 고정 저장 — 출발지가 제멋대로 바뀌지 않는다", () => {
    const a = box("a", 0, 0);
    const b = box("b", 300, 0);
    const c = box("c", 0, 400);
    const e = { id: "e", fromNode: "a", toNode: "b" };
    const [fs] = edgeSides(e, a, b);
    expect(fs).toBe("right");
    relink(e, "to", c, "top", fs);
    // 자동이었다면 a→c 는 bottom 에서 나갔을 것 — 고정했으니 right 그대로
    expect(edgeSides(e, a, c)).toEqual(["right", "top"]);
  });

  it("그룹 구성원 = 완전히 안에 든 것", () => {
    const g = box("g", 0, 0, 500, 500, "group");
    expect(groupMembers([g, box("in", 10, 10), box("half", 480, 10)], g).map((n) => n.id)).toEqual(["in"]);
  });

  it("확대는 커서 자리를 고정", () => {
    const v = { x: 0, y: 0, k: 1 };
    const z = zoomAt(v, 2, 100, 50);
    expect(toWorld(z, 100, 50)).toEqual(toWorld(v, 100, 50));
    expect(zoomAt(v, 100, 0, 0).k).toBe(2.5);
  });

  it("전부 보이게", () => {
    const v = fitView([box("a", 0, 0, 1000, 500)], 1200, 800);
    const [x0] = toWorld(v, 0, 0);
    const [x1] = toWorld(v, 1200, 0);
    expect(x0).toBeLessThan(0);
    expect(x1).toBeGreaterThan(1000);
  });

  it("곡선 — 라벨 중점과 화살표", () => {
    const c = curve([0, 0], "right", [200, 0], "left");
    expect(c.d.startsWith("M0.0,0.0 C")).toBe(true);
    expect(c.mid[0]).toBeCloseTo(100);
    expect(c.arrow.startsWith("M200.0,0.0")).toBe(true);
  });
});

describe("file 노드 경로", () => {
  it("상대 경로 후보 — 볼트 루트 → 캔버스 폴더 → 조상", () => {
    expect(fileCandidates("notes/plan.md", "C:\\v\\maps\\m.canvas", "C:\\v")).toEqual([
      "C:\\v\\notes\\plan.md",
      "C:\\v\\maps\\notes\\plan.md",
      "C:\\notes\\plan.md",
    ]);
    expect(fileCandidates("C:\\x\\a.md", "C:\\v\\m.canvas", null)).toEqual(["C:\\x\\a.md"]);
    expect(isAbsolute("\\\\srv\\share\\a.md")).toBe(true);
  });

  it("새 노드 경로 — 볼트 안이면 볼트 기준, 밖이면 캔버스 폴더 기준 · 드라이브가 다르면 절대", () => {
    expect(pathForNode("C:\\v\\notes\\plan.md", "C:\\v\\maps\\m.canvas", "C:\\v")).toBe("notes/plan.md");
    expect(pathForNode("C:\\w\\docs\\a.md", "C:\\w\\maps\\m.canvas", null)).toBe("../docs/a.md");
    expect(pathForNode("D:\\x\\a.md", "C:\\w\\m.canvas", null)).toBe("D:\\x\\a.md");
    // 왕복: 적은 경로로 다시 찾으면 그 파일
    const rel = pathForNode("C:\\w\\docs\\a.md", "C:\\w\\maps\\m.canvas", null);
    expect(fileCandidates(rel, "C:\\w\\maps\\m.canvas", null)[0]).toBe("C:\\w\\docs\\a.md");
  });
});
