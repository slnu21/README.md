# README.md v0.6.6

가볍고 100% 오프라인인 마크다운 리더 & 에디터. Windows x64.

v0.6.5 실사용 후속 수정 — 편집기에서 긴 줄을 스크롤할 때 생기던 커서·화면 문제를 바로잡은 패치 릴리스.

## 수정

### 줄바꿈된 줄에서 커서·화면이 어긋나던 문제
- 화면 너비 때문에 **여러 줄로 접힌 행**을 지나 스크롤하면 어느 순간 **커서가 사라지고 편집기가 부분만 그려지던** 문제를 고쳤습니다.
- 그 상태에서 **클릭·위아래 이동·Home/End**가 엉뚱한 줄로 가고, 커서가 놓인 줄과 **왼쪽 줄번호 강조가 세로로 어긋나던** 것도 함께 해결했습니다.
- 마크다운 편집기(CodeMirror)를 최신 패치로 올리고, 글자 크기·줄 높이를 화면 픽셀에 딱 맞게 정렬해 스크롤·커서 동작을 안정화했습니다.

## 배포 산출물
- `README_0.6.6_x64.msix` — **Microsoft Store 업로드용**(미서명, Microsoft 재서명). 실신원(Name=`SlnU.README.md` · Publisher=`CN=1398342C-A2D7-4B4A-BFE2-34D8CCFD7FBA`).
- `README.md_0.6.6_x64-setup.exe` — NSIS 인스톨러.
- `README_0.6.6_x64_portable.zip` — 무설치 포터블(README.exe + USAGE.txt).

## 요구 사항
- Windows 10/11 x64 + WebView2 런타임(Win11 기본 내장).
- 100% 오프라인 · 계정/추적 없음.

라이선스 고지: `THIRD-PARTY-NOTICES.md`.
