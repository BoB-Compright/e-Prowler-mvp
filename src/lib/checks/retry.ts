export class AuthFailureError extends Error {}
export class ConnectionFailureError extends Error {}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function retryOnConnectionFailure<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const delayMs = opts.delayMs ?? 30000;
  const sleep = opts.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!(error instanceof ConnectionFailureError)) throw error; // 인증 실패 등은 즉시 전파
      lastError = error;
      if (attempt < maxAttempts) await sleep(delayMs);
    }
  }
  throw lastError;
}
