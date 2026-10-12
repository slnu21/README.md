//! 성능 측정 — 색인·검색·브리지 도구를 **진짜 디스크 DB**(WAL) 위에서 잰다.
//!
//! 평소 `cargo test` 에는 안 돈다(`#[ignore]`). 재는 법:
//!
//! ```text
//! cd src/src-tauri
//! cargo test --release --lib perf::perf_ -- --ignored --nocapture
//! ```
//!
//! 메모리 DB 를 쓰지 않는 이유: 색인 비용의 큰 몫이 **커밋마다의 fsync** 인데 메모리 DB 는 그걸
//! 통째로 숨긴다. 그래서 임시 폴더에 진짜 파일 DB 를 만들고 앱과 같은 PRAGMA(`db::open_at`)로 연다.
//! 픽스처도 디스크에 쓴다(walk·stat·read 가 측정 대상이다).
//!
//! 결과는 `PERF {json}` 한 줄로 찍고, 예산(`tools/perf-budget.json` — 프런트 프로브와 같은 파일)을
//! 넘으면 실패한다. 숫자와 예산의 근거는 docs/design/performance.md.
#![cfg(test)]

use crate::commands::search;
use crate::db;
use crate::mcp::tools;
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::Instant;

const BUDGET: &str = include_str!("../../tools/perf-budget.json");

/// 결정적 의사난수(xorshift) — 픽스처가 실행마다 같아야 숫자를 비교할 수 있다.
struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn pick<'a>(&mut self, xs: &'a [&'a str]) -> &'a str {
        xs[(self.next() % xs.len() as u64) as usize]
    }
    fn unit(&mut self) -> f64 {
        (self.next() >> 11) as f64 / (1u64 << 53) as f64
    }
    /// 실제 글처럼 낱말 빈도가 지프(1/순위)를 따르는 낱말 하나. 순위는 로그 균등으로 뽑는다.
    /// 이름 있는 낱말(WORDS)은 순위 10~45 — 흔하지만(대부분 문서에 있다) 문서마다 몇 번뿐이다.
    /// 낱말 36 개를 고르게 뽑던 첫 픽스처는 모든 낱말이 문서마다 수십 번 나와 스니펫 비용을
    /// 병적으로 부풀렸다(docs/design/performance.md).
    fn word(&mut self) -> String {
        let r = (VOCAB as f64).powf(self.unit()) as usize; // 1..VOCAB
        if (10..10 + WORDS.len()).contains(&r) {
            WORDS[r - 10].to_string()
        } else {
            format!("w{r}")
        }
    }
}

const VOCAB: usize = 5000;

const WORDS: &[&str] = &[
    "agent", "report", "index", "search", "snapshot", "workspace", "render", "preview", "outline",
    "section", "bridge", "inbox", "history", "theme", "diagram", "latency", "budget", "fixture",
    "문서", "에이전트", "보고서", "색인", "검색", "기록", "미리보기", "작업", "결정", "함정", "검증",
    "설계", "배포", "테마", "성능", "예산", "목차", "단락",
];

/// 에이전트 산출물 같은 문서 하나(헤딩 · 문단 · 목록 · 코드 펜스). 대략 `paras` 문단.
fn gen_doc(rng: &mut Rng, title: &str, paras: usize) -> String {
    let mut s = format!("# {title}\n\n");
    for p in 0..paras {
        if p % 4 == 0 {
            s += &format!("\n## {} {}\n\n", rng.pick(WORDS), p / 4 + 1);
        }
        let n = 30 + (rng.next() % 40) as usize;
        let words: Vec<String> = (0..n).map(|_| rng.word()).collect();
        s += &words.join(" ");
        s += ".\n\n";
        if p % 7 == 3 {
            s += "- [x] done item\n- [ ] open item\n\n";
        }
        if p % 9 == 5 {
            s += "```bash\n# 주석처럼 보이는 셸 줄 — 헤딩이 아니다\nnpm run build\n```\n\n";
        }
    }
    s
}

struct Fixture {
    root: PathBuf,
    big: PathBuf,
    files: Vec<PathBuf>,
}

/// `n` 개 문서를 50 개 폴더에 나눠 쓴다 + 1MB 짜리 큰 문서 하나.
fn make_fixture(base: &Path, n: usize) -> Fixture {
    let root = base.join("ws");
    let mut rng = Rng(0x9E37_79B9_7F4A_7C15);
    let mut files = Vec::with_capacity(n);
    for i in 0..n {
        let dir = root.join(format!("project-{:02}", i % 50)).join(format!("notes-{}", i % 7));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join(format!("doc-{i:05}.md"));
        let paras = 6 + (rng.next() % 18) as usize; // 대략 2~8KB
        // 드문 낱말 — 문서 10 개씩만 가진다(좁은 검색). 흔한 낱말은 거의 모든 문서에 있다(넓은 검색).
        let doc = gen_doc(&mut rng, &format!("Doc {i}"), paras) + &format!("\nref kw{:03}\n", i % 500);
        std::fs::write(&p, doc).unwrap();
        files.push(p);
    }
    // 걸러져야 할 소음도 둔다 — walk 가 건너뛰는 비용까지가 실제 비용이다.
    let nm = root.join("project-00").join("node_modules").join("pkg");
    std::fs::create_dir_all(&nm).unwrap();
    for i in 0..200 {
        std::fs::write(nm.join(format!("readme-{i}.md")), "# noise\n").unwrap();
    }
    let big = root.join("big.md");
    let mut doc = String::new();
    let mut k = 0;
    while doc.len() < 1_000_000 {
        doc += &gen_doc(&mut rng, &format!("Part {k}"), 12);
        k += 1;
    }
    std::fs::write(&big, doc).unwrap();
    Fixture { root, big, files }
}

fn ms(t: Instant) -> f64 {
    (t.elapsed().as_secs_f64() * 1000.0 * 10.0).round() / 10.0
}

fn median(mut xs: Vec<f64>) -> f64 {
    xs.sort_by(|a, b| a.partial_cmp(b).unwrap());
    xs[xs.len() / 2]
}

fn p95(mut xs: Vec<f64>) -> f64 {
    xs.sort_by(|a, b| a.partial_cmp(b).unwrap());
    xs[((xs.len() as f64) * 0.95).ceil() as usize - 1]
}

fn time_n(n: usize, mut f: impl FnMut()) -> Vec<f64> {
    (0..n)
        .map(|_| {
            let t = Instant::now();
            f();
            t.elapsed().as_secs_f64() * 1000.0
        })
        .collect()
}

fn round1(x: f64) -> f64 {
    (x * 10.0).round() / 10.0
}

fn open_db(base: &Path) -> Connection {
    let mut conn = db::open_at(&base.join(db::DB_FILE)).unwrap();
    db::migrate_for_test(&mut conn).unwrap();
    conn
}

/// 예산 대조 — 넘은 항목을 모아 한꺼번에 보고한다(첫 위반에서 멈추면 나머지를 모른다).
fn check_budget(section: &str, got: &Value) -> Vec<String> {
    let budget: Value = serde_json::from_str(BUDGET).expect("perf-budget.json 파싱");
    let mut over = Vec::new();
    if let Some(limits) = budget[section].as_object() {
        for (k, lim) in limits {
            if k.starts_with('_') {
                continue; // 주석 키
            }
            match (got[k].as_f64(), lim.as_f64()) {
                (Some(v), Some(l)) if v > l => over.push(format!("{section}.{k} = {v} > 예산 {l}")),
                (None, _) => over.push(format!("{section}.{k} 를 재지 않았다(예산에는 있다)")),
                _ => {}
            }
        }
    }
    over
}

#[test]
#[ignore = "성능 측정 — cargo test --release --lib perf::perf_ -- --ignored --nocapture"]
fn perf_index_search_bridge() {
    let base = std::env::temp_dir().join(format!("readme-perf-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&base);
    std::fs::create_dir_all(&base).unwrap();

    let n = 5000;
    let t = Instant::now();
    let fx = make_fixture(&base, n);
    let gen_ms = ms(t);
    let bytes: u64 = fx.files.iter().map(|p| std::fs::metadata(p).unwrap().len()).sum();

    let conn = open_db(&base);
    let root_s = fx.root.to_string_lossy().into_owned();

    // ① 첫 색인 — 폴더를 처음 가져올 때.
    let t = Instant::now();
    let (count, _) = search::index_folder(&conn, &fx.root).unwrap();
    let index_first_ms = ms(t);
    assert_eq!(count as usize, n + 1, "문서 수 + big.md 가 색인돼야 한다(node_modules 는 빠진다)");

    // ② 부팅 재색인 — 아무것도 안 바뀌었을 때(매 부팅마다 내는 비용).
    let t = Instant::now();
    let (count2, removed2) = search::index_folder(&conn, &fx.root).unwrap();
    let reindex_noop_ms = ms(t);
    assert_eq!((count2, removed2), (0, 0));

    // ③ 밤사이 에이전트가 100 개를 고쳐 놓은 아침의 부팅 재색인(기록 스냅샷까지 뜬다).
    std::thread::sleep(std::time::Duration::from_millis(20)); // mtime 이 확실히 달라지게
    for p in fx.files.iter().step_by(n / 100) {
        let mut s = std::fs::read_to_string(p).unwrap();
        s += "\n\n## 추가된 절\n\n에이전트가 밤사이 덧붙인 문단.\n";
        std::fs::write(p, s).unwrap();
    }
    let t = Instant::now();
    let (count3, _) = search::index_folder(&conn, &fx.root).unwrap();
    let reindex_100_ms = ms(t);
    assert_eq!(count3, 100);

    // ④ 전역 검색(앱의 search_query 와 같은 알맹이) — 넓은 검색(거의 전부 맞음 = 최악)과 좁은
    // 검색(10 건)을 따로 잰다. 낱말·접두어·한글·여러 낱말을 섞는다.
    let broad = ["snapshot", "에이전트", "budget latency", "검증 함정", "outl", "보고서 report"];
    let narrow = ["kw042", "kw317 ref", "kw49"];
    let like = format!("{root_s}%");
    // 질의별 중앙값도 남긴다 — 중앙값만 보면 느린 질의 하나가 p95 뒤에 숨는다.
    let mut by_query = serde_json::Map::new();
    let mut run = |qs: &[&str]| {
        let mut out = Vec::new();
        for q in qs {
            let m = search::build_match(q).unwrap();
            let mut hits = 0;
            let xs = time_n(10, || {
                let rows = search::match_rows(&conn, &m, Some(&like), 50).unwrap();
                assert!(!rows.is_empty(), "{q} 가 아무것도 못 찾았다");
                hits = rows.len();
            });
            by_query.insert(q.to_string(), json!(format!("{}ms/{hits}", round1(median(xs.clone())))));
            out.extend(xs);
        }
        out
    };
    let search_ms = run(&broad);
    let narrow_ms = run(&narrow);
    let queries = broad;

    // ⑤ 브리지 도구 — tools::call 그대로(스코프 적재 포함). stdio 왕복만 빠진다.
    conn.execute(
        "INSERT INTO node (id, workspace_id, parent_id, kind, name, real_path, sort_order, created_at)
         VALUES ('perf-root', 'default', NULL, 'imported_folder', 'ws', ?1, 0, 0)",
        params![root_s],
    )
    .unwrap();
    let mut bridge_search = Vec::new();
    for q in queries {
        bridge_search.extend(time_n(10, || {
            tools::call(&conn, "search_docs", &json!({ "query": q })).unwrap();
        }));
    }
    let big_s = fx.big.to_string_lossy().into_owned();
    let outline_big = time_n(10, || {
        let v = tools::call(&conn, "outline", &json!({ "path": big_s })).unwrap();
        assert!(v["headings"].as_array().unwrap().len() > 100);
    });
    let read_big = time_n(10, || {
        tools::call(&conn, "read_section", &json!({ "path": big_s, "heading": "Part 200" })).unwrap();
    });
    let small_s = fx.files[1234].to_string_lossy().into_owned();
    let read_small = time_n(20, || {
        tools::call(&conn, "read_section", &json!({ "path": small_s, "fromLine": 1, "toLine": 40 }))
            .unwrap();
    });

    // ⑥ v4 판올림 — 기동 때 창보다 먼저 도는 일이다. v3 상태 DB 에 같은 5천 문서를 넣고 잰다.
    let migrate_v4_ms = {
        let p = base.join("v3.db");
        let mut c3 = db::open_at(&p).unwrap();
        db::migrate_to_for_test(&mut c3, 3).unwrap();
        let tx = c3.transaction().unwrap();
        for f in &fx.files {
            let fs = f.to_string_lossy().into_owned();
            let text = std::fs::read_to_string(f).unwrap();
            tx.execute("INSERT INTO file_index(real_path, content) VALUES (?1, ?2)", params![fs, text]).unwrap();
            tx.execute(
                "INSERT INTO file_meta(real_path, mtime, size, indexed_at) VALUES (?1, 1, ?2, 0)",
                params![fs, text.len() as i64],
            )
            .unwrap();
        }
        tx.commit().unwrap();
        let t = Instant::now();
        db::migrate_for_test(&mut c3).unwrap();
        let took = ms(t);
        let linked: i64 = c3
            .query_row("SELECT count(*) FROM file_meta WHERE fts_rowid IS NOT NULL", [], |r| r.get(0))
            .unwrap();
        assert_eq!(linked as usize, n);
        took
    };

    let db_bytes = std::fs::metadata(base.join(db::DB_FILE)).map(|m| m.len()).unwrap_or(0)
        + std::fs::metadata(base.join(format!("{}-wal", db::DB_FILE))).map(|m| m.len()).unwrap_or(0);

    let index = json!({
        "files": n,
        "corpus_mb": round1(bytes as f64 / 1_048_576.0),
        "fixture_gen_ms": gen_ms,
        "index_first_ms": index_first_ms,
        "reindex_noop_ms": reindex_noop_ms,
        "reindex_100_changed_ms": reindex_100_ms,
        "search_median_ms": round1(median(search_ms.clone())),
        "search_p95_ms": round1(p95(search_ms)),
        "search_narrow_median_ms": round1(median(narrow_ms)),
        "db_mb": round1(db_bytes as f64 / 1_048_576.0),
        "migrate_v4_ms": migrate_v4_ms,
    });
    let bridge = json!({
        "search_docs_median_ms": round1(median(bridge_search.clone())),
        "search_docs_p95_ms": round1(p95(bridge_search)),
        "outline_1mb_median_ms": round1(median(outline_big)),
        "read_section_1mb_median_ms": round1(median(read_big)),
        "read_section_small_median_ms": round1(median(read_small)),
    });
    println!("PERF {}", json!({ "index": index, "bridge": bridge }));
    println!("PERF-QUERIES {}", Value::Object(by_query));

    drop(conn);
    let _ = std::fs::remove_dir_all(&base);

    let mut over = check_budget("index", &index);
    over.extend(check_budget("bridge", &bridge));
    assert!(over.is_empty(), "성능 예산 초과:\n  {}", over.join("\n  "));
}


/// 판올림 리허설 — **실사용 DB 의 사본**에 지금 마이그레이션을 적용해 본다(원본은 절대 넘기지 않는다).
///
/// ```text
/// copy %APPDATA%\com.readme.app\md-reader.db* <임시폴더>\     (앱을 끄고, -wal·-shm 까지)
/// set README_DB_COPY=<임시폴더>\md-reader.db
/// cargo test --release --lib rehearse -- --ignored --nocapture
/// ```
#[test]
#[ignore = "판올림 리허설 — README_DB_COPY 에 실사용 DB 사본 경로"]
fn rehearse_migration_on_a_copy() {
    let Ok(p) = std::env::var("README_DB_COPY") else {
        panic!("README_DB_COPY 가 없다");
    };
    let real = std::env::var("APPDATA").unwrap_or_default();
    assert!(!p.to_lowercase().starts_with(&real.to_lowercase()), "원본 폴더의 DB 는 쓰지 않는다 — 사본을 줄 것");
    let mut c = db::open_at(Path::new(&p)).unwrap();
    let count = |c: &Connection, sql: &str| -> i64 { c.query_row(sql, [], |r| r.get(0)).unwrap() };
    let before_v = count(&c, "PRAGMA user_version");
    let before_idx = count(&c, "SELECT count(*) FROM file_index");
    let before_meta = count(&c, "SELECT count(*) FROM file_meta");
    let before_snap = count(&c, "SELECT count(*) FROM doc_snapshot");
    let t = Instant::now();
    db::migrate_for_test(&mut c).unwrap();
    let took = ms(t);
    let linked = count(&c, "SELECT count(*) FROM file_meta WHERE fts_rowid IS NOT NULL");
    let after_idx = count(&c, "SELECT count(*) FROM file_index");
    println!(
        "REHEARSE v{before_v}→v{} in {took}ms · file_index {before_idx}→{after_idx} · file_meta {before_meta} (linked {linked}) · snapshots {before_snap}→{}",
        count(&c, "PRAGMA user_version"),
        count(&c, "SELECT count(*) FROM doc_snapshot"),
    );
    // 짝 맞춤: 남은 색인 행은 전부 메타의 짝이고, 짝 있는 메타의 rowid 는 실제 행을 가리킨다.
    assert_eq!(after_idx, linked, "남은 색인 행 수 = 짝 있는 메타 수");
    assert_eq!(
        count(&c, "SELECT count(*) FROM file_meta m JOIN file_index f ON f.rowid = m.fts_rowid AND f.real_path = m.real_path"),
        linked,
        "짝의 경로가 일치해야 한다"
    );
    // 기록·받은 문서함·워크스페이스는 손대지 않는다.
    assert_eq!(count(&c, "SELECT count(*) FROM doc_snapshot"), before_snap);
    // v5 표시 펜 — 빈 표가 생기고 외래 키가 걸린다(참조된 판은 정리가 건너뛴다).
    assert_eq!(count(&c, "SELECT count(*) FROM annotation"), 0);
    assert_eq!(count(&c, "SELECT count(*) FROM pragma_foreign_key_list('annotation') WHERE \"table\" = 'doc_snapshot'"), 1);
    // 검색이 여전히 된다(아무 낱말이나 — 흔한 영어 낱말로).
    let m = search::build_match("the").unwrap();
    let hits = search::match_rows(&c, &m, None, 20).unwrap();
    println!("REHEARSE search 'the' → {} hits", hits.len());
}
