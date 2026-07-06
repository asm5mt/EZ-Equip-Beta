function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints <= 1 && /Macintosh/.test(ua);
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
  return (isIOS || isMac) && isSafari;
}

export function mapsUrlFor(address: string): string {
  const query = encodeURIComponent(address);
  return isApplePlatform()
    ? `https://maps.apple.com/?q=${query}`
    : `https://www.google.com/maps/search/?api=1&query=${query}`;
}
