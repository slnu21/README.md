# 데이터 모델 (SQLite)

앱 데이터 디렉터리의 SQLite DB에 워크스페이스 구조·즐겨찾기·최근·설정과 전문검색 인덱스를 저장한다. 100% 오프라인.

> 아래 DDL은 **초안**이며 구현(v0.2) 시 확정한다.

## 테이블 (초안)

```sql
-- 워크스페이스 (다중 지원 여지)
CREATE TABLE workspace (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

-- 트리 노드: 가상 폴더 / 파일 참조 / 가져온 폴더
CREATE TABLE node (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  parent_id     TEXT REFERENCES node(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('virtual_folder','file_ref','imported_folder')),
  name          TEXT NOT NULL,
  real_path     TEXT,                 -- file_ref / imported_folder 의 실제 경로
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_favorite   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_node_parent ON node(workspace_id, parent_id, sort_order);

-- 최근 연 파일
CREATE TABLE recent (
  real_path   TEXT PRIMARY KEY,
  opened_at   INTEGER NOT NULL
);

-- 설정 (key-value)
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 전문검색 (FTS5): 가져온 파일 내용 인덱스
CREATE VIRTUAL TABLE file_index USING fts5(
  real_path UNINDEXED,
  content,
  tokenize = 'unicode61'
);
```

## 갱신 규칙
- **가져오기**: 폴더/파일 가져올 때 `node` 추가, 내용 읽어 `file_index` 갱신.
- **파일 감시(notify)**: 외부 변경 시 `file_index` 재인덱싱, 프런트에 이벤트 emit.
- **즐겨찾기/최근**: `node.is_favorite`, `recent` 갱신.

## 이식성
- 워크스페이스 정의(노드 트리)는 **JSON export/import** 지원 → 백업·다른 PC 이동. (FTS 인덱스는 재생성)
