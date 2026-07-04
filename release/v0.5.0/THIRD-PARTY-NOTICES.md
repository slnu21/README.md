# THIRD-PARTY-NOTICES

**README.md**(제품, Windows x64)는 아래 오픈소스 구성요소를 포함하며 전부 permissive 라이선스입니다.
소프트웨어 목록은 자동 생성 — npm production deps(license-checker) + cargo 의존 크레이트(`cargo metadata --filter-platform x86_64-pc-windows-msvc`). 번들 폰트(OFL)는 라이선스 전문 포함이 필요해 별도 섹션에 수기 관리. 의존성 변경 시 재생성.

**사용 라이선스:** (MIT OR Apache-2.0) AND Unicode-3.0, (MPL-2.0 OR Apache-2.0), 0BSD OR MIT OR Apache-2.0, Apache-2.0, Apache-2.0 / MIT, Apache-2.0 AND MIT, Apache-2.0 OR MIT, BSD-2-Clause, BSD-2-Clause OR Apache-2.0 OR MIT, BSD-3-Clause, BSD-3-Clause AND MIT, BSD-3-Clause/MIT, CC0-1.0, CC0-1.0 OR MIT-0 OR Apache-2.0, ISC, MIT, MIT OR Apache-2.0, MIT OR Apache-2.0 OR Zlib, MIT OR Zlib OR Apache-2.0, MIT*, MIT/Apache-2.0, MPL-2.0, OFL-1.1, Python-2.0, Unicode-3.0, Unlicense, Unlicense OR MIT, Unlicense/MIT, Zlib, Zlib OR Apache-2.0 OR MIT

> 참고: 일부 구성요소는 다중 라이선스(예: `MIT OR Apache-2.0`)이며 permissive 옵션을 선택. `MPL-2.0`는 파일 단위 약카피레프트로 번들 배포 허용. `OFL-1.1`(SIL Open Font License)은 폰트 파일에 적용되며 소프트웨어와 함께 번들·재배포 허용(폰트 단독 판매만 금지) — 저작권 문구·라이선스 전문은 아래 「번들 폰트」 섹션 참고. SQLite는 퍼블릭 도메인.

## 번들 폰트 (SIL Open Font License 1.1)

앱에는 아래 폰트의 **파일(.woff2)이 실제로 번들·재배포**됩니다(`@fontsource/*` 패키지의 `?url` 자산으로 앱 오리진에 포함). OFL-1.1은 사본마다 저작권 문구와 라이선스 전문을 포함하도록 요구하므로 여기에 명시합니다. 라이선스 전문은 4종 모두 동일한 OFL 1.1이라 하단에 한 번만 수록합니다.

- **Lora** — `@fontsource/lora@5.2.8`
  Copyright 2011 The Lora Project Authors (https://github.com/cyrealtype/Lora-Cyrillic), with Reserved Font Name "Lora".
- **JetBrains Mono** — `@fontsource/jetbrains-mono@5.2.8`
  Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono).
- **Nanum Myeongjo / 나눔명조** — `@fontsource/nanum-myeongjo@5.2.11`
  Copyright © 2010 NHN Corporation. All rights reserved. Font designed by FONTRIX.
- **Pretendard** — `@fontsource/pretendard@5.2.5`
  Copyright (c) 2021, Kil Hyung-jin (https://github.com/orioncactus/pretendard), with Reserved Font Name 'Pretendard'.
  Copyright 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'. Source is a trademark of Adobe in the United States and/or other countries.
  Copyright (c) 2016 The Inter Project Authors (https://github.com/rsms/inter), with Reserved Font Name 'Inter'.
  Copyright 2021 The M+ FONTS Project Authors (https://github.com/coz-m/MPLUS_FONTS), with Reserved Font Name 'M PLUS 1'.

<details>
<summary><strong>SIL OPEN FONT LICENSE Version 1.1 — 26 February 2007</strong> (전문)</summary>

```
This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
https://scripts.sil.org/OFL

-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

</details>

## Frontend (npm, production — 174)

- `@antfu/install-pkg@1.1.0` — MIT
- `@babel/runtime@7.29.7` — MIT
- `@braintree/sanitize-url@7.1.2` — MIT
- `@chevrotain/types@11.1.2` — Apache-2.0
- `@codemirror/autocomplete@6.20.3` — MIT
- `@codemirror/commands@6.10.4` — MIT
- `@codemirror/lang-css@6.3.1` — MIT
- `@codemirror/lang-html@6.4.11` — MIT
- `@codemirror/lang-javascript@6.2.5` — MIT
- `@codemirror/lang-markdown@6.5.0` — MIT
- `@codemirror/language@6.12.4` — MIT
- `@codemirror/lint@6.9.7` — MIT
- `@codemirror/search@6.7.1` — MIT
- `@codemirror/state@6.7.0` — MIT
- `@codemirror/view@6.43.4` — MIT
- `@iconify/types@2.0.0` — MIT
- `@iconify/utils@3.1.3` — MIT
- `@lezer/common@1.5.2` — MIT
- `@lezer/css@1.3.4` — MIT
- `@lezer/highlight@1.2.3` — MIT
- `@lezer/html@1.3.13` — MIT
- `@lezer/javascript@1.5.4` — MIT
- `@lezer/lr@1.4.10` — MIT
- `@lezer/markdown@1.6.4` — MIT
- `@marijn/find-cluster-break@1.0.3` — MIT
- `@mermaid-js/parser@1.2.0` — MIT
- `@tauri-apps/api@2.11.1` — Apache-2.0 OR MIT
- `@tauri-apps/plugin-dialog@2.7.1` — MIT OR Apache-2.0
- `@tauri-apps/plugin-opener@2.5.4` — MIT OR Apache-2.0
- `@types/d3@7.4.3` — MIT
- `@types/d3-array@3.2.2` — MIT
- `@types/d3-axis@3.0.6` — MIT
- `@types/d3-brush@3.0.6` — MIT
- `@types/d3-chord@3.0.6` — MIT
- `@types/d3-color@3.1.3` — MIT
- `@types/d3-contour@3.0.6` — MIT
- `@types/d3-delaunay@6.0.4` — MIT
- `@types/d3-dispatch@3.0.7` — MIT
- `@types/d3-drag@3.0.7` — MIT
- `@types/d3-dsv@3.0.7` — MIT
- `@types/d3-ease@3.0.2` — MIT
- `@types/d3-fetch@3.0.7` — MIT
- `@types/d3-force@3.0.10` — MIT
- `@types/d3-format@3.0.4` — MIT
- `@types/d3-geo@3.1.0` — MIT
- `@types/d3-hierarchy@3.1.7` — MIT
- `@types/d3-interpolate@3.0.4` — MIT
- `@types/d3-path@3.1.1` — MIT
- `@types/d3-polygon@3.0.2` — MIT
- `@types/d3-quadtree@3.0.6` — MIT
- `@types/d3-random@3.0.3` — MIT
- `@types/d3-scale@4.0.9` — MIT
- `@types/d3-scale-chromatic@3.1.0` — MIT
- `@types/d3-selection@3.0.11` — MIT
- `@types/d3-shape@3.1.8` — MIT
- `@types/d3-time@3.0.4` — MIT
- `@types/d3-time-format@4.0.3` — MIT
- `@types/d3-timer@3.0.2` — MIT
- `@types/d3-transition@3.0.9` — MIT
- `@types/d3-zoom@3.0.8` — MIT
- `@types/geojson@7946.0.16` — MIT
- `@types/linkify-it@5.0.0` — MIT
- `@types/markdown-it@14.1.2` — MIT
- `@types/mdurl@2.0.0` — MIT
- `@types/react@19.2.17` — MIT
- `@types/trusted-types@2.0.7` — MIT
- `@upsetjs/venn.js@2.0.0` — MIT
- `argparse@2.0.1` — Python-2.0
- `commander@7.2.0` — MIT
- `commander@8.3.0` — MIT
- `cose-base@1.0.3` — MIT
- `cose-base@2.2.0` — MIT
- `crelt@1.0.7` — MIT
- `csstype@3.2.3` — MIT
- `cytoscape@3.34.0` — MIT
- `cytoscape-cose-bilkent@4.1.0` — MIT
- `cytoscape-fcose@2.2.0` — MIT
- `d3@7.9.0` — ISC
- `d3-array@2.12.1` — BSD-3-Clause
- `d3-array@3.2.4` — ISC
- `d3-axis@3.0.0` — ISC
- `d3-brush@3.0.0` — ISC
- `d3-chord@3.0.1` — ISC
- `d3-color@3.1.0` — ISC
- `d3-contour@4.0.2` — ISC
- `d3-delaunay@6.0.4` — ISC
- `d3-dispatch@3.0.1` — ISC
- `d3-drag@3.0.0` — ISC
- `d3-dsv@3.0.1` — ISC
- `d3-ease@3.0.1` — BSD-3-Clause
- `d3-fetch@3.0.1` — ISC
- `d3-force@3.0.0` — ISC
- `d3-format@3.1.2` — ISC
- `d3-geo@3.1.1` — ISC
- `d3-hierarchy@3.1.2` — ISC
- `d3-interpolate@3.0.1` — ISC
- `d3-path@1.0.9` — BSD-3-Clause
- `d3-path@3.1.0` — ISC
- `d3-polygon@3.0.1` — ISC
- `d3-quadtree@3.0.1` — ISC
- `d3-random@3.0.1` — ISC
- `d3-sankey@0.12.3` — BSD-3-Clause
- `d3-scale@4.0.2` — ISC
- `d3-scale-chromatic@3.1.0` — ISC
- `d3-selection@3.0.0` — ISC
- `d3-shape@1.3.7` — BSD-3-Clause
- `d3-shape@3.2.0` — ISC
- `d3-time@3.1.0` — ISC
- `d3-time-format@4.1.0` — ISC
- `d3-timer@3.0.1` — ISC
- `d3-transition@3.0.1` — ISC
- `d3-zoom@3.0.0` — ISC
- `dagre-d3-es@7.0.14` — MIT
- `dayjs@1.11.21` — MIT
- `delaunator@5.1.0` — ISC
- `dompurify@3.4.11` — (MPL-2.0 OR Apache-2.0)
- `entities@4.5.0` — BSD-2-Clause
- `es-toolkit@1.49.0` — MIT
- `hachure-fill@0.5.2` — MIT
- `highlight.js@11.11.1` — BSD-3-Clause
- `html-parse-stringify@3.0.1` — MIT
- `i18next@26.3.4` — MIT
- `iconv-lite@0.6.3` — MIT
- `import-meta-resolve@4.2.0` — MIT
- `internmap@1.0.1` — ISC
- `internmap@2.0.3` — ISC
- `katex@0.16.47` — MIT
- `katex@0.17.0` — MIT
- `khroma@2.1.0` — MIT*
- `layout-base@1.0.2` — MIT
- `layout-base@2.0.1` — MIT
- `linkify-it@5.0.1` — MIT
- `lodash-es@4.18.1` — MIT
- `markdown-it@14.2.0` — MIT
- `markdown-it-abbr@2.0.0` — MIT
- `markdown-it-anchor@9.2.0` — Unlicense
- `markdown-it-container@4.0.0` — MIT
- `markdown-it-deflist@3.0.1` — MIT
- `markdown-it-footnote@4.0.0` — MIT
- `markdown-it-front-matter@0.2.4` — MIT
- `markdown-it-ins@4.0.0` — MIT
- `markdown-it-mark@4.0.0` — MIT
- `markdown-it-multimd-table@4.2.3` — MIT
- `markdown-it-sub@2.0.0` — MIT
- `markdown-it-sup@2.0.0` — MIT
- `markdown-it-task-lists@2.1.1` — ISC
- `markdown-it-texmath@1.0.0` — MIT
- `marked@16.4.2` — MIT
- `mdurl@2.0.0` — MIT
- `mermaid@11.16.0` — MIT
- `package-manager-detector@1.7.0` — MIT
- `path-data-parser@0.1.0` — MIT
- `points-on-curve@0.2.0` — MIT
- `points-on-path@0.2.1` — MIT
- `punycode.js@2.3.1` — MIT
- `react@19.2.7` — MIT
- `react-dom@19.2.7` — MIT
- `react-i18next@17.0.8` — MIT
- `robust-predicates@3.0.3` — Unlicense
- `roughjs@4.6.6` — MIT
- `rw@1.3.3` — BSD-3-Clause
- `safer-buffer@2.1.2` — MIT
- `scheduler@0.27.0` — MIT
- `style-mod@4.1.3` — MIT
- `stylis@4.4.0` — MIT
- `tinyexec@1.2.4` — MIT
- `ts-dedent@2.3.0` — MIT
- `typescript@5.8.3` — Apache-2.0
- `uc.micro@2.1.0` — MIT
- `use-sync-external-store@1.6.0` — MIT
- `uuid@14.0.1` — MIT
- `void-elements@3.1.0` — MIT
- `w3c-keyname@2.2.8` — MIT
- `zustand@5.0.14` — MIT

## Rust shell (cargo, x86_64-pc-windows-msvc — 276)

- `adler2@2.0.1` — 0BSD OR MIT OR Apache-2.0
- `ahash@0.8.12` — MIT OR Apache-2.0
- `aho-corasick@1.1.4` — Unlicense OR MIT
- `alloc-no-stdlib@2.0.4` — BSD-3-Clause
- `alloc-stdlib@0.2.4` — BSD-3-Clause
- `anyhow@1.0.103` — MIT OR Apache-2.0
- `autocfg@1.5.1` — Apache-2.0 OR MIT
- `base64@0.22.1` — MIT OR Apache-2.0
- `bitflags@1.3.2` — MIT/Apache-2.0
- `bitflags@2.13.0` — MIT OR Apache-2.0
- `bit-set@0.8.0` — Apache-2.0 OR MIT
- `bit-vec@0.8.0` — Apache-2.0 OR MIT
- `block-buffer@0.10.4` — MIT OR Apache-2.0
- `brotli@8.0.4` — BSD-3-Clause AND MIT
- `brotli-decompressor@5.0.3` — BSD-3-Clause/MIT
- `bs58@0.5.1` — MIT/Apache-2.0
- `byteorder@1.5.0` — Unlicense OR MIT
- `bytes@1.12.0` — MIT
- `camino@1.2.4` — MIT OR Apache-2.0
- `cargo_metadata@0.19.2` — MIT
- `cargo_toml@0.22.3` — Apache-2.0 OR MIT
- `cargo-platform@0.1.9` — MIT OR Apache-2.0
- `cc@1.2.65` — MIT OR Apache-2.0
- `cfb@0.7.3` — MIT
- `cfg-if@1.0.4` — MIT OR Apache-2.0
- `chrono@0.4.45` — MIT OR Apache-2.0
- `cookie@0.18.1` — MIT OR Apache-2.0
- `cpufeatures@0.2.17` — MIT OR Apache-2.0
- `crc32fast@1.5.0` — MIT OR Apache-2.0
- `crossbeam-channel@0.5.15` — MIT OR Apache-2.0
- `crossbeam-utils@0.8.21` — MIT OR Apache-2.0
- `crypto-common@0.1.7` — MIT OR Apache-2.0
- `cssparser@0.36.0` — MPL-2.0
- `cssparser-macros@0.6.1` — MPL-2.0
- `ctor@0.8.0` — Apache-2.0 OR MIT
- `ctor-proc-macro@0.0.7` — Apache-2.0 OR MIT
- `darling@0.23.0` — MIT
- `darling_core@0.23.0` — MIT
- `darling_macro@0.23.0` — MIT
- `deranged@0.5.8` — MIT OR Apache-2.0
- `derive_more@2.1.1` — MIT
- `derive_more-impl@2.1.1` — MIT
- `digest@0.10.7` — MIT OR Apache-2.0
- `dirs@6.0.0` — MIT OR Apache-2.0
- `dirs-sys@0.5.0` — MIT OR Apache-2.0
- `displaydoc@0.2.6` — MIT OR Apache-2.0
- `dom_query@0.27.0` — MIT
- `dpi@0.1.2` — Apache-2.0 AND MIT
- `dtoa@1.0.11` — MIT OR Apache-2.0
- `dtoa-short@0.3.5` — MPL-2.0
- `dtor@0.3.0` — Apache-2.0 OR MIT
- `dtor-proc-macro@0.0.6` — Apache-2.0 OR MIT
- `dunce@1.0.5` — CC0-1.0 OR MIT-0 OR Apache-2.0
- `dyn-clone@1.0.20` — MIT OR Apache-2.0
- `embed-resource@3.0.9` — MIT
- `equivalent@1.0.2` — Apache-2.0 OR MIT
- `erased-serde@0.4.10` — MIT OR Apache-2.0
- `fallible-iterator@0.3.0` — MIT/Apache-2.0
- `fallible-streaming-iterator@0.1.9` — MIT/Apache-2.0
- `fastrand@2.4.1` — Apache-2.0 OR MIT
- `fdeflate@0.3.7` — MIT OR Apache-2.0
- `filetime@0.2.29` — MIT/Apache-2.0
- `find-msvc-tools@0.1.9` — MIT OR Apache-2.0
- `flate2@1.1.9` — MIT OR Apache-2.0
- `fnv@1.0.7` — Apache-2.0 / MIT
- `foldhash@0.2.0` — Zlib
- `form_urlencoded@1.2.2` — MIT OR Apache-2.0
- `generic-array@0.14.7` — MIT
- `getrandom@0.3.4` — MIT OR Apache-2.0
- `getrandom@0.4.3` — MIT OR Apache-2.0
- `glob@0.3.3` — MIT OR Apache-2.0
- `hashbrown@0.12.3` — MIT OR Apache-2.0
- `hashbrown@0.14.5` — MIT OR Apache-2.0
- `hashbrown@0.17.1` — MIT OR Apache-2.0
- `hashlink@0.9.1` — MIT OR Apache-2.0
- `heck@0.5.0` — MIT OR Apache-2.0
- `hex@0.4.3` — MIT OR Apache-2.0
- `html5ever@0.38.0` — MIT OR Apache-2.0
- `http@1.4.2` — MIT OR Apache-2.0
- `http-range@0.1.5` — MIT
- `ico@0.5.0` — MIT
- `icu_collections@2.2.0` — Unicode-3.0
- `icu_locale_core@2.2.0` — Unicode-3.0
- `icu_normalizer@2.2.0` — Unicode-3.0
- `icu_normalizer_data@2.2.0` — Unicode-3.0
- `icu_properties@2.2.0` — Unicode-3.0
- `icu_properties_data@2.2.0` — Unicode-3.0
- `icu_provider@2.2.0` — Unicode-3.0
- `ident_case@1.0.1` — MIT/Apache-2.0
- `idna@1.1.0` — MIT OR Apache-2.0
- `idna_adapter@1.2.2` — Apache-2.0 OR MIT
- `indexmap@1.9.3` — Apache-2.0 OR MIT
- `indexmap@2.14.0` — Apache-2.0 OR MIT
- `infer@0.19.0` — MIT
- `itoa@1.0.18` — MIT OR Apache-2.0
- `json-patch@3.0.1` — MIT/Apache-2.0
- `jsonptr@0.6.3` — MIT OR Apache-2.0
- `keyboard-types@0.7.0` — MIT OR Apache-2.0
- `libc@0.2.186` — MIT OR Apache-2.0
- `libsqlite3-sys@0.30.1` — MIT
- `litemap@0.8.2` — Unicode-3.0
- `lock_api@0.4.14` — MIT OR Apache-2.0
- `log@0.4.33` — MIT OR Apache-2.0
- `markup5ever@0.38.0` — MIT OR Apache-2.0
- `memchr@2.8.2` — Unlicense OR MIT
- `mime@0.3.17` — MIT OR Apache-2.0
- `miniz_oxide@0.8.9` — MIT OR Zlib OR Apache-2.0
- `mio@1.2.1` — MIT
- `muda@0.19.3` — Apache-2.0 OR MIT
- `new_debug_unreachable@1.0.6` — MIT
- `notify@6.1.1` — CC0-1.0
- `num-conv@0.2.2` — MIT OR Apache-2.0
- `num-traits@0.2.19` — MIT OR Apache-2.0
- `once_cell@1.21.4` — MIT OR Apache-2.0
- `open@5.3.6` — MIT
- `option-ext@0.2.0` — MPL-2.0
- `parking_lot@0.12.5` — MIT OR Apache-2.0
- `parking_lot_core@0.9.12` — MIT OR Apache-2.0
- `percent-encoding@2.3.2` — MIT OR Apache-2.0
- `phf@0.13.1` — MIT
- `phf_codegen@0.13.1` — MIT
- `phf_generator@0.13.1` — MIT
- `phf_macros@0.13.1` — MIT
- `phf_shared@0.13.1` — MIT
- `pin-project-lite@0.2.17` — Apache-2.0 OR MIT
- `pkg-config@0.3.33` — MIT OR Apache-2.0
- `plist@1.9.0` — MIT
- `png@0.17.16` — MIT OR Apache-2.0
- `potential_utf@0.1.5` — Unicode-3.0
- `powerfmt@0.2.0` — MIT OR Apache-2.0
- `precomputed-hash@0.1.1` — MIT
- `proc-macro2@1.0.106` — MIT OR Apache-2.0
- `quick-xml@0.39.4` — MIT
- `quote@1.0.46` — MIT OR Apache-2.0
- `raw-window-handle@0.6.2` — MIT OR Apache-2.0 OR Zlib
- `ref-cast@1.0.25` — MIT OR Apache-2.0
- `ref-cast-impl@1.0.25` — MIT OR Apache-2.0
- `regex@1.12.4` — MIT OR Apache-2.0
- `regex-automata@0.4.14` — MIT OR Apache-2.0
- `regex-syntax@0.8.11` — MIT OR Apache-2.0
- `rfd@0.16.0` — MIT
- `rusqlite@0.32.1` — MIT
- `rustc_version@0.4.1` — MIT OR Apache-2.0
- `rustc-hash@2.1.2` — Apache-2.0 OR MIT
- `same-file@1.0.6` — Unlicense/MIT
- `schemars@0.8.22` — MIT
- `schemars@0.9.0` — MIT
- `schemars@1.2.1` — MIT
- `schemars_derive@0.8.22` — MIT
- `scopeguard@1.2.0` — MIT OR Apache-2.0
- `selectors@0.36.1` — MPL-2.0
- `semver@1.0.28` — MIT OR Apache-2.0
- `serde@1.0.228` — MIT OR Apache-2.0
- `serde_core@1.0.228` — MIT OR Apache-2.0
- `serde_derive@1.0.228` — MIT OR Apache-2.0
- `serde_derive_internals@0.29.1` — MIT OR Apache-2.0
- `serde_json@1.0.150` — MIT OR Apache-2.0
- `serde_repr@0.1.20` — MIT OR Apache-2.0
- `serde_spanned@1.1.1` — MIT OR Apache-2.0
- `serde_with@3.21.0` — MIT OR Apache-2.0
- `serde_with_macros@3.21.0` — MIT OR Apache-2.0
- `serde-untagged@0.1.9` — MIT OR Apache-2.0
- `serialize-to-javascript@0.1.2` — MIT OR Apache-2.0
- `serialize-to-javascript-impl@0.1.2` — MIT OR Apache-2.0
- `servo_arc@0.4.3` — MIT OR Apache-2.0
- `sha2@0.10.9` — MIT OR Apache-2.0
- `shlex@2.0.1` — MIT OR Apache-2.0
- `simd-adler32@0.3.9` — MIT
- `siphasher@1.0.3` — MIT/Apache-2.0
- `smallvec@1.15.2` — MIT OR Apache-2.0
- `socket2@0.6.4` — MIT OR Apache-2.0
- `softbuffer@0.4.8` — MIT OR Apache-2.0
- `stable_deref_trait@1.2.1` — MIT OR Apache-2.0
- `string_cache@0.9.0` — MIT OR Apache-2.0
- `string_cache_codegen@0.6.1` — MIT OR Apache-2.0
- `strsim@0.11.1` — MIT
- `syn@2.0.118` — MIT OR Apache-2.0
- `synstructure@0.13.2` — MIT
- `tao@0.35.3` — Apache-2.0
- `tauri@2.11.4` — Apache-2.0 OR MIT
- `tauri-build@2.6.3` — Apache-2.0 OR MIT
- `tauri-codegen@2.6.3` — Apache-2.0 OR MIT
- `tauri-macros@2.6.3` — Apache-2.0 OR MIT
- `tauri-plugin@2.6.3` — Apache-2.0 OR MIT
- `tauri-plugin-dialog@2.7.1` — Apache-2.0 OR MIT
- `tauri-plugin-fs@2.5.1` — Apache-2.0 OR MIT
- `tauri-plugin-opener@2.5.4` — Apache-2.0 OR MIT
- `tauri-plugin-single-instance@2.4.2` — Apache-2.0 OR MIT
- `tauri-runtime@2.11.3` — Apache-2.0 OR MIT
- `tauri-runtime-wry@2.11.4` — Apache-2.0 OR MIT
- `tauri-utils@2.9.3` — Apache-2.0 OR MIT
- `tauri-winres@0.3.6` — MIT
- `tendril@0.5.0` — MIT OR Apache-2.0
- `thiserror@1.0.69` — MIT OR Apache-2.0
- `thiserror@2.0.18` — MIT OR Apache-2.0
- `thiserror-impl@1.0.69` — MIT OR Apache-2.0
- `thiserror-impl@2.0.18` — MIT OR Apache-2.0
- `time@0.3.51` — MIT OR Apache-2.0
- `time-core@0.1.9` — MIT OR Apache-2.0
- `time-macros@0.2.30` — MIT OR Apache-2.0
- `tinystr@0.8.3` — Unicode-3.0
- `tinyvec@1.11.0` — Zlib OR Apache-2.0 OR MIT
- `tinyvec_macros@0.1.1` — MIT OR Apache-2.0 OR Zlib
- `tokio@1.52.3` — MIT
- `toml@0.9.12+spec-1.1.0` — MIT OR Apache-2.0
- `toml@1.1.2+spec-1.1.0` — MIT OR Apache-2.0
- `toml_datetime@0.7.5+spec-1.1.0` — MIT OR Apache-2.0
- `toml_datetime@1.1.1+spec-1.1.0` — MIT OR Apache-2.0
- `toml_parser@1.1.2+spec-1.1.0` — MIT OR Apache-2.0
- `toml_writer@1.1.1+spec-1.1.0` — MIT OR Apache-2.0
- `tracing@0.1.44` — MIT
- `tracing-attributes@0.1.31` — MIT
- `tracing-core@0.1.36` — MIT
- `tray-icon@0.24.1` — MIT OR Apache-2.0
- `typeid@1.0.3` — MIT OR Apache-2.0
- `typenum@1.20.1` — MIT OR Apache-2.0
- `unic-char-property@0.9.0` — MIT/Apache-2.0
- `unic-char-range@0.9.0` — MIT/Apache-2.0
- `unic-common@0.9.0` — MIT/Apache-2.0
- `unicode-ident@1.0.24` — (MIT OR Apache-2.0) AND Unicode-3.0
- `unicode-segmentation@1.13.3` — MIT OR Apache-2.0
- `unic-ucd-ident@0.9.0` — MIT/Apache-2.0
- `unic-ucd-version@0.9.0` — MIT/Apache-2.0
- `url@2.5.8` — MIT OR Apache-2.0
- `urlpattern@0.3.0` — MIT
- `utf-8@0.7.6` — MIT OR Apache-2.0
- `utf8_iter@1.0.4` — Apache-2.0 OR MIT
- `uuid@1.23.4` — Apache-2.0 OR MIT
- `vcpkg@0.2.15` — MIT/Apache-2.0
- `version_check@0.9.5` — MIT/Apache-2.0
- `vswhom@0.1.0` — MIT
- `vswhom-sys@0.1.3` — MIT
- `walkdir@2.5.0` — Unlicense/MIT
- `web_atoms@0.2.5` — MIT OR Apache-2.0
- `webview2-com@0.38.2` — MIT
- `webview2-com-macros@0.8.1` — MIT
- `webview2-com-sys@0.38.2` — MIT
- `winapi-util@0.1.11` — Unlicense OR MIT
- `windows@0.61.3` — MIT OR Apache-2.0
- `windows_x86_64_msvc@0.48.5` — MIT OR Apache-2.0
- `windows_x86_64_msvc@0.52.6` — MIT OR Apache-2.0
- `windows_x86_64_msvc@0.53.1` — MIT OR Apache-2.0
- `windows-collections@0.2.0` — MIT OR Apache-2.0
- `windows-core@0.61.2` — MIT OR Apache-2.0
- `windows-future@0.2.1` — MIT OR Apache-2.0
- `windows-implement@0.60.2` — MIT OR Apache-2.0
- `windows-interface@0.59.3` — MIT OR Apache-2.0
- `windows-link@0.1.3` — MIT OR Apache-2.0
- `windows-link@0.2.1` — MIT OR Apache-2.0
- `windows-numerics@0.2.0` — MIT OR Apache-2.0
- `windows-result@0.3.4` — MIT OR Apache-2.0
- `windows-strings@0.4.2` — MIT OR Apache-2.0
- `windows-sys@0.48.0` — MIT OR Apache-2.0
- `windows-sys@0.59.0` — MIT OR Apache-2.0
- `windows-sys@0.60.2` — MIT OR Apache-2.0
- `windows-sys@0.61.2` — MIT OR Apache-2.0
- `windows-targets@0.48.5` — MIT OR Apache-2.0
- `windows-targets@0.52.6` — MIT OR Apache-2.0
- `windows-targets@0.53.5` — MIT OR Apache-2.0
- `windows-threading@0.1.0` — MIT OR Apache-2.0
- `windows-version@0.1.7` — MIT OR Apache-2.0
- `window-vibrancy@0.6.0` — Apache-2.0 OR MIT
- `winnow@0.7.15` — MIT
- `winnow@1.0.3` — MIT
- `winreg@0.55.0` — MIT
- `writeable@0.6.3` — Unicode-3.0
- `wry@0.55.1` — Apache-2.0 OR MIT
- `yoke@0.8.3` — Unicode-3.0
- `yoke-derive@0.8.2` — Unicode-3.0
- `zerocopy@0.8.52` — BSD-2-Clause OR Apache-2.0 OR MIT
- `zerofrom@0.1.8` — Unicode-3.0
- `zerofrom-derive@0.1.7` — Unicode-3.0
- `zerotrie@0.2.4` — Unicode-3.0
- `zerovec@0.11.6` — Unicode-3.0
- `zerovec-derive@0.11.3` — Unicode-3.0
- `zmij@1.0.21` — MIT
