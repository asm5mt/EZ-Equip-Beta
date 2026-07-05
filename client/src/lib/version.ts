// Single source of truth for version/build info, injected at build time by
// vite.config.ts's `define` block (package.json version, git commit count,
// and the build timestamp). Every UI surface that shows this info imports
// from here so they can never drift apart.
export const APP_VERSION = __APP_VERSION__;
export const BUILD_NUMBER = __BUILD_NUMBER__;
export const BUILD_TIME = __BUILD_TIME__;

export function versionString(): string {
  return `v${APP_VERSION} (build ${BUILD_NUMBER})`;
}
