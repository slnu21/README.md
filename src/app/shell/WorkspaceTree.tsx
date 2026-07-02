// 워크스페이스 트리(WBS 510) — 가져온 폴더의 재귀 렌더.
// 파일 클릭 → Rust readFile → 탭으로 열기. 폴더 클릭 → 펼침 토글.
import { readFile } from "../lib/tauri";
import { useAppStore, type WsNode } from "../store";
import { Icon } from "./Icon";

export function WorkspaceTree({ nodes, depth = 0 }: { nodes: WsNode[]; depth?: number }) {
  const expanded = useAppStore((s) => s.expanded);
  const toggleDir = useAppStore((s) => s.toggleDir);
  const openFile = useAppStore((s) => s.openFile);
  const activePath = useAppStore((s) => s.activePath);
  const favorites = useAppStore((s) => s.favorites);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);

  async function onOpen(path: string) {
    try {
      const content = await readFile(path);
      openFile(path, content);
    } catch (e) {
      console.error("파일 열기 실패:", e);
    }
  }

  return (
    <ul className={depth === 0 ? "tree" : "children"}>
      {nodes.map((n) =>
        n.isDir ? (
          <li key={n.path}>
            <div
              className={"node folder" + (expanded[n.path] ? " open" : "")}
              tabIndex={0}
              onClick={() => toggleDir(n.path)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleDir(n.path);
                }
              }}
            >
              <Icon name="chev" className="chev" />
              <Icon name="folder" />
              <span className="name">{n.name}</span>
            </div>
            {expanded[n.path] && n.children.length > 0 && (
              <WorkspaceTree nodes={n.children} depth={depth + 1} />
            )}
          </li>
        ) : (
          <li key={n.path}>
            <div
              className={"node file" + (activePath === n.path ? " active" : "")}
              tabIndex={0}
              onClick={() => onOpen(n.path)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpen(n.path);
                }
              }}
            >
              <Icon name="file" />
              <span className="name">{n.name}</span>
              <button
                type="button"
                className={"fav-toggle" + (favorites.includes(n.path) ? " on" : "")}
                aria-label="favorite"
                title="favorite"
                onClick={(e) => {
                  e.stopPropagation();
                  void toggleFavorite(n.path);
                }}
              >
                <Icon name="star" />
              </button>
            </div>
          </li>
        ),
      )}
    </ul>
  );
}
