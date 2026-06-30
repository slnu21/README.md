# 제3자 라이선스 고지

이 파일은 **자동 생성** 대상이다(현재는 자리표시자).

소프트웨어는 다수의 오픈소스 구성요소(전부 permissive — MIT/Apache-2.0/BSD/ISC 등)를 포함한다.
릴리스 빌드 시 아래 도구로 의존성 목록과 라이선스 전문을 생성해 이 파일을 갱신하고 배포물에 동봉한다.

- 프론트엔드(npm): `license-checker` (또는 `license-checker-rseidelsohn`)
- Rust(cargo): `cargo-about` / `cargo-deny`

허용 라이선스 화이트리스트(예): `MIT; Apache-2.0; BSD-2-Clause; BSD-3-Clause; ISC; Zlib; 0BSD`.
GPL/AGPL/LGPL/SSPL/비상업 CC 등은 금지(CI에서 차단). 자세한 정책: [docs/design/decisions/0001-tech-stack-and-packaging.md](docs/design/decisions/0001-tech-stack-and-packaging.md).
