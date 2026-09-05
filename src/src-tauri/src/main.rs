// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // MCP 모드는 창을 띄우지 않는다. **`tauri::Builder` 를 세우기 전에** 갈라져야 SQLite
    // 마이그레이션·single-instance 등록 같은 부작용을 하나도 안 탄다 — 에이전트가 붙을 때마다
    // 사용자 앱 상태를 건드리면 안 된다(ADR 0002).
    if md_reader_lib::mcp::is_requested(std::env::args()) {
        std::process::exit(md_reader_lib::mcp::run_stdio());
    }
    md_reader_lib::run()
}
