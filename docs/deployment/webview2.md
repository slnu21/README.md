# WebView2 / Win10 오프라인 전략

Tauri는 렌더링에 시스템 **WebView2** 런타임을 사용한다.

## 설치 모드 (`bundle.windows.webviewInstallMode`)
| 모드 | 설명 | 오프라인 | 번들 영향 |
|---|---|---|---|
| `downloadBootstrapper` (현재) | 실행 중 부트스트래퍼가 다운로드 | ✗(첫 설치 시 인터넷) | 작음 |
| `embedBootstrapper` | 부트스트래퍼 동봉 | △ | 작음 |
| `offlineInstaller` | 전체 설치기 동봉 | ✓ | +수십~수백 MB |
| `fixedRuntime` | 고정 버전 런타임 동봉 | ✓ | +큼 |

> 위 옵션은 **Win32(NSIS/MSI)** 번들에 적용된다.

## 결정
- **Windows 11**: WebView2가 OS에 기본 탑재 → `downloadBootstrapper`로도 실제 다운로드 없이 동작. 경량 유지(기본값).
- **Windows 10 (검토)**: WebView2 미탑재 가능 → "100% 오프라인 첫 실행"을 보장하려면 **`offlineInstaller` 또는 `fixedRuntime`** 임베드 빌드 별도 제공(번들 증가 트레이드오프).

## MSIX 경로의 WebView2
- MSIX 매니페스트에서 **Microsoft.WebView2 런타임을 패키지 의존성(`PackageDependency`)으로 선언**하면 Store가 설치 시 함께 제공할 수 있다(별도 임베드 없이 깔끔).
- 완전한 오프라인 보장이 필요하면 MSIX에도 고정 런타임 동봉 방식을 고려.

## 권장 구성
- 기본 릴리스: Win11 타깃 경량.
- Win10 지원 확정 시: Win32는 임베드 빌드(`*-win10.exe`), MSIX는 WebView2 의존성 선언 또는 고정 런타임.

참고: <https://learn.microsoft.com/microsoft-edge/webview2/concepts/distribution>
