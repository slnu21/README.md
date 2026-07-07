# README.md v0.6.1

가볍고 100% 오프라인인 마크다운 리더 & 에디터. Windows x64.

v0.6.0 이후 실사용에서 발견된 3건을 수정한 패치 릴리스.

## 수정 · 개선

### 다이어그램(Mermaid) 렌더 안정화
- `flowchart`·`erDiagram`·`classDiagram`·`stateDiagram`·`quadrantChart` 등이 릴리스 빌드에서 **아예 안 나오던** 문제 수정 — 소스의 `-->`·`->>`·`<|--`(`<`/`>` 포함) 때문에 정화 과정(DOMPurify mXSS 방지)에서 다이어그램 소스가 통째로 제거되던 것을 **base64 전달**로 회피.
- 순서도·마인드맵·클래스·상태·ER 속성 등에서 **노드 라벨 글자가 비던** 문제 수정 — `foreignObject`를 HTML 통합지점으로 등록해 라벨 보존.
- 렌더 실패 시 빈 블록 대신 **실제 오류 메시지 표시**.

### 파일 연결 실행 개선
- `.md`/`.markdown` 더블클릭 시 앱이 안 뜬 것처럼 보이던 문제 수정 — 이미 실행 중이면 **창을 복원·표시·포커스**해 확실히 앞으로 띄우고 해당 파일을 엽니다(콜드/웜 스타트 모두).

### 워크스페이스 정리
- 가져온 폴더 안 **파일을 가상 폴더로 드래그**해 정리(참조로 편입, 디스크 원본 미변경), 가상 폴더 드롭 영역 확대로 잘 잡히게 개선.
- **가져온 폴더**는 하위가 통째로 묶인 단위임을 좌측 레일 + "가져옴" 배지로 시각화.

## 배포 산출물
- `README_0.6.1_x64.msix` — **Microsoft Store 업로드용**(미서명, Microsoft 재서명). 실신원(Name=`SlnU.README.md` · Publisher=`CN=1398342C-A2D7-4B4A-BFE2-34D8CCFD7FBA`).
- `README.md_0.6.1_x64-setup.exe` — NSIS 인스톨러.
- `README_0.6.1_x64_portable.zip` — 무설치 포터블(README.exe + USAGE.txt).

## 요구 사항
- Windows 10/11 x64 + WebView2 런타임(Win11 기본 내장).
- 100% 오프라인 · 계정/추적 없음.

라이선스 고지: `THIRD-PARTY-NOTICES.md`.
