/**
 * Global type declarations for build-time constants.
 *
 * These values are injected by Vite's `define` option in wxt.config.ts.
 */

/** App version string from package.json, injected at build time */
declare const __APP_VERSION__: string;

/**
 * Selection.getComposedRanges() -- Chrome 137+, standard API for Shadow DOM selection.
 * TypeScript's lib.dom.d.ts may not yet include this declaration.
 */
interface Selection {
  getComposedRanges(options?: { shadowRoots?: ShadowRoot[] }): StaticRange[];
}
