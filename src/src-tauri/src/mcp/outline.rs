//! 마크다운 소스에서 헤딩을 뽑고 섹션을 잘라 낸다. 순수 함수 — 테스트로 고정한다.
//!
//! 미리보기의 아웃라인(`app/lib/markdown.ts` `extractToc`)은 markdown-it 토큰에서 뽑고 anchor
//! 플러그인이 부여한 **실제 id** 를 쓴다. 여기서는 그 파서를 쓸 수 없으므로 **소스 수준 근사**다:
//! ATX(`#`)만 보고, 펜스 코드블록과 YAML frontmatter 안은 건너뛴다.
//!
//! **id 를 흉내 내지 않는다.** 비슷하게 만든 슬러그는 언젠가 진짜 앵커와 어긋나 *조용히 틀린*
//! 링크가 된다. 대신 **줄 번호**(1-based)를 준다 — `read_section` 도 그걸로 자른다.

#[derive(Debug, PartialEq)]
pub struct Heading {
    pub level: u8,
    pub text: String,
    /// 1-based. 편집기·`data-line` 과 같은 기준.
    pub line: usize,
}

/// 펜스 여닫이 판정. 여는 펜스면 (문자, 길이)를 돌려준다.
fn fence_marker(line: &str) -> Option<(char, usize)> {
    let s = line.trim_start_matches(' ');
    // 들여쓰기 4칸 이상은 코드블록 본문이지 펜스가 아니다.
    if line.len() - s.len() > 3 {
        return None;
    }
    let c = s.chars().next()?;
    if c != '`' && c != '~' {
        return None;
    }
    let n = s.chars().take_while(|&x| x == c).count();
    if n >= 3 {
        Some((c, n))
    } else {
        None
    }
}

/// ATX 헤딩이면 (레벨, 텍스트). `#` 뒤에 공백이 없으면 헤딩이 아니다(`#hashtag`).
fn atx(line: &str) -> Option<(u8, String)> {
    let s = line.trim_start_matches(' ');
    if line.len() - s.len() > 3 {
        return None;
    }
    let hashes = s.chars().take_while(|&c| c == '#').count();
    if hashes == 0 || hashes > 6 {
        return None;
    }
    let rest = &s[hashes..];
    if !rest.is_empty() && !rest.starts_with(' ') && !rest.starts_with('\t') {
        return None;
    }
    // 닫는 `#` 는 표시하지 않는다("## 제목 ##").
    let text = rest.trim().trim_end_matches('#').trim().to_string();
    Some((hashes as u8, text))
}

/// frontmatter 를 건너뛴 뒤의 시작 줄 인덱스(0-based).
fn skip_frontmatter(lines: &[&str]) -> usize {
    if lines.first().map(|l| l.trim_end()) != Some("---") {
        return 0;
    }
    for (i, l) in lines.iter().enumerate().skip(1) {
        let t = l.trim_end();
        if t == "---" || t == "..." {
            return i + 1;
        }
    }
    0 // 닫히지 않았다 — frontmatter 가 아니라고 본다
}

pub fn headings(src: &str) -> Vec<Heading> {
    let lines: Vec<&str> = src.lines().collect();
    let start = skip_frontmatter(&lines);
    let mut out = Vec::new();
    let mut fence: Option<(char, usize)> = None;

    for (i, line) in lines.iter().enumerate().skip(start) {
        match fence {
            Some((fc, fl)) => {
                if let Some((c, n)) = fence_marker(line) {
                    if c == fc && n >= fl {
                        fence = None;
                    }
                }
                continue; // 코드블록 안의 `#` 는 헤딩이 아니다
            }
            None => {
                if let Some(open) = fence_marker(line) {
                    fence = Some(open);
                    continue;
                }
            }
        }
        if let Some((level, text)) = atx(line) {
            out.push(Heading { level, text, line: i + 1 });
        }
    }
    out
}

/// 헤딩 이름으로 섹션의 줄 범위(1-based, 양끝 포함)를 찾는다.
///
/// 같은 이름이 여럿이면 **처음 것**. 정확히 일치하는 것이 없으면 대소문자 무시 부분일치로
/// 한 번 더 찾는다(에이전트가 제목을 줄여 부르는 일이 흔하다).
/// 끝은 **같거나 더 높은 레벨**의 다음 헤딩 직전 — 하위 절은 섹션에 포함된다.
pub fn section_range(src: &str, heading: &str) -> Option<(usize, usize)> {
    let hs = headings(src);
    let want = heading.trim();
    let idx = hs
        .iter()
        .position(|h| h.text.eq_ignore_ascii_case(want))
        .or_else(|| {
            let lower = want.to_lowercase();
            hs.iter().position(|h| h.text.to_lowercase().contains(&lower))
        })?;

    let level = hs[idx].level;
    let from = hs[idx].line;
    let to = hs[idx + 1..]
        .iter()
        .find(|h| h.level <= level)
        .map(|h| h.line - 1)
        .unwrap_or_else(|| src.lines().count());
    Some((from, to.max(from)))
}

/// 1-based 양끝 포함 범위를 잘라 낸다. 범위 밖은 잘리고, 뒤집힌 범위는 빈 문자열.
pub fn slice_lines(src: &str, from: usize, to: usize) -> String {
    if from == 0 || to < from {
        return String::new();
    }
    src.lines()
        .skip(from - 1)
        .take(to - from + 1)
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn levels(src: &str) -> Vec<(u8, String, usize)> {
        headings(src).into_iter().map(|h| (h.level, h.text, h.line)).collect()
    }

    #[test]
    fn atx_levels_and_lines() {
        let src = "# 하나\n본문\n### 셋\n";
        assert_eq!(levels(src), vec![(1, "하나".into(), 1), (3, "셋".into(), 3)]);
    }

    #[test]
    fn closing_hashes_are_stripped() {
        assert_eq!(levels("## 제목 ##\n"), vec![(2, "제목".into(), 1)]);
    }

    #[test]
    fn hash_without_space_is_not_a_heading() {
        assert_eq!(levels("#hashtag\n"), Vec::new());
    }

    #[test]
    fn seven_hashes_is_not_a_heading() {
        assert_eq!(levels("####### 일곱\n"), Vec::new());
    }

    #[test]
    fn headings_inside_fences_are_ignored() {
        // 에이전트 산출물에는 셸 예시가 흔하다 — `# 주석` 이 헤딩으로 잡히면 아웃라인이 망가진다.
        let src = "# 진짜\n```sh\n# 가짜 주석\n```\n## 진짜2\n";
        assert_eq!(levels(src), vec![(1, "진짜".into(), 1), (2, "진짜2".into(), 5)]);
    }

    #[test]
    fn tilde_fence_and_longer_close() {
        let src = "~~~\n# 가짜\n~~~~\n# 진짜\n";
        assert_eq!(levels(src), vec![(1, "진짜".into(), 4)]);
    }

    #[test]
    fn frontmatter_is_skipped() {
        let src = "---\ntitle: x\n# 이건 YAML 주석\n---\n# 진짜\n";
        assert_eq!(levels(src), vec![(1, "진짜".into(), 5)]);
    }

    #[test]
    fn unclosed_frontmatter_is_not_frontmatter() {
        let src = "---\n# 진짜\n";
        assert_eq!(levels(src), vec![(1, "진짜".into(), 2)]);
    }

    #[test]
    fn section_ends_before_same_level_heading() {
        let src = "# A\na1\n## A-1\nx\n# B\nb1\n";
        assert_eq!(section_range(src, "A"), Some((1, 4)));
        assert_eq!(slice_lines(src, 1, 4), "# A\na1\n## A-1\nx");
    }

    #[test]
    fn section_runs_to_end_of_file() {
        let src = "# A\na1\n# B\nb1\nb2\n";
        assert_eq!(section_range(src, "B"), Some((3, 5)));
    }

    #[test]
    fn section_matches_case_insensitively_then_by_substring() {
        let src = "# Install Guide\nx\n# Other\n";
        assert_eq!(section_range(src, "install guide"), Some((1, 2)));
        assert_eq!(section_range(src, "Install"), Some((1, 2)));
        assert_eq!(section_range(src, "없는제목"), None);
    }

    #[test]
    fn slice_clamps_and_rejects_inverted() {
        let src = "a\nb\nc\n";
        assert_eq!(slice_lines(src, 2, 99), "b\nc");
        assert_eq!(slice_lines(src, 3, 2), "");
        assert_eq!(slice_lines(src, 0, 2), "");
    }
}
