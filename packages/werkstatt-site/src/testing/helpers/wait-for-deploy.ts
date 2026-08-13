/*
<MODULE_CONTRACT>
<purpose>Polls a URL until it returns a 200 response or times out, used to wait for dev-deployed artifacts to become reachable before running tests.</purpose>
<non-goals>
  <item>Does not validate response content — only HTTP status.</item>
  <item>Does not retry on network errors beyond the timeout window.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0823: initial implementation of deploy wait helper for the testing pyramid helpers.</item>
</CHANGE_SUMMARY>
*/

export interface WaitForDeployOptions {
  timeoutMs?: number;
  intervalMs?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_INTERVAL_MS = 2_000;

/**
 * Waits for a URL to return a successful (2xx) HTTP response.
 *
 * Polls the URL at regular intervals until it responds with a 2xx status
 * or the timeout is reached. Uses fetch with `redirect: "follow"`.
 *
 * @throws if the URL does not respond successfully within the timeout.
 */
export async function waitForDeploy(
  url: string,
  options: WaitForDeployOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;

  let lastError: Error | undefined;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (response.ok) {
        return;
      }
      lastError = new Error(
        `[wait-for-deploy] ${url} returned HTTP ${response.status}`,
      );
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `[wait-for-deploy] ${url} did not respond within ${timeoutMs}ms: ${lastError?.message ?? "unknown error"}`,
  );
}
