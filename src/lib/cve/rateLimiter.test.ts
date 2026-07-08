import { afterEach, describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "./rateLimiter";

afterEach(() => {
  vi.useRealTimers();
});

describe("createRateLimiter", () => {
  it("does not delay the first call", async () => {
    const wait = createRateLimiter(6500);
    const start = Date.now();
    await wait();
    expect(Date.now() - start).toBeLessThan(50);
  });

  it("delays a call that follows too soon after the previous one", async () => {
    vi.useFakeTimers();
    const wait = createRateLimiter(6500);
    await wait(); // 첫 호출은 즉시 통과

    let resolved = false;
    wait().then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(6000);
    expect(resolved).toBe(false); // 아직 6.5초가 안 지남

    await vi.advanceTimersByTimeAsync(500);
    expect(resolved).toBe(true);
  });
});
