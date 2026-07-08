const DEFAULT_MIN_INTERVAL_MS = 6500;

// NVD API의 API 키 없는 요청 제한(30초당 5건)을 자연스럽게 지키기 위해,
// 호출 간 최소 간격을 강제하는 함수를 반환한다.
export function createRateLimiter(minIntervalMs: number = DEFAULT_MIN_INTERVAL_MS): () => Promise<void> {
  let lastCallAt = 0;
  return async function wait(): Promise<void> {
    const now = Date.now();
    const elapsed = now - lastCallAt;
    if (elapsed < minIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, minIntervalMs - elapsed));
    }
    lastCallAt = Date.now();
  };
}
