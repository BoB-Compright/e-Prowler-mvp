import { describe, expect, it, vi } from "vitest";
import { AuthFailureError, ConnectionFailureError, retryOnConnectionFailure } from "./retry";

const noSleep = async () => {};

describe("retryOnConnectionFailure", () => {
  it("retries connection failures up to maxAttempts then throws", async () => {
    const fn = vi.fn().mockRejectedValue(new ConnectionFailureError("timeout"));
    await expect(
      retryOnConnectionFailure(fn, { maxAttempts: 3, sleep: noSleep }),
    ).rejects.toThrow(ConnectionFailureError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry auth failures", async () => {
    const fn = vi.fn().mockRejectedValue(new AuthFailureError("bad password"));
    await expect(
      retryOnConnectionFailure(fn, { maxAttempts: 3, sleep: noSleep }),
    ).rejects.toThrow(AuthFailureError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("returns the result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    expect(await retryOnConnectionFailure(fn, { sleep: noSleep })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("succeeds after a transient connection failure", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new ConnectionFailureError("refused"))
      .mockResolvedValue("ok");
    expect(await retryOnConnectionFailure(fn, { sleep: noSleep })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
