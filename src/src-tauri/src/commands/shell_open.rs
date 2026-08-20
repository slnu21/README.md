//! 로컬 파일을 OS 기본 프로그램으로 여는 커맨드 — 미리보기에서 `.pdf`·이미지 링크를 눌렀을 때.
//!
//! **왜 프런트에서 플러그인의 `open_path` 를 직접 부르지 않는가.**
//! 그러려면 capability 에 `opener:allow-open-path` 와 전역 경로 스코프(`{"path":"**"}`)를
//! 열어야 한다. 그 순간 **문서 안 링크 한 번에 디스크의 아무 실행 파일이나 ShellExecute** 된다
//! — 링크 대상은 우리가 만든 것이 아니라 문서 작성자가 쓴 문자열이다. 오프라인 앱이라
//! 내려받기는 못 하지만 이미 디스크에 있는 `.exe`·`.lnk`·`.bat` 은 그대로 실행된다.
//!
//! 그래서 우리 커맨드를 하나 두고 **Rust 쪽에서 확장자를 검사한 뒤** 플러그인의 Rust API 를
//! 부른다(앱 자신의 커맨드는 ACL 대상이 아니므로 capability 변경이 필요 없다).
//! 허용 목록이 백엔드에 있으니 프런트가 뚫려도 실행 파일은 열리지 않는다.
use std::path::Path;
use tauri_plugin_opener::OpenerExt;

/// OS 기본 프로그램으로 넘겨도 되는 확장자 — **허용 목록**이다(모르는 것은 전부 거절).
///
/// 기준은 "그 자체로는 코드를 실행하지 않는 문서·미디어·데이터". 뷰어에 취약점이 있을 수야
/// 있지만 그건 사용자가 탐색기에서 두 번 클릭하는 것과 같은 위험이고, 여기서 막으려는 것은
/// **링크 한 번이 곧 프로그램 실행이 되는 것**이다.
///
/// 일부러 뺀 것:
/// · 실행·스크립트 — exe com bat cmd ps1 psm1 vbs vbe js jse wsf msi msp scr pif cpl reg jar py sh
/// · 간접 실행 — lnk url application appref-ms hta chm hlp msc (겉보기와 실행 대상이 다르다)
/// · html htm — 로컬 HTML 은 브라우저에서 스크립트가 돌고 위장 페이지를 띄우기 좋다.
///   진짜 필요하면 탐색기로 떨어지므로 사용자가 직접 열 수 있다.
const SHELL_SAFE_EXTS: &[&str] = &[
    // 문서·데이터
    "pdf", "txt", "rtf", "csv", "tsv", "log", "json", "yaml", "yml", "toml", "xml", "ini", "doc",
    "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "epub", //
    // 이미지
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "avif", "tif", "tiff", //
    // 소리·영상
    "mp3", "wav", "m4a", "flac", "ogg", "opus", "mp4", "webm", "mov", "mkv", "avi", //
    // 압축(탐색기·압축 프로그램이 연다)
    "zip", "7z", "rar", "tar", "gz",
];

/// 이 파일을 OS 기본 프로그램으로 열어도 되는가. 확장자만 본다(내용 스니핑 없음).
///
/// `Path::extension()` 은 이름의 **마지막** 점 뒤만 돌려주므로 `report.pdf.exe` 는 `exe` 다.
/// 후행 점·공백이 붙은 이름(`a.pdf.`·`a.pdf `)은 확장자가 정확히 일치하지 않아 거절된다 —
/// Windows 가 그것들을 떼고 여는 것을 이용한 우회를 애초에 못 하게 한다.
pub fn is_shell_safe(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .is_some_and(|e| SHELL_SAFE_EXTS.contains(&e.as_str()))
}

/// 미리보기에서 앱이 열 수 없는 로컬 파일 링크를 눌렀을 때 OS 기본 프로그램으로 연다.
///
/// 실패 코드는 프런트가 분기해 지역화 메시지를 낸다(`create_file` 의 `"EEXIST"` 와 같은 방식):
/// · `"ENOENT"`  — 그런 파일이 없다(링크가 깨졌거나 문서가 옮겨졌다)
/// · `"EUNSAFE"` — 자동으로 열지 않는 형식이다. 호출부는 대신 탐색기에서 위치를 연다.
#[tauri::command]
pub fn open_with_default(app: tauri::AppHandle, path: String) -> Result<(), String> {
    if !Path::new(&path).is_file() {
        return Err("ENOENT".to_string());
    }
    // 존재 확인을 먼저 한다 — EUNSAFE 를 받은 프런트는 "그럼 폴더라도 열자"로 넘어가는데,
    // 없는 파일이면 그것도 실패한다. 이 순서면 EUNSAFE 는 곧 "파일은 있다"는 뜻이다.
    if !is_shell_safe(&path) {
        return Err("EUNSAFE".to_string());
    }
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opens_inert_documents_and_media() {
        for p in [
            r"C:\notes\report.pdf",
            "diagram.png",
            "./assets/shot.JPEG",
            "data.csv",
            "clip.mp4",
            "bundle.zip",
        ] {
            assert!(is_shell_safe(p), "{p} 는 열려야 한다");
        }
    }

    #[test]
    fn never_opens_executables_or_scripts() {
        for p in [
            "a.exe", "a.com", "a.bat", "a.cmd", "a.ps1", "a.psm1", "a.vbs", "a.js", "a.wsf",
            "a.msi", "a.scr", "a.jar", "a.py", "a.sh", "a.reg",
        ] {
            assert!(!is_shell_safe(p), "{p} 는 절대 열려선 안 된다");
        }
    }

    #[test]
    fn never_opens_indirect_launchers() {
        // 겉보기 이름과 실제 실행 대상이 다른 것들 — 링크 텍스트로 위장하기 가장 쉽다.
        for p in ["a.lnk", "a.url", "a.hta", "a.chm", "a.msc", "a.appref-ms"] {
            assert!(!is_shell_safe(p), "{p} 는 절대 열려선 안 된다");
        }
    }

    #[test]
    fn local_html_falls_back_to_the_explorer() {
        // 스크립트가 도는 표면이고 위장 페이지를 띄우기 좋다 — 자동으로 열지 않는다.
        assert!(!is_shell_safe("page.html"));
        assert!(!is_shell_safe("page.htm"));
    }

    #[test]
    fn only_the_last_extension_counts() {
        assert!(!is_shell_safe("report.pdf.exe"));
        assert!(is_shell_safe("report.exe.pdf"));
    }

    #[test]
    fn trailing_dot_or_space_is_rejected() {
        // Windows 는 후행 점·공백을 떼고 연다. 우리는 정확히 일치할 때만 통과시켜
        // 그 규칙을 이용한 우회를 막는다.
        assert!(!is_shell_safe("safe.pdf."));
        assert!(!is_shell_safe("safe.pdf "));
    }

    #[test]
    fn alternate_data_stream_is_rejected() {
        assert!(!is_shell_safe("a.pdf::$DATA"));
        assert!(!is_shell_safe(r"C:\x\a.pdf:evil.exe"));
    }

    #[test]
    fn no_extension_is_rejected() {
        assert!(!is_shell_safe("README"));
        assert!(!is_shell_safe(""));
        assert!(!is_shell_safe(r"C:\folder\"));
    }
}
