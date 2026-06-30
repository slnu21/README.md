// Tabs: 열린 파일 다중 탭(더티 상태, 자동저장 옵션). 상태는 app/store.
// TODO(v0.1): 탭 모델/액션

export interface Tab {
  id: string;
  path: string | null;
  title: string;
  dirty: boolean;
}
