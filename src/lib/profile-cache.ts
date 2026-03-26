/**
 * Shared LRU profile avatar cache.
 *
 * Extracted into its own module to avoid circular dependencies between
 * client.ts and chat-store.ts — both need to read/write this cache.
 *
 * Keyed by userId → MXC URL. Empty string = "fetched but no avatar" (negative cache).
 */
const PROFILE_CACHE_MAX = 2000
const profileAvatarCache = new Map<string, string>()

/** Write to profile cache with LRU eviction. */
export function setProfileCache(userId: string, value: string): void {
  if (profileAvatarCache.has(userId)) {
    profileAvatarCache.delete(userId)
  }
  profileAvatarCache.set(userId, value)
  if (profileAvatarCache.size > PROFILE_CACHE_MAX) {
    const firstKey = profileAvatarCache.keys().next().value!
    profileAvatarCache.delete(firstKey)
  }
}

/**
 * Read from profile cache.
 * Does NOT do LRU promotion during reads to avoid mutating state during
 * React render cycles (which causes infinite re-render loops — error #185).
 * LRU promotion happens on write (setProfileCache) instead.
 */
export function getProfileCache(userId: string): string | undefined {
  return profileAvatarCache.get(userId)
}

/** Check if a userId exists in the cache (without promoting). */
export function hasProfileCache(userId: string): boolean {
  return profileAvatarCache.has(userId)
}

/** Clear the entire cache (used on logout). */
export function clearProfileCache(): void {
  profileAvatarCache.clear()
}
