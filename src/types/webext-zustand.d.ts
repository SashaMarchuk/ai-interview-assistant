/**
 * Type declarations for webext-zustand
 *
 * The package has types but they don't resolve due to package.json exports configuration.
 * This provides the necessary type declarations.
 */

declare module 'webext-zustand' {
  import type { StoreApi } from 'zustand';

  /**
   * Wraps a Zustand store for cross-context synchronization in browser extensions.
   *
   * Call this in popup, content script, and service worker to enable automatic
   * state synchronization across all extension contexts.
   *
   * @param store - The Zustand store to wrap
   * @returns Promise that resolves when the store is synced and ready
   *
   * @example
   * ```ts
   * import { create } from 'zustand';
   * import { wrapStore } from 'webext-zustand';
   *
   * const useStore = create((set) => ({ count: 0 }));
   * export const storeReadyPromise = wrapStore(useStore);
   *
   * // In components:
   * await storeReadyPromise;
   * // Store is now synced
   * ```
   */
  export function wrapStore<T>(store: StoreApi<T>): Promise<void>;
}
