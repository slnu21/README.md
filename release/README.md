# release

버전별 **배포 산출물**을 보관한다(빌드 결과물 중 실제 배포할 항목만 큐레이션).

## 버전 규칙
- [Semantic Versioning](https://semver.org/lang/ko/): `MAJOR.MINOR.PATCH`.
- 폴더명: `vX.Y.Z` (예: `v0.1.0`).

## 폴더 구성(버전당)
```
release/vX.Y.Z/
├─ README_X.Y.Z_x64.msix          # Store 제출용 MSIX (무서명 업로드 → MS 재서명)
├─ README.md_X.Y.Z_x64-setup.exe  # (선택) Win32 직접 배포용 NSIS 설치 관리자 (서명 필요)
├─ README_X.Y.Z_x64_portable.zip  # (선택) 무설치 포터블
├─ THIRD-PARTY-NOTICES.md         # 해당 빌드의 라이선스 고지 스냅샷
└─ RELEASE_NOTES.md               # 해당 버전 릴리스 노트
```

> 산출물 파일 base 는 `README_*` 다(제품 표시명이 `README.md` 라, 파일명에서는 확장자
> 혼동을 피해 `.md` 를 뺀다). NSIS 만 Tauri 가 표시명 그대로 `README.md_*` 로 낸다.
> **바이너리 셋은 gitignore** 대상이라 저장소에는 텍스트 둘만 남는다.

## 빌드 → 배포 절차 (권장: MSIX → Store)
1. `cd src && npm run tauri build` (Rust 필요) → `src/src-tauri/target/release/bundle/`에서 산출물 확인. *이 경로는 git 추적 제외.*
2. 산출물을 **MSIX로 래핑**(MSIX Packaging Tool 또는 `makeappx`, 매니페스트=Partner Center ID + `runFullTrust`). → [docs/deployment/microsoft-store.md](../docs/deployment/microsoft-store.md)
3. MSIX(무서명) + 고지 + 릴리스 노트를 `release/vX.Y.Z/`로 복사.
4. Partner Center 업로드 → 인증 → **Microsoft 재서명** → 게시.

> 비-Store 직접 배포(Win32 EXE)를 겸할 경우에만 **코드 서명**이 필요하다. → [docs/deployment/code-signing.md](../docs/deployment/code-signing.md)

> 대용량 바이너리를 git에 직접 커밋할지, Git LFS/외부 릴리스로 관리할지는 추후 결정.
