import { describe, expect, it } from "vitest";
import { createLock } from "./serialize";

/** await 지점을 하나 끼운 작업 — 락이 없으면 여기서 다른 작업이 끼어든다. */
const task = (log: string[], tag: string, ticks = 1) => async () => {
  log.push(`s${tag}`);
  for (let i = 0; i < ticks; i++) await Promise.resolve();
  log.push(`e${tag}`);
  return tag;
};

describe("createLock", () => {
  it("두 작업이 인터리브되지 않는다", async () => {
    const log: string[] = [];
    const lock = createLock();
    await Promise.all([lock(task(log, "1")), lock(task(log, "2"))]);
    expect(log).toEqual(["s1", "e1", "s2", "e2"]);
  });

  it("뒤 작업이 더 빨리 끝나도 FIFO 순서를 지킨다", async () => {
    const log: string[] = [];
    const lock = createLock();
    // 1번이 가장 오래 걸리고 3번이 가장 짧다 — 락이 없으면 완료 순서가 뒤집힌다.
    await Promise.all([lock(task(log, "1", 5)), lock(task(log, "2", 3)), lock(task(log, "3", 0))]);
    expect(log).toEqual(["s1", "e1", "s2", "e2", "s3", "e3"]);
  });

  it("앞 작업이 실패해도 뒤 작업은 실행된다", async () => {
    const log: string[] = [];
    const lock = createLock();
    const failing = lock(async () => {
      log.push("s1");
      throw new Error("boom");
    });
    const after = lock(task(log, "2"));
    await expect(failing).rejects.toThrow("boom");
    await expect(after).resolves.toBe("2");
    expect(log).toEqual(["s1", "s2", "e2"]);
  });

  it("실패 이후에 큐잉된 작업도 실행된다 (체인이 굳지 않는다)", async () => {
    const lock = createLock();
    await expect(lock(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    // 실패가 끝난 뒤에 넣는다 — tail 이 중화되지 않았다면 여기서 영영 안 돈다.
    await expect(lock(() => Promise.resolve("ok"))).resolves.toBe("ok");
  });

  it("반환값이 순서대로 그대로 통과한다", async () => {
    const lock = createLock();
    const got = await Promise.all([
      lock(async () => 1),
      lock(async () => "two"),
      lock(async () => ({ n: 3 })),
    ]);
    expect(got).toEqual([1, "two", { n: 3 }]);
  });

  it("락 인스턴스끼리는 독립이다", async () => {
    const log: string[] = [];
    const a = createLock();
    const b = createLock();
    await Promise.all([a(task(log, "1")), b(task(log, "2"))]);
    // 서로 다른 락이므로 교차해야 정상(같은 락이면 s1,e1,s2,e2 가 된다).
    expect(log).toEqual(["s1", "s2", "e1", "e2"]);
  });
});
