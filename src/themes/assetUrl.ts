/**
 * Resolve a public-asset path against the app's deploy base (Vite's
 * `base`, e.g. `/nibble/` on GitHub Pages). Theme data stays plain strings;
 * this is the one place the base is applied.
 */
export function assetUrl(path: string): string {
  return import.meta.env.BASE_URL + path.replace(/^\//, '')
}
