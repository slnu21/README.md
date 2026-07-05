// 워크스페이스 트리 — SQLite 노드 그래프(가상 폴더·file_ref·imported) + 디스크 파생 렌더.
// 즐겨찾기 그룹 최상단 고정, 툴바(새 폴더·폴더 가져오기), 우클릭 메뉴, 포인터 드래그 배치·재정렬.
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { readFile, pickFile, pickFolder, wsExport, saveFile, writeFile } from "../lib/tauri";
import { useAppStore, FAVORITES_KEY, type TreeNode, type TreeKind } from "../store";
import { Icon } from "./Icon";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { PromptModal, type PromptSpec } from "./PromptModal";
import { ConfirmDialog, type ConfirmSpec } from "./ConfirmDialog";

const isFolderKind = (k: TreeKind) =>
  k === "virtual_folder" || k === "imported_folder" || k === "disk_folder";

function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

async function openPath(realPath: string) {
  try {
    useAppStore.getState().openFile(realPath, await readFile(realPath));
  } catch (e) {
    console.error("파일 열기 실패:", e);
  }
}

// ── 드래그 배치·재정렬 인덱스/타입 ──
type DropTarget =
  | { mode: "into"; folderId: string }
  | { mode: "root" }
  | { mode: "before" | "after"; key: string; parentId: string | null };

interface WsIndex {
  byId: Map<string, TreeNode>;
  parentOf: Map<string, string | null>;
}
function indexRoots(roots: TreeNode[]): WsIndex {
  const byId = new Map<string, TreeNode>();
  const parentOf = new Map<string, string | null>();
  const walk = (n: TreeNode, parentId: string | null) => {
    if (n.id) {
      byId.set(n.id, n);
      parentOf.set(n.id, parentId);
    }
    const childParent = n.id ?? parentId;
    n.children.forEach((c) => walk(c, childParent));
  };
  roots.forEach((r) => walk(r, null));
  return { byId, parentOf };
}
function isDescendant(parentOf: Map<string, string | null>, ancestorId: string, nodeId: string): boolean {
  let cur = parentOf.get(nodeId) ?? null;
  for (let i = 0; i < 1000 && cur; i++) {
    if (cur === ancestorId) return true;
    cur = parentOf.get(cur) ?? null;
  }
  return false;
}

/** 재귀 트리 목록. onContext = 우클릭 → 메뉴. drop/draggingId = 드래그 표시. */
function TreeList({
  nodes,
  depth,
  onContext,
  drop,
  draggingId,
}: {
  nodes: TreeNode[];
  depth: number;
  onContext: (n: TreeNode, x: number, y: number) => void;
  drop: DropTarget | null;
  draggingId: string | null;
}) {
  const expanded = useAppStore((s) => s.expanded);
  const toggleDir = useAppStore((s) => s.toggleDir);
  const activePath = useAppStore((s) => s.activePath);
  const favorites = useAppStore((s) => s.favorites);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);

  return (
    <ul className={depth === 0 ? "tree" : "children"}>
      {nodes.map((n) => {
        const folder = isFolderKind(n.kind);
        const open = !!expanded[n.key];
        const isFav = !folder && n.realPath ? favorites.includes(n.realPath) : false;
        const dropCls =
          drop?.mode === "into" && n.id && drop.folderId === n.id
            ? " drop-into"
            : (drop?.mode === "before" || drop?.mode === "after") && drop.key === n.key
              ? drop.mode === "before"
                ? " drop-before"
                : " drop-after"
              : "";
        return (
          <li key={n.key}>
            <div
              className={
                "node " +
                (folder ? "folder" : "file") +
                (folder && open ? " open" : "") +
                (!folder && activePath === n.realPath ? " active" : "") +
                (draggingId && n.id === draggingId ? " dragging" : "") +
                dropCls
              }
              tabIndex={0}
              data-key={n.key}
              data-id={n.id ?? undefined}
              data-kind={n.kind}
              data-parent={n.parentId ?? "__root__"}
              onClick={() => (folder ? toggleDir(n.key) : n.realPath && openPath(n.realPath))}
              onContextMenu={(e) => {
                e.preventDefault();
                onContext(n, e.clientX, e.clientY);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (folder) toggleDir(n.key);
                  else if (n.realPath) void openPath(n.realPath);
                }
              }}
            >
              {folder ? <Icon name="chev" className="chev" /> : <span className="chev-pad" aria-hidden="true" />}
              <Icon name={folder ? "folder" : "file"} />
              <span className="name">{n.name}</span>
              {!folder && n.realPath && (
                <button
                  type="button"
                  className={"fav-toggle" + (isFav ? " on" : "")}
                  aria-label="favorite"
                  title="favorite"
                  onClick={(e) => {
                    e.stopPropagation();
                    void toggleFavorite(n.realPath!);
                  }}
                >
                  <Icon name="star" />
                </button>
              )}
            </div>
            {folder && open && n.children.length > 0 && (
              <TreeList
                nodes={n.children}
                depth={depth + 1}
                onContext={onContext}
                drop={drop}
                draggingId={draggingId}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function WorkspaceTree() {
  const { t } = useTranslation();
  const roots = useAppStore((s) => s.roots);
  const favorites = useAppStore((s) => s.favorites);
  const expanded = useAppStore((s) => s.expanded);
  const activePath = useAppStore((s) => s.activePath);
  const toggleDir = useAppStore((s) => s.toggleDir);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const createFolder = useAppStore((s) => s.createFolder);
  const addFileRefTo = useAppStore((s) => s.addFileRefTo);
  const importFolderTo = useAppStore((s) => s.importFolderTo);
  const importFolder = useAppStore((s) => s.importFolder);
  const importWorkspaceJson = useAppStore((s) => s.importWorkspaceJson);
  const renameNode = useAppStore((s) => s.renameNode);
  const removeNode = useAppStore((s) => s.removeNode);
  const moveNode = useAppStore((s) => s.moveNode);
  const reorderChildren = useAppStore((s) => s.reorderChildren);

  const [menu, setMenu] = useState<{ node: TreeNode; x: number; y: number } | null>(null);
  const [wsMenu, setWsMenu] = useState<{ x: number; y: number } | null>(null);
  const [prompt, setPrompt] = useState<PromptSpec | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);

  // 워크스페이스 JSON 백업(내보내기) — 노드 그래프를 파일로 저장. 파괴적이지 않음.
  async function exportWorkspace() {
    try {
      const json = await wsExport();
      const path = await saveFile("workspace.json", [{ name: "JSON", extensions: ["json"] }]);
      if (path) await writeFile(path, json);
    } catch (e) {
      console.error("워크스페이스 내보내기 실패:", e);
    }
  }

  // 워크스페이스 JSON 복원(가져오기) — 파일 선택 → 확인 후 전체 교체(디스크 파일은 보존).
  async function importWorkspace() {
    const path = await pickFile([{ name: "JSON", extensions: ["json"] }]);
    if (!path) return;
    let json: string;
    try {
      json = await readFile(path);
    } catch (e) {
      console.error("워크스페이스 파일 읽기 실패:", e);
      return;
    }
    setConfirm({
      title: t("ws.importJsonTitle"),
      message: t("ws.importJsonMsg"),
      saveLabel: t("ws.importAction"),
      danger: true,
      onSave: () => {
        void importWorkspaceJson(json).catch((e) => console.error("워크스페이스 가져오기 실패:", e));
      },
    });
  }

  // ── 드래그 배치·재정렬 ──
  const index = useMemo(() => indexRoots(roots), [roots]);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; pointerId: number; startX: number; startY: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  function computeDrop(x: number, y: number, draggedId: string): DropTarget | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const rowEl = el?.closest<HTMLElement>(".node");
    if (!rowEl) {
      return el && containerRef.current?.contains(el) ? { mode: "root" } : null;
    }
    const rowId = rowEl.getAttribute("data-id") || "";
    if (!rowId) return null; // 즐겨찾기/디스크 행 → 대상 아님
    const rowKind = rowEl.getAttribute("data-kind") ?? "";
    const rowKey = rowEl.getAttribute("data-key") ?? "";
    const rect = rowEl.getBoundingClientRect();
    const rel = (y - rect.top) / rect.height;
    if (rowKind === "virtual_folder" && rel > 0.25 && rel < 0.75) {
      if (rowId !== draggedId && !isDescendant(index.parentOf, draggedId, rowId))
        return { mode: "into", folderId: rowId };
      return null;
    }
    const pAttr = rowEl.getAttribute("data-parent");
    const parentId = pAttr === "__root__" ? null : pAttr || null;
    if (parentId && (parentId === draggedId || isDescendant(index.parentOf, draggedId, parentId))) return null;
    return { mode: rel < 0.5 ? "before" : "after", key: rowKey, parentId };
  }

  function nextOrder(kids: TreeNode[]): number {
    return kids.filter((c) => c.id).reduce((m, c) => Math.max(m, c.sortOrder ?? 0), -1) + 1;
  }

  async function executeDrop(draggedId: string, t: DropTarget) {
    if (t.mode === "into") {
      const folder = index.byId.get(t.folderId);
      await moveNode(draggedId, t.folderId, nextOrder(folder?.children ?? []));
    } else if (t.mode === "root") {
      if ((index.parentOf.get(draggedId) ?? null) === null) return; // 이미 루트
      await moveNode(draggedId, null, nextOrder(roots));
    } else {
      const P = t.parentId;
      const siblingNodes = P === null ? roots : index.byId.get(P)?.children ?? [];
      const ordered = siblingNodes.filter((c) => c.id).map((c) => c.id!).filter((id) => id !== draggedId);
      const idx = ordered.indexOf(t.key);
      if (idx < 0) return;
      ordered.splice(t.mode === "before" ? idx : idx + 1, 0, draggedId);
      if ((index.parentOf.get(draggedId) ?? null) !== P) await moveNode(draggedId, P, 0);
      await reorderChildren(ordered);
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const el = e.target as HTMLElement;
    if (el.closest("button") || el.closest("input")) return;
    const id = el.closest<HTMLElement>(".node[data-id]")?.getAttribute("data-id");
    if (!id) return;
    // ⚠ 여기서 setPointerCapture 하면 안 된다 — 순수 클릭에도 캡처가 걸리면 뒤이은 click 이벤트가
    //    행(row)이 아니라 컨테이너로 가서 onClick(펼치기/열기)이 안 먹는다. 실제 드래그 시작 때만 캡처.
    dragRef.current = { id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved) {
      if (Math.abs(e.clientX - d.startX) < 5 && Math.abs(e.clientY - d.startY) < 5) return;
      d.moved = true;
      setDraggingId(d.id);
      containerRef.current?.setPointerCapture(d.pointerId); // 드래그 확정 시점에만 캡처
    }
    setDrop(computeDrop(e.clientX, e.clientY, d.id));
  }
  function onPointerUp() {
    const d = dragRef.current;
    dragRef.current = null;
    const t = drop;
    setDrop(null);
    setDraggingId(null);
    if (!d || !d.moved) return;
    justDragged.current = true; // 뒤이어 오는 click(열기/토글) 억제
    if (t) void executeDrop(d.id, t);
  }

  function newFolderPrompt(parentId: string | null) {
    setPrompt({
      title: t("ws.newFolderName"),
      initial: t("ws.newFolderDefault"),
      onOk: (name) => void createFolder(parentId, name),
    });
  }
  async function addFilePrompt(parentId: string | null) {
    const p = await pickFile();
    if (p) void addFileRefTo(parentId, p);
  }
  async function importFolderInto(parentId: string | null) {
    const p = await pickFolder();
    if (p) void importFolderTo(parentId, p);
  }

  function menuItems(n: TreeNode): MenuItem[] {
    const items: MenuItem[] = [];
    if (n.kind === "virtual_folder" && n.id) {
      const id = n.id;
      items.push({ label: t("ws.newSubfolder"), onClick: () => newFolderPrompt(id) });
      items.push({ label: t("ws.addFile"), onClick: () => void addFilePrompt(id) });
      items.push({ label: t("ws.importFolder"), onClick: () => void importFolderInto(id) });
      items.push({
        label: t("ws.rename"),
        onClick: () =>
          setPrompt({ title: t("ws.renameTitle"), initial: n.name, onOk: (name) => void renameNode(id, name) }),
      });
      items.push({ label: t("ws.removeFromWs"), danger: true, onClick: () => void removeNode(id) });
    } else if (n.kind === "imported_folder" && n.id) {
      const id = n.id;
      items.push({
        label: t("ws.rename"),
        onClick: () =>
          setPrompt({ title: t("ws.renameTitle"), initial: n.name, onOk: (name) => void renameNode(id, name) }),
      });
      items.push({ label: t("ws.removeFromWs"), danger: true, onClick: () => void removeNode(id) });
    } else if (n.kind === "file_ref" && n.id) {
      const id = n.id;
      const fav = n.realPath ? favorites.includes(n.realPath) : false;
      if (n.realPath)
        items.push({
          label: fav ? t("ws.unfavorite") : t("ws.favorite"),
          onClick: () => void toggleFavorite(n.realPath!),
        });
      items.push({ label: t("ws.removeFromWs"), danger: true, onClick: () => void removeNode(id) });
    } else if (n.kind === "disk_file" && n.realPath) {
      const rp = n.realPath;
      const fav = favorites.includes(rp);
      items.push({
        label: fav ? t("ws.unfavorite") : t("ws.favorite"),
        onClick: () => void toggleFavorite(rp),
      });
    }
    return items;
  }

  const favOpen = !!expanded[FAVORITES_KEY];

  return (
    <div
      className={"ws" + (drop?.mode === "root" ? " drop-root" : "")}
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClickCapture={(e) => {
        if (justDragged.current) {
          justDragged.current = false;
          e.stopPropagation();
        }
      }}
    >
      <div className="ws-toolbar">
        <button type="button" className="ws-tool" title={t("ws.newFolder")} onClick={() => newFolderPrompt(null)}>
          <Icon name="folder" />
          <span>{t("ws.newFolder")}</span>
        </button>
        <button
          type="button"
          className="ws-tool icon"
          title={t("ws.importFolder")}
          aria-label={t("ws.importFolder")}
          onClick={() =>
            void pickFolder().then((p) => {
              if (p) void importFolder(p);
            })
          }
        >
          <Icon name="plus" />
        </button>
        <button
          type="button"
          className="ws-tool icon"
          title={t("ws.jsonMenu")}
          aria-label={t("ws.jsonMenu")}
          aria-haspopup="menu"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setWsMenu({ x: r.left, y: r.bottom + 4 });
          }}
        >
          <Icon name="export" />
        </button>
      </div>

      {/* 즐겨찾기 — 최상단 고정 합성 그룹 */}
      <ul className="tree">
        <li>
          <div
            className={"node folder" + (favOpen ? " open" : "")}
            tabIndex={0}
            onClick={() => toggleDir(FAVORITES_KEY)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleDir(FAVORITES_KEY);
              }
            }}
          >
            <Icon name="chev" className="chev" />
            <Icon name="star" />
            <span className="name">{t("sidebar.favorites")}</span>
          </div>
          {favOpen && favorites.length > 0 && (
            <ul className="children">
              {favorites.map((p) => (
                <li key={p}>
                  <div
                    className={"node file" + (activePath === p ? " active" : "")}
                    tabIndex={0}
                    onClick={() => openPath(p)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        void openPath(p);
                      }
                    }}
                  >
                    <span className="chev-pad" aria-hidden="true" />
                    <Icon name="star" />
                    <span className="name">{baseName(p)}</span>
                    <button
                      type="button"
                      className="fav-toggle on"
                      aria-label="favorite"
                      onClick={(e) => {
                        e.stopPropagation();
                        void toggleFavorite(p);
                      }}
                    >
                      <Icon name="star" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </li>
      </ul>

      {roots.length > 0 ? (
        <TreeList
          nodes={roots}
          depth={0}
          onContext={(n, x, y) => setMenu({ node: n, x, y })}
          drop={drop}
          draggingId={draggingId}
        />
      ) : (
        <p className="tree-hint">{t("ws.empty")}</p>
      )}

      {menu && menuItems(menu.node).length > 0 && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.node)} onClose={() => setMenu(null)} />
      )}
      {wsMenu && (
        <ContextMenu
          x={wsMenu.x}
          y={wsMenu.y}
          onClose={() => setWsMenu(null)}
          items={[
            { label: t("ws.exportJson"), onClick: () => void exportWorkspace() },
            { label: t("ws.importJson"), onClick: () => void importWorkspace() },
          ]}
        />
      )}
      {prompt && <PromptModal spec={prompt} onClose={() => setPrompt(null)} />}
      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
