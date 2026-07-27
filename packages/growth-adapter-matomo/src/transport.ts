/*
<MODULE_CONTRACT>
<purpose>Browser-facing Matomo transport seam. Encapsulates _paq queue access,
script injection, opt-out detection, and production-host checks so adapter logic
remains testable without a DOM.</purpose>
<non-goals>
  <item>Do not map semantic events to Matomo commands; adapter.ts owns that policy.</item>
  <item>Do not persist visitor state beyond the existing localStorage opt-out check.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Split Matomo transport implementations out of the root barrel as a dedicated subpath.</item>
</CHANGE_SUMMARY>
*/

export interface MatomoTransport {
  push(cmd: unknown[]): void;
  injectScript(url: string): void;
  isOptedOut(): boolean;
  isProductionHost(host: string): boolean;
}

const INTERNAL_OPT_OUT_KEY = "wg_internal";

export class BrowserMatomoTransport implements MatomoTransport {
  private readonly paq: unknown[][];

  constructor() {
    if (typeof window !== "undefined") {
      const w = window as Window & { _paq?: unknown[][] };
      this.paq = w._paq = w._paq ?? [];
    } else {
      this.paq = [];
    }
  }

  push(cmd: unknown[]): void {
    this.paq.push(cmd);
  }

  injectScript(url: string): void {
    if (typeof document === "undefined") return;
    const script = document.createElement("script");
    script.async = true;
    script.src = url;
    document.head.appendChild(script);
  }

  isOptedOut(): boolean {
    try {
      return (
        typeof window !== "undefined" && window.localStorage.getItem(INTERNAL_OPT_OUT_KEY) === "1"
      );
    } catch {
      return true;
    }
  }

  isProductionHost(host: string): boolean {
    if (typeof window === "undefined") return false;
    return window.location.hostname === host;
  }
}

export class StubMatomoTransport implements MatomoTransport {
  readonly calls: unknown[][] = [];
  readonly scripts: string[] = [];
  optedOut = false;
  productionHost = true;

  push(cmd: unknown[]): void {
    this.calls.push(cmd);
  }

  injectScript(url: string): void {
    this.scripts.push(url);
  }

  isOptedOut(): boolean {
    return this.optedOut;
  }

  isProductionHost(_host: string): boolean {
    return this.productionHost;
  }
}
