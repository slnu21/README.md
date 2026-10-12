//! 표시 범위 옮기기 — `app/lib/annot/diff.ts` · `relocate.ts` 를 그대로 옮긴 것(브리지 `list_annotations` 용).
//!
//! **판정이 두 벌이면 한쪽만 샌다** — 그래서 두 구현이 같은 벡터 파일(`app/lib/annot/relocate.vectors.json`)을
//! 돈다. 한쪽을 고치면 다른 쪽도 고치고 벡터를 더한다. 오프셋은 JS 와 같은 **UTF-16 단위**로 받고 돌려준다
//! (안에서는 `char` 단위로 계산하고 경계에서 바꾼다).
//!
//! 알고 두는 차이: 낱말 판정이 JS 는 `\p{L}\p{N}_`, 여기는 `char::is_alphanumeric` 이다 — 결합 부호(아랍 문자
//! 모음 기호 등) 처리에서 갈릴 수 있다. 벡터의 페르시아어는 모음 기호가 없다.

#[derive(Clone, Copy, Debug, PartialEq)]
enum Kind {
    Eq,
    Del,
    Ins,
}

#[derive(Clone, Copy, Debug)]
struct Run {
    kind: Kind,
    a0: usize,
    a1: usize,
    b0: usize,
    b1: usize,
}

const MAX_EDITS: usize = 2000;

fn push(out: &mut Vec<Run>, r: Run) {
    if r.a0 == r.a1 && r.b0 == r.b1 {
        return;
    }
    if let Some(last) = out.last_mut() {
        if last.kind == r.kind && last.a1 == r.a0 && last.b1 == r.b0 {
            last.a1 = r.a1;
            last.b1 = r.b1;
            return;
        }
    }
    out.push(r);
}

fn diff_seq<T: PartialEq>(a: &[T], b: &[T], max_edits: usize) -> Vec<Run> {
    let (n, m) = (a.len(), b.len());
    let mut pre = 0;
    while pre < n && pre < m && a[pre] == b[pre] {
        pre += 1;
    }
    let mut suf = 0;
    while suf < n - pre && suf < m - pre && a[n - 1 - suf] == b[m - 1 - suf] {
        suf += 1;
    }
    let mut out = Vec::new();
    if pre > 0 {
        out.push(Run { kind: Kind::Eq, a0: 0, a1: pre, b0: 0, b1: pre });
    }
    for r in myers(a, b, pre, n - suf, pre, m - suf, max_edits) {
        push(&mut out, r);
    }
    if suf > 0 {
        push(&mut out, Run { kind: Kind::Eq, a0: n - suf, a1: n, b0: m - suf, b1: m });
    }
    out
}

fn myers<T: PartialEq>(a: &[T], b: &[T], a_lo: usize, a_hi: usize, b_lo: usize, b_hi: usize, max_edits: usize) -> Vec<Run> {
    let nn = (a_hi - a_lo) as i64;
    let mm = (b_hi - b_lo) as i64;
    let coarse = || {
        let mut r = Vec::new();
        if nn > 0 {
            r.push(Run { kind: Kind::Del, a0: a_lo, a1: a_hi, b0: b_lo, b1: b_lo });
        }
        if mm > 0 {
            r.push(Run { kind: Kind::Ins, a0: a_hi, a1: a_hi, b0: b_lo, b1: b_hi });
        }
        r
    };
    if nn == 0 || mm == 0 {
        return coarse();
    }
    let max = (nn + mm).min(max_edits as i64);
    let off = max + 1;
    let mut v = vec![0i64; (2 * max + 3) as usize];
    let mut trace: Vec<Vec<i64>> = Vec::new();
    let mut found = -1i64;
    'outer: for d in 0..=max {
        trace.push(v[(off - d - 1) as usize..(off + d + 2) as usize].to_vec());
        let mut k = -d;
        while k <= d {
            let mut x = if k == -d || (k != d && v[(off + k - 1) as usize] < v[(off + k + 1) as usize]) {
                v[(off + k + 1) as usize]
            } else {
                v[(off + k - 1) as usize] + 1
            };
            let mut y = x - k;
            while x < nn && y < mm && a[a_lo + x as usize] == b[b_lo + y as usize] {
                x += 1;
                y += 1;
            }
            v[(off + k) as usize] = x;
            if x >= nn && y >= mm {
                found = d;
                break 'outer;
            }
            k += 2;
        }
    }
    if found < 0 {
        return coarse();
    }
    let mut steps: Vec<Run> = Vec::new();
    let (mut x, mut y) = (nn, mm);
    for d in (0..=found).rev() {
        let t = &trace[d as usize];
        let at = |k: i64| t[(k + d + 1) as usize];
        let k = x - y;
        let prev_k = if k == -d || (k != d && at(k - 1) < at(k + 1)) { k + 1 } else { k - 1 };
        let prev_x = if d == 0 { 0 } else { at(prev_k) };
        let prev_y = prev_x - prev_k;
        while x > prev_x && y > prev_y {
            x -= 1;
            y -= 1;
            let (ax, by) = (a_lo + x as usize, b_lo + y as usize);
            steps.push(Run { kind: Kind::Eq, a0: ax, a1: ax + 1, b0: by, b1: by + 1 });
        }
        if d > 0 {
            if x == prev_x {
                let (ax, by) = (a_lo + x as usize, b_lo + prev_y as usize);
                steps.push(Run { kind: Kind::Ins, a0: ax, a1: ax, b0: by, b1: by + 1 });
            } else {
                let (ax, by) = (a_lo + prev_x as usize, b_lo + y as usize);
                steps.push(Run { kind: Kind::Del, a0: ax, a1: ax + 1, b0: by, b1: by });
            }
        }
        x = prev_x;
        y = prev_y;
    }
    let mut out = Vec::new();
    for r in steps.into_iter().rev() {
        push(&mut out, r);
    }
    out
}

#[derive(Clone, Copy, Debug)]
struct Segment {
    eq: bool,
    o0: usize,
    o1: usize,
    n0: usize,
    n1: usize,
}

fn add_seg(out: &mut Vec<Segment>, eq: bool, o0: usize, o1: usize, n0: usize, n1: usize) {
    if o0 == o1 && n0 == n1 {
        return;
    }
    if let Some(last) = out.last_mut() {
        if last.eq == eq && last.o1 == o0 && last.n1 == n0 {
            last.o1 = o1;
            last.n1 = n1;
            return;
        }
    }
    out.push(Segment { eq, o0, o1, n0, n1 });
}

/// 줄(줄바꿈 포함)의 시작 위치들. 마지막 원소 = 끝.
fn split_lines(t: &[char], lo: usize, hi: usize) -> Vec<usize> {
    let mut s = vec![lo];
    for (i, c) in t.iter().enumerate().take(hi).skip(lo) {
        if *c == '\n' && i + 1 < hi {
            s.push(i + 1);
        }
    }
    if hi > lo {
        s.push(hi);
    } else {
        s.clear();
        s.push(lo);
    }
    s
}

fn is_word(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

/// 낱말 · 공백(줄바꿈 아님) · 줄바꿈 · 기호 하나씩 — 시작 위치들(마지막 = 끝).
fn tokenize(t: &[char], lo: usize, hi: usize) -> Vec<usize> {
    let mut s = Vec::new();
    let mut i = lo;
    while i < hi {
        s.push(i);
        let c = t[i];
        if is_word(c) {
            while i < hi && is_word(t[i]) {
                i += 1;
            }
        } else if c != '\n' && c.is_whitespace() {
            while i < hi && t[i] != '\n' && t[i].is_whitespace() {
                i += 1;
            }
        } else {
            i += 1;
        }
    }
    s.push(hi);
    s
}

fn pieces<'a>(t: &'a [char], starts: &[usize]) -> Vec<&'a [char]> {
    starts.windows(2).map(|w| &t[w[0]..w[1]]).collect()
}

fn text_segments(old: &[char], new: &[char]) -> Vec<Segment> {
    let ol = split_lines(old, 0, old.len());
    let nl = split_lines(new, 0, new.len());
    let ow = pieces(old, &ol);
    let nw = pieces(new, &nl);
    let mut runs = diff_seq(&ow, &nw, MAX_EDITS);
    // 덩어리 사이 빈 줄뿐인 eq 는 덩어리로(diff.ts 와 같은 이유).
    let mut i = 1;
    while i + 1 < runs.len() {
        let r = runs[i];
        if r.kind == Kind::Eq
            && runs[i - 1].kind != Kind::Eq
            && runs[i + 1].kind != Kind::Eq
            && ow[r.a0..r.a1].iter().all(|l| l.iter().all(|c| c.is_whitespace()))
        {
            runs[i] = Run { kind: Kind::Del, a0: r.a0, a1: r.a1, b0: r.b0, b1: r.b0 };
            runs.insert(i + 1, Run { kind: Kind::Ins, a0: r.a1, a1: r.a1, b0: r.b0, b1: r.b1 });
        }
        i += 1;
    }
    let mut out = Vec::new();
    let mut i = 0;
    while i < runs.len() {
        let r = runs[i];
        if r.kind == Kind::Eq {
            add_seg(&mut out, true, ol[r.a0], ol[r.a1], nl[r.b0], nl[r.b1]);
            i += 1;
            continue;
        }
        let (mut a0, mut a1, mut b0, mut b1) = (r.a0, r.a1, r.b0, r.b1);
        i += 1;
        while i < runs.len() && runs[i].kind != Kind::Eq {
            a0 = a0.min(runs[i].a0);
            a1 = a1.max(runs[i].a1);
            b0 = b0.min(runs[i].b0);
            b1 = b1.max(runs[i].b1);
            i += 1;
        }
        hunk(&mut out, old, new, ol[a0], ol[a1], nl[b0], nl[b1]);
    }
    out
}

fn similarity(a: &[char], b: &[char]) -> f64 {
    let ta: Vec<&[char]> = pieces(a, &tokenize(a, 0, a.len())).into_iter().filter(|t| !t.iter().all(|c| c.is_whitespace())).collect();
    let tb: Vec<&[char]> = pieces(b, &tokenize(b, 0, b.len())).into_iter().filter(|t| !t.iter().all(|c| c.is_whitespace())).collect();
    if ta.is_empty() && tb.is_empty() {
        return 1.0;
    }
    if ta.is_empty() || tb.is_empty() {
        return 0.0;
    }
    let lcs: usize = diff_seq(&ta, &tb, 400).iter().filter(|r| r.kind == Kind::Eq).map(|r| r.a1 - r.a0).sum();
    (2 * lcs) as f64 / (ta.len() + tb.len()) as f64
}

const PAIR_MIN: f64 = 0.5;
const PAIR_CELLS: usize = 400;

fn hunk(out: &mut Vec<Segment>, old: &[char], new: &[char], o0: usize, o1: usize, n0: usize, n1: usize) {
    let os = split_lines(old, o0, o1);
    let ns = split_lines(new, n0, n1);
    let (ii, jj) = (os.len() - 1, ns.len() - 1);
    if ii <= 1 || jj == 0 || ii * jj > PAIR_CELLS {
        token_hunk(out, old, new, o0, o1, n0, n1);
        return;
    }
    let sim: Vec<Vec<f64>> = (0..ii).map(|i| (0..jj).map(|j| similarity(&old[os[i]..os[i + 1]], &new[ns[j]..ns[j + 1]])).collect()).collect();
    let mut best = vec![vec![0f64; jj + 1]; ii + 1];
    for i in 1..=ii {
        for j in 1..=jj {
            let s = sim[i - 1][j - 1];
            let pair = if s >= PAIR_MIN { best[i - 1][j - 1] + s } else { -1.0 };
            best[i][j] = best[i - 1][j].max(best[i][j - 1]).max(pair);
        }
    }
    let mut pairs = Vec::new();
    let (mut i, mut j) = (ii, jj);
    while i > 0 && j > 0 {
        let s = sim[i - 1][j - 1];
        if s >= PAIR_MIN && best[i][j] == best[i - 1][j - 1] + s {
            pairs.push((i - 1, j - 1));
            i -= 1;
            j -= 1;
        } else if best[i][j] == best[i - 1][j] {
            i -= 1;
        } else {
            j -= 1;
        }
    }
    pairs.reverse();
    let (mut pi, mut pj) = (0usize, 0usize);
    for (i, j) in pairs {
        if os[pi] != os[i] || ns[pj] != ns[j] {
            token_hunk(out, old, new, os[pi], os[i], ns[pj], ns[j]);
        }
        token_hunk(out, old, new, os[i], os[i + 1], ns[j], ns[j + 1]);
        pi = i + 1;
        pj = j + 1;
    }
    if os[pi] != os[ii] || ns[pj] != ns[jj] {
        token_hunk(out, old, new, os[pi], os[ii], ns[pj], ns[jj]);
    }
}

fn token_hunk(out: &mut Vec<Segment>, old: &[char], new: &[char], o0: usize, o1: usize, n0: usize, n1: usize) {
    let os = tokenize(old, o0, o1);
    let ns = tokenize(new, n0, n1);
    let ot = pieces(old, &os);
    let nt = pieces(new, &ns);
    let runs = diff_seq(&ot, &nt, MAX_EDITS);
    let noise = |r: &Run| r.kind == Kind::Eq && ot[r.a0..r.a1].iter().all(|t| !t.iter().any(|c| c.is_alphanumeric()));
    let group = |i: usize, back: bool| {
        let (mut del, mut ins) = (false, false);
        let mut k = i as i64 + if back { -1 } else { 1 };
        while k >= 0 && (k as usize) < runs.len() && runs[k as usize].kind != Kind::Eq {
            if runs[k as usize].kind == Kind::Del {
                del = true;
            } else {
                ins = true;
            }
            k += if back { -1 } else { 1 };
        }
        del && ins
    };
    for (i, r) in runs.iter().enumerate() {
        let between = i > 0 && i + 1 < runs.len() && runs[i - 1].kind != Kind::Eq && runs[i + 1].kind != Kind::Eq && group(i, true) && group(i, false);
        add_seg(out, r.kind == Kind::Eq && !(between && noise(r)), os[r.a0], os[r.a1], ns[r.b0], ns[r.b1]);
    }
}

#[derive(Debug, PartialEq, Clone, Copy)]
pub enum State {
    Same,
    Moved,
    Changed,
    Gone,
}

impl State {
    pub fn as_str(self) -> &'static str {
        match self {
            State::Same => "same",
            State::Moved => "moved",
            State::Changed => "changed",
            State::Gone => "gone",
        }
    }
}

#[derive(Debug)]
pub struct Relocated {
    pub state: State,
    /// 지금 판의 UTF-16 시작(줄 번호용).
    pub start: usize,
    pub before: String,
    pub after: String,
}

/// 옛 글(표시의 판) ↔ 새 글(지금 판). 같은 판의 표시 여럿을 diff 한 번으로.
pub struct Relocator {
    old: Vec<char>,
    new: Vec<char>,
    segs: Vec<Segment>,
}

/// UTF-16 위치 → char 위치(범위 밖이면 끝).
fn u16_to_char(t: &[char], u: usize) -> usize {
    let mut acc = 0;
    for (i, c) in t.iter().enumerate() {
        if acc >= u {
            return i;
        }
        acc += c.len_utf16();
    }
    t.len()
}

fn char_to_u16(t: &[char], ci: usize) -> usize {
    t[..ci.min(t.len())].iter().map(|c| c.len_utf16()).sum()
}

impl Relocator {
    pub fn new(old: &str, new: &str) -> Self {
        let old: Vec<char> = old.chars().collect();
        let new: Vec<char> = new.chars().collect();
        let segs = if old == new {
            vec![Segment { eq: true, o0: 0, o1: old.len(), n0: 0, n1: new.len() }]
        } else {
            text_segments(&old, &new)
        };
        Relocator { old, new, segs }
    }

    fn map(&self, p: usize, start: bool) -> usize {
        if !start && p == 0 {
            return 0;
        }
        for s in &self.segs {
            if s.o0 == s.o1 {
                continue;
            }
            let hit = if start { s.o0 <= p && p < s.o1 } else { s.o0 < p && p <= s.o1 };
            if !hit {
                if s.o0 > p {
                    break;
                }
                continue;
            }
            if s.eq {
                return s.n0 + (p - s.o0);
            }
            return if start { s.n0 } else { s.n1 };
        }
        self.new.len()
    }

    /// UTF-16 범위 [start, end) 를 옮긴다.
    pub fn relocate(&self, start_u16: usize, end_u16: usize) -> Relocated {
        let start = u16_to_char(&self.old, start_u16);
        let end = u16_to_char(&self.old, end_u16).max(start);
        let before: String = self.old[start..end].iter().collect();
        let touched = self.segs.iter().any(|s| {
            !s.eq && ((s.o0 < end && s.o1 > start) || (s.o0 == s.o1 && s.o0 > start && s.o0 < end))
        });
        let mut ns = self.map(start, true);
        let mut ne = self.map(end, false).max(ns);
        let pack = |state, a: usize, b: usize| Relocated {
            state,
            start: char_to_u16(&self.new, a),
            before: before.clone(),
            after: self.new[a..b].iter().collect(),
        };
        if !touched {
            let state = if ns == start && ne == end { State::Same } else { State::Moved };
            return pack(state, ns, ne);
        }
        while ns < ne && self.new[ns].is_whitespace() {
            ns += 1;
        }
        while ne > ns && self.new[ne - 1].is_whitespace() {
            ne -= 1;
        }
        if ne <= ns {
            return pack(State::Gone, ns, ns);
        }
        pack(State::Changed, ns, ne)
    }
}

/// UTF-16 위치의 줄(0부터).
pub fn line_at_u16(text: &str, u: usize) -> usize {
    let mut acc = 0;
    let mut n = 0;
    for c in text.chars() {
        if acc >= u {
            break;
        }
        if c == '\n' {
            n += 1;
        }
        acc += c.len_utf16();
    }
    n
}

#[cfg(test)]
mod tests {
    use super::*;

    fn u16_index(s: &str, needle: &str, nth: usize) -> usize {
        let mut from = 0;
        let mut byte = 0;
        for _ in 0..=nth {
            byte = from + s[from..].find(needle).expect("needle");
            from = byte + needle.len();
        }
        s[..byte].encode_utf16().count()
    }

    #[test]
    fn shared_vectors_agree_with_the_frontend() {
        let v: serde_json::Value = serde_json::from_str(include_str!("../../app/lib/annot/relocate.vectors.json")).unwrap();
        let cases = v["cases"].as_array().unwrap();
        assert!(cases.len() >= 13);
        for c in cases {
            let name = c["name"].as_str().unwrap();
            let (old, new, needle) = (c["old"].as_str().unwrap(), c["new"].as_str().unwrap(), c["needle"].as_str().unwrap());
            let nth = c.get("nth").and_then(|x| x.as_u64()).unwrap_or(0) as usize;
            let s = u16_index(old, needle, nth);
            let e = s + needle.encode_utf16().count();
            let r = Relocator::new(old, new).relocate(s, e);
            assert_eq!(r.state.as_str(), c["state"].as_str().unwrap(), "{name}: 상태");
            assert_eq!(r.after, c["after"].as_str().unwrap(), "{name}: 지금 글");
            if let Some(at) = c.get("afterAt").and_then(|x| x.as_u64()) {
                assert_eq!(r.start, u16_index(new, c["after"].as_str().unwrap(), at as usize), "{name}: 위치");
            }
        }
    }

    #[test]
    fn the_probe_fixture_case_too() {
        // probe:annot 이 찾은 줄 짝 오류 — 짧은 문단으로는 재현이 안 돼 실제 픽스처로(relocate.test.ts 와 같은 수정).
        let o = include_str!("../../../docs/samples/annot-review.md").replace("\r\n", "\n");
        let n = o
            .replacen("## 무엇을 했나\n", "## 무엇을 했나\n\n(에이전트가 덧붙임) 이 절은 10-12 에 다시 썼다.\n", 1)
            .replacen("근거가 부족하다", "근거가 충분하다", 1)
            .replacen("- 지워진 파일은 walk 하며 본 경로 목록과 대조해 색인에서 뺀다.\n", "", 1);
        let rel = Relocator::new(&o, &n);
        let at = |needle: &str| {
            let s = u16_index(&o, needle, 0);
            rel.relocate(s, s + needle.encode_utf16().count())
        };
        let r = at("근거가 부족하다");
        assert_eq!((r.state, r.after.as_str()), (State::Changed, "근거가 충분하다"));
        let r = at("부팅 때마다 색인 전체를");
        assert_eq!((r.state, r.after.as_str()), (State::Moved, "부팅 때마다 색인 전체를"));
        assert_eq!(at("지워진 파일은").state, State::Gone);
    }

    #[test]
    fn utf16_offsets_round_trip_past_an_emoji() {
        let t = "😀a\nb";
        assert_eq!(line_at_u16(t, 3), 0);
        assert_eq!(line_at_u16(t, 4), 1);
        let cs: Vec<char> = t.chars().collect();
        assert_eq!(u16_to_char(&cs, 2), 1);
        assert_eq!(char_to_u16(&cs, 1), 2);
    }
}
