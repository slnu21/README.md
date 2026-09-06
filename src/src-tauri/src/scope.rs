//! 워크스페이스 스코프 — **사용자가 워크스페이스에 넣어 둔 것**의 집합.
//!
//! 두 곳이 쓴다: 에이전트 브리지(`mcp::tools`)가 경로 인자를 거를 때, 받은 문서함
//! (`commands::inbox`)이 색인에 남은 남의 폴더를 뺄 때. 판정 규칙이 두 벌이 되면 한쪽만
//! 새므로 한 곳에 둔다.

use crate::commands::search::{rel_under, under_root};
use crate::commands::workspace::load_nodes;
use rusqlite::Connection;

/// 에이전트가 볼 수 있는 범위 = 사용자가 워크스페이스에 넣어 둔 것.
///
/// 전역 검색은 머신 전체 색인을 조회하므로(`search.rs`) 스코프를 안 걸면 사용자의 **무관한
/// 문서까지** 에이전트에게 샌다. 그래서 모든 경로 인자는 여기를 통과해야 한다.
#[derive(Debug, Default)]
pub struct Scope {
    /// 가져온 폴더의 실제 경로 — 그 하위 전부가 허용된다.
    pub roots: Vec<String>,
    /// 개별 파일 참조 — 그 파일만 허용된다.
    pub files: Vec<String>,
}

impl Scope {
    pub fn load(conn: &Connection) -> Result<Scope, String> {
        let mut scope = Scope::default();
        for n in load_nodes(conn)? {
            match (n.kind.as_str(), n.real_path) {
                ("imported_folder", Some(p)) => scope.roots.push(p),
                ("file_ref", Some(p)) => scope.files.push(p),
                _ => {}
            }
        }
        Ok(scope)
    }

    /// 순수 판정 — 경로 비교는 `search.rs` 의 것을 그대로 쓴다(구분자·대소문자 무시,
    /// 형제 접두어 `C:\a` vs `C:\ab` 를 안 잡는다).
    pub fn allows(&self, path: &str) -> bool {
        self.roots.iter().any(|r| under_root(path, r))
            || self.files.iter().any(|f| rel_under(path, f) == Some(""))
    }

    pub fn is_empty(&self) -> bool {
        self.roots.is_empty() && self.files.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scope() -> Scope {
        Scope {
            roots: vec![r"C:\work\docs".into()],
            files: vec![r"C:\notes\one.md".into()],
        }
    }

    #[test]
    fn allows_paths_under_an_imported_root() {
        assert!(scope().allows(r"C:\work\docs\a\b.md"));
        assert!(scope().allows(r"C:\work\docs"));
    }

    #[test]
    fn rejects_sibling_prefix() {
        // `C:\work\docs` 가 `C:\work\docsets` 를 잡으면 스코프가 새는 것이다.
        assert!(!scope().allows(r"C:\work\docsets\x.md"));
    }

    #[test]
    fn separator_and_case_do_not_matter() {
        assert!(scope().allows(r"c:/WORK/Docs/a.md"));
    }

    #[test]
    fn file_ref_allows_only_that_file() {
        assert!(scope().allows(r"C:\notes\one.md"));
        assert!(!scope().allows(r"C:\notes\two.md"));
    }

    #[test]
    fn empty_scope_allows_nothing() {
        assert!(!Scope::default().allows(r"C:\anything.md"));
        assert!(Scope::default().is_empty());
    }
}
