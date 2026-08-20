// 잠깐 떴다 사라지는 알림. 모달(PromptModal·ConfirmDialog)은 손을 멈추게 하므로
// "링크를 못 열었다" 같이 알려주기만 하면 되는 일에는 쓰지 않는다.
//
// 왜 있나: 미리보기 링크가 두 릴리스 동안 아무 반응 없이 죽어 있었는데, 실패를
// `.catch(() => {})` 로 삼켜서 화면에도 콘솔에도 아무것도 안 남았기 때문이다.
import { useEffect } from "react";
import { useAppStore } from "../store";

const SHOW_MS = 4200;

export function Toast() {
  const notice = useAppStore((s) => s.notice);
  const dismiss = useAppStore((s) => s.dismissNotice);

  useEffect(() => {
    if (!notice) return;
    // notice 는 showNotice 마다 새 객체다 → 같은 문구가 다시 떠도 표시 시간이 다시 시작된다.
    const timer = window.setTimeout(dismiss, SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [notice, dismiss]);

  if (!notice) return null;
  return (
    <div
      className={"toast " + notice.kind}
      role="status"
      aria-live="polite"
      onClick={dismiss}
      title={notice.text}
    >
      {notice.text}
    </div>
  );
}
