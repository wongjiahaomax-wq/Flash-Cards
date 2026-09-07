export const RESOURCE_URL_CACHE_BYTES = 32 * 1024 * 1024;

export function trimResourceUrlCache(cache, protectedPaths = new Set(), limit = RESOURCE_URL_CACHE_BYTES, release = () => {}) {
  let total = [...cache.values()].reduce((sum, item) => sum + item.bytes, 0);
  for (const [path, item] of [...cache.entries()].sort((a, b) => a[1].used - b[1].used)) {
    if (total <= limit) break;
    if (protectedPaths.has(path)) continue;
    total -= item.bytes;
    cache.delete(path);
    release(path, item);
  }
}
