// 툴바를 실제로 재서 밀도 단계를 정하는 훅. 판정은 lib/toolbarFit.ts(순수)가 하고
// 여기는 DOM 에서 숫자를 읽어 넘기는 일만 한다.
//
// **왜 재야 하나**: 아이템은 안 줄어들게 두었다(App.css `.titlebar > * { flex: none }`).
// 줄어들게 두면 글자끼리 겹친다 — 상자만 눌리고 안의 글자는 그대로 남기 때문이다.
// 그래서 안 줄이고 **넘치게** 두고, 그 넘침을 여기서 보고 접는다.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { DENSITIES, initialFit, nextFit, requiredWidth, type Density } from "../lib/toolbarFit";

export function useToolbarFit(ref: RefObject<HTMLElement | null>, resetKey: unknown): Density {
  const [fit, setFit] = useState(initialFit);
  // 마지막으로 **실제로 잰** 조건(폭·단계·초기화 키). 그대로면 결과도 그대로다.
  // 이 훅은 렌더마다 도는데 AppShell 은 타자 한 글자마다 다시 그려지므로(탭 내용을 구독한다)
  // 이 문지기가 없으면 글자마다 강제 리플로가 한 번씩 더 붙는다.
  const seen = useRef("");
  const sig = useRef("");

  // 언어·UI 글꼴이 바뀌면 라벨 폭이 달라진다 → 여태 적어 둔 관측은 못 쓴다.
  // (안 버리면 영어에서 잰 폭 때문에 한국어에서 필요 이상으로 접힌 채 남는다.)
  useEffect(() => {
    seen.current = "";
    setFit(initialFit);
  }, [resetKey]);

  const measure = useCallback(
    (force = false) => {
      const el = ref.current;
      if (!el) return;
      const now = `${el.clientWidth}|${sig.current}`;
      if (!force && now === seen.current) return;
      seen.current = now;

      const cs = getComputedStyle(el);
      const gap = parseFloat(cs.columnGap) || 0;
      const padding = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      // 바깥 여백까지 센다 — `.sep` 은 gap 말고도 자기 margin 을 갖는다(셋이면 24px).
      // 빠뜨리면 그만큼 늦게 접혀, 이미 넘친 툴바를 "아직 들어간다"고 읽는다.
      // 늘어나는 칸(.spacer)은 넘칠 때 이미 최소폭으로 눌려 있으므로 그대로 더하면 되고,
      // 들어갈 때는 남는 폭을 그 칸이 통째로 먹어 합이 정확히 clientWidth 가 된다.
      const widths = Array.from(el.children).map((c) => {
        const m = getComputedStyle(c);
        return (
          c.getBoundingClientRect().width +
          (parseFloat(m.marginLeft) || 0) +
          (parseFloat(m.marginRight) || 0)
        );
      });
      const need = requiredWidth(widths, gap, padding);
      setFit((s) => nextFit(s, el.clientWidth, need > el.clientWidth + 0.5));
    },
    [ref],
  );

  // 렌더마다 다시 잰다 — 단계가 바뀌면 툴바 내용이 바뀌고, 그러면 필요한 폭도 바뀐다
  // (한 번의 관측은 한 칸만 움직이므로, 두 칸을 내려가야 하면 다음 렌더에서 이어 간다).
  useLayoutEffect(() => {
    sig.current = `${fit.level}|${String(resetKey)}`;
    measure();
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure(true));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, measure]);

  // 번들 글꼴은 마운트 뒤에 도착할 수 있다 → 그때 라벨 폭이 바뀐다(v0.6.6 에서 에디터가
  // 같은 이유로 어긋났다). 다 오면 한 번 더 잰다.
  useEffect(() => {
    document.fonts?.ready.then(() => measure(true)).catch(() => {});
  }, [measure]);

  return DENSITIES[fit.level];
}
