//! 앱 데이터 폴더의 **물리 경로**를 정한다.
//!
//! MSIX 패키지본에서 Windows 는 `%APPDATA%` 쓰기를 패키지 컨테이너로 돌린다(copy-on-write).
//! 그러면 `app_data_dir()` 이 주는 `%APPDATA%\com.readme.app` 은 **앱에게만 유효한 가상
//! 경로**가 되고, 탐색기(컨테이너 밖)는 그 경로를 못 찾는다. v0.8.0 사용자 신고의 정체가
//! 이것이다 — [테마 폴더 열기] 는 "폴더가 없다"고 하는데, 앱 안에서 도는 저장 대화상자로
//! 같은 경로에 들어가면 폴더가 **보인다**(대화상자는 컨테이너 병합 뷰를 본다).
//!
//! **두 머신이 다르게 동작하는 것이 이 결함을 두 릴리스 동안 숨겼다.**
//!   · 개발기 — NSIS/dev 설치가 실제 폴더를 먼저 만들어 둬서 쓰기가 그리로 통과한다.
//!   · Store 전용 머신 — 실제 폴더가 없어 폴더 **생성 자체**가 컨테이너로 돌려진다.
//!
//! 그래서 "패키지본이면 무조건 컨테이너"도 "언제나 `%APPDATA%`"도 둘 다 틀리다.
//! **만들어 보고 어디에 생겼는지 본다** — 이미 하고 있는 `create_dir_all` 이 곧 probe 다.
//! 따로 probe 파일을 쓰지 않는다(사용자 폴더에 쓰레기를 남기지 않는다).
//!
//! **파일을 옮기지 않는다.** 가상 경로가 가리키는 물리 파일이 곧 컨테이너 안의 그 파일이다.
//! 여기서 하는 일은 같은 파일을 **탐색기도 해석할 수 있는 이름으로 부르는 것**뿐이다.
//!
//! 매니페스트의 `desktop6:FileSystemWriteVirtualization` 로 가상화를 끄는 길도 있으나
//! 채택하지 않았다 — 이미 컨테이너에 데이터(워크스페이스 DB 포함)가 쌓인 사용자가
//! 그것을 통째로 잃은 것처럼 보게 된다. 이관 없이는 못 한다.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::Manager;

/// 물리 앱 데이터 폴더. 프로세스당 1회 계산한다(패키지 신원은 실행 중에 바뀌지 않는다).
pub fn user_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    static CACHE: OnceLock<PathBuf> = OnceLock::new();
    if let Some(p) = CACHE.get() {
        return Ok(p.clone());
    }
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    // 이 생성이 곧 probe 다 — 가상화가 걸려 있으면 컨테이너 쪽에 생긴다.
    std::fs::create_dir_all(&base).map_err(|e| e.to_string())?;

    let container = container_candidate(&app.config().identifier);
    let resolved = resolve_dir(base, container, |p| p.is_dir());
    Ok(CACHE.get_or_init(|| resolved).clone())
}

/// `%LOCALAPPDATA%\Packages\<PFN>\LocalCache\Roaming\<identifier>`.
/// 패키지본이 아니거나 `%LOCALAPPDATA%` 를 못 읽으면 None.
fn container_candidate(identifier: &str) -> Option<PathBuf> {
    let family = package_family_name()?;
    let local = std::env::var_os("LOCALAPPDATA")?;
    Some(container_dir(Path::new(&local), &family, identifier))
}

/// 후보 경로 조립. 순수 함수 — 테스트가 파일시스템 없이 모양을 확인한다.
fn container_dir(local_app_data: &Path, family: &str, identifier: &str) -> PathBuf {
    local_app_data
        .join("Packages")
        .join(family)
        .join("LocalCache")
        .join("Roaming")
        .join(identifier)
}

/// 물리 경로 결정. `exists` 를 주입받아 임시 폴더로 두 머신을 다 재현할 수 있다.
///
/// 후보가 **디렉터리로 존재할 때만** 채택한다 — 존재한다는 것은 위의 `create_dir_all`
/// (또는 지난 실행의 쓰기)이 그리로 돌려졌다는 뜻이고, 그때만 `base` 가 가상 경로다.
fn resolve_dir(base: PathBuf, container: Option<PathBuf>, exists: impl Fn(&Path) -> bool) -> PathBuf {
    match container {
        Some(c) if exists(&c) => c,
        _ => base,
    }
}

/// 이 프로세스의 패키지 패밀리 이름. 패키지본이 아니면 None.
///
/// `windows-sys` 를 직접 의존으로 올리지 않는다 — 새 의존성은 확인 게이트 대상인데
/// 필요한 것은 함수 하나뿐이다. kernel32 는 Tauri 가 이미 링크한다.
#[cfg(windows)]
fn package_family_name() -> Option<String> {
    /// 이 프로세스에 패키지 신원이 없다(= 비패키지본). winerror.h APPMODEL_ERROR_NO_PACKAGE.
    const APPMODEL_ERROR_NO_PACKAGE: u32 = 15700;
    const ERROR_SUCCESS: u32 = 0;
    const ERROR_INSUFFICIENT_BUFFER: u32 = 122;

    #[link(name = "kernel32")]
    extern "system" {
        /// `len` 은 **문자 수**(널 종료 포함)로 들어가고 나온다.
        fn GetCurrentPackageFamilyName(len: *mut u32, name: *mut u16) -> u32;
    }

    let mut len: u32 = 0;
    // 1회차: 길이만 묻는다. 비패키지본이면 여기서 NO_PACKAGE 로 끝난다.
    let rc = unsafe { GetCurrentPackageFamilyName(&mut len, std::ptr::null_mut()) };
    if rc == APPMODEL_ERROR_NO_PACKAGE || rc != ERROR_INSUFFICIENT_BUFFER || len == 0 {
        return None;
    }
    let mut buf: Vec<u16> = vec![0; len as usize];
    let rc = unsafe { GetCurrentPackageFamilyName(&mut len, buf.as_mut_ptr()) };
    if rc != ERROR_SUCCESS {
        return None;
    }
    // len 은 널 종료를 포함한다 — 문자열로 옮기기 전에 떼어 낸다.
    let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    Some(String::from_utf16_lossy(&buf[..end]))
}

#[cfg(not(windows))]
fn package_family_name() -> Option<String> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn container_path_is_localappdata_packages_localcache_roaming() {
        let p = container_dir(
            Path::new(r"C:\Users\u\AppData\Local"),
            "SlnU.README.md_fqpsajc525k1c",
            "com.readme.app",
        );
        assert_eq!(
            p,
            PathBuf::from(
                r"C:\Users\u\AppData\Local\Packages\SlnU.README.md_fqpsajc525k1c\LocalCache\Roaming\com.readme.app"
            )
        );
    }

    #[test]
    fn unpackaged_keeps_appdata() {
        // 비패키지본 — 후보가 아예 없다.
        let base = PathBuf::from(r"C:\Users\u\AppData\Roaming\com.readme.app");
        assert_eq!(resolve_dir(base.clone(), None, |_| true), base);
    }

    #[test]
    fn dev_machine_keeps_appdata_when_container_absent() {
        // 머신 A — 패키지본이지만 실제 폴더가 먼저 있어 쓰기가 통과한다.
        let base = PathBuf::from(r"C:\Users\u\AppData\Roaming\com.readme.app");
        let cand = PathBuf::from(r"C:\Users\u\AppData\Local\Packages\X\LocalCache\Roaming\com.readme.app");
        assert_eq!(resolve_dir(base.clone(), Some(cand), |_| false), base);
    }

    #[test]
    fn store_only_machine_takes_container() {
        // 머신 B — 폴더 생성이 컨테이너로 돌려졌다.
        let base = PathBuf::from(r"C:\Users\u\AppData\Roaming\com.readme.app");
        let cand = PathBuf::from(r"C:\Users\u\AppData\Local\Packages\X\LocalCache\Roaming\com.readme.app");
        assert_eq!(resolve_dir(base, Some(cand.clone()), |_| true), cand);
    }

    #[test]
    fn container_must_be_a_directory_not_a_file() {
        // 같은 이름의 **파일**이 있어도 채택하지 않는다(exists 가 아니라 is_dir 로 묻는 이유).
        let base = PathBuf::from(r"C:\base");
        let cand = PathBuf::from(r"C:\cand");
        let seen = std::cell::RefCell::new(Vec::new());
        let out = resolve_dir(base.clone(), Some(cand.clone()), |p| {
            seen.borrow_mut().push(p.to_path_buf());
            false // is_dir == false (파일이거나 없음)
        });
        assert_eq!(out, base);
        assert_eq!(seen.into_inner(), vec![cand]);
    }
}
