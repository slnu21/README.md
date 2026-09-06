//! 설정의 [에이전트 연결] 패널이 쓰는 정보.
//!
//! 패널이 존재하는 이유는 두 가지다 — 브리지는 눈에 안 보이므로 **있다는 사실을 알려야 하고**,
//! 원격 제어는 사용자가 **상태를 보고 끌 수 있어야** 한다(ADR 0002).

use serde::Serialize;
use std::path::PathBuf;

/// MSIX App Execution Alias 이름. 매니페스트(`packaging/msix/AppxManifest.template.xml`)와
/// 같아야 한다 — 여기만 바꾸면 패널이 없는 별칭을 안내한다.
pub const ALIAS_NAME: &str = "readme-md.exe";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInfo {
    /// 지금 돌고 있는 실행 파일. 별칭이 없을 때 MCP 설정에 적을 절대 경로다.
    exe_path: String,
    /// 별칭이 실제로 깔렸으면 그 경로. **없을 수 있다** — Store 설치본이 아니거나,
    /// 사용자가 설정 > 앱 > 고급 앱 설정 > 앱 실행 별칭에서 꺼 뒀거나.
    alias_path: Option<String>,
    alias_name: String,
}

/// `%LOCALAPPDATA%\Microsoft\WindowsApps\<alias>` — 별칭은 여기 0바이트 재분석 지점으로 깔린다.
fn alias_candidate() -> Option<PathBuf> {
    let local = std::env::var_os("LOCALAPPDATA")?;
    Some(
        PathBuf::from(local)
            .join("Microsoft")
            .join("WindowsApps")
            .join(ALIAS_NAME),
    )
}

#[tauri::command]
pub fn agent_info() -> Result<AgentInfo, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let alias = alias_candidate().filter(|p| p.exists());
    Ok(AgentInfo {
        exe_path: exe.to_string_lossy().into_owned(),
        alias_path: alias.map(|p| p.to_string_lossy().into_owned()),
        alias_name: ALIAS_NAME.to_string(),
    })
}
