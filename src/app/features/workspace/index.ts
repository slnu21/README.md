// Workspace: 가상 폴더 계층 + 즐겨찾기 + 최근.
// 디스크 폴더 가져오기(미러) / 사용자 가상 폴더(임의 파일 참조) 동시 지원.
// 영속화는 Rust(SQLite) 커맨드 경유. 스키마: docs/design/data-model.md

export type NodeKind = "virtual_folder" | "file_ref" | "imported_folder";

export interface WorkspaceNode {
  id: string;
  parentId: string | null;
  kind: NodeKind;
  name: string;
  realPath?: string;
  order: number;
  isFavorite: boolean;
}

// TODO(v0.2): SQLite 연동 트리 로드/갱신/가져오기
