// Licensing / entitlements 스텁. 현재는 전 기능 활성.
// 유료화 전환 시 Microsoft Store 인앱결제 또는 라이선스 키 검증으로 교체.
// 배포 앱은 상업적 사용 허용(EULA). 참고: docs/legal/EULA.md

export type Feature = "export" | "advancedThemes" | "all";

export interface Entitlements {
  has(feature: Feature): boolean;
}

const allEnabled: Entitlements = { has: () => true };

export function getEntitlements(): Entitlements {
  return allEnabled;
}
