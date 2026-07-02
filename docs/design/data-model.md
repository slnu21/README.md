# 데이터 모델 (SQLite)

앱 데이터 디렉터리(`%APPDATA%\com.readme.app\md-reader.db`)의 SQLite DB에 워크스페이스 구조·즐겨찾기·최근·설정과 전문검색 인덱스를 저장한다. 100% 오프라인.

> **v0.2에서 확정·구현됨** — 실제 스키마·마이그레이션은 `src/src-tauri/src/db.rs`(schema v1, `PRAGMA user_version`). 아래는 그 확정 스키마와 설계 결정이다.

## 확정 결정 (초안 대비 변경)
- **D1 — imported_folder 자식은 저장하지 않는다.** `node` 에는 가상 폴더·파일 참조·**가져온 폴더의 루트 노드만** 저장하고, 그 아래 파일/폴더 계층은 렌더 시 `read_dir_tree` 로 **디스크에서 파생**한다. DB 비대화·드리프트 방지 + notify 외부 변경 자동 반영. (트리 = SQLite 노드 + imported 루트별 디스크 스캔 병합)
- **D2 — 즐겨찾기는 독립 테이블(`favorite`).** 초안의 `node.is_favorite` 컬럼을 대체 — imported 자식은 노드가 아니어도(D1) `real_path` 기준으로 즐겨찾기 가능.
- **소스오브트루스**: SQLite 가 영속 데이터의 단일 진실원, 프런트 Zustand 는 부팅 시 하이드레이트한 뷰(모든 변경 = Rust 커맨드 성공 → store 갱신).

## 테이블 (schema v1)

```sql
CREATE TABLE workspace (          -- 다중 워크스페이스 여지(현재 'default' 단일)
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE node (               -- 트리 노드: 가상 폴더 / 파일 참조 / 가져온 폴더(루트만)
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  parent_id     TEXT REFERENCES node(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('virtual_folder','file_ref','imported_folder')),
  name          TEXT NOT NULL,
  real_path     TEXT,             -- file_ref / imported_folder 루트의 실제 경로
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_node_parent ON node(workspace_id, parent_id, sort_order);

CREATE TABLE favorite (           -- D2: real_path 키 독립 테이블
  real_path  TEXT PRIMARY KEY,
  added_at   INTEGER NOT NULL
);

CREATE TABLE recent (             -- 최근 연 파일(상한 50)
  real_path  TEXT PRIMARY KEY,
  opened_at  INTEGER NOT NULL
);
CREATE INDEX idx_recent_opened ON recent(opened_at DESC);

CREATE TABLE settings (           -- key-value 설정
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE VIRTUAL TABLE file_index USING fts5(   -- 전문검색: 파일 내용 인덱스
  real_path UNINDEXED,
  content,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE file_meta (          -- 증분 재인덱싱 판단(FTS는 mtime/size 못 담음)
  real_path   TEXT PRIMARY KEY,
  mtime       INTEGER NOT NULL,
  size        INTEGER NOT NULL,
  indexed_at  INTEGER NOT NULL
);
```

연결마다 `PRAGMA journal_mode=WAL`(백그라운드 인덱서 동시성)·`foreign_keys=ON`·`busy_timeout=5000`.

## 갱신 규칙
- **가져오기**: `ws_import_folder` 로 imported_folder 루트 노드 추가 → 프런트가 `search_index_folder` 로 백그라운드 인덱싱(별도 연결).
- **파일 감시(notify)**: imported 루트를 재귀 감시. 외부 변경 시 `file_index`/`file_meta` 증분 갱신(md/markdown/mdx/txt, ≤2MB), `index-updated` + `file-changed` emit. `file_meta.mtime/size` 동일하면 skip.
- **즐겨찾기/최근**: `favorite`(토글)·`recent`(upsert + 상한 50) 갱신.
- **삭제**: 노드 삭제는 FTS 무관(D1). 디스크 삭제(notify Remove) 또는 언임포트 시 `search_remove_path`(prefix) 로 인덱스 정리.

## 이식성
- 워크스페이스 정의(노드 트리)는 **JSON export/import**(`ws_export`/`ws_import`) → 백업·다른 PC 이동. **FTS 인덱스는 이식하지 않고 재생성**(가져오기 후 각 imported 루트 재인덱싱).
