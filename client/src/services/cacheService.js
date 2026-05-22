/**
 * Merges new songs into the cached pool in localStorage,
 * deduplicating by videoId and capping the pool size.
 *
 * @param {Array} newSongs - The array of new songs to merge.
 * @param {number} maxLimit - The maximum number of songs to keep in the pool (default: 800).
 */
export const updateCachedPool = (newSongs, maxLimit = 800) => {
  if (!newSongs || !Array.isArray(newSongs) || newSongs.length === 0) return;

  try {
    const stored = localStorage.getItem("moodydj_cached_pool");
    let pool = [];
    if (stored) {
      try {
        pool = JSON.parse(stored);
      } catch (e) {
        console.error("Error parsing moodydj_cached_pool:", e);
      }
    }
    if (!Array.isArray(pool)) {
      pool = [];
    }

    const seen = new Set();
    const merged = [];

    // Keep existing songs
    pool.forEach((song) => {
      if (song && song.videoId && !seen.has(song.videoId)) {
        seen.add(song.videoId);
        merged.push(song);
      }
    });

    // Merge new songs incrementally
    newSongs.forEach((song) => {
      if (song && song.videoId && !seen.has(song.videoId)) {
        seen.add(song.videoId);
        merged.push(song);
      }
    });

    // Cap the pool size (keep the latest up to maxLimit)
    const capped = merged.length > maxLimit ? merged.slice(merged.length - maxLimit) : merged;

    localStorage.setItem("moodydj_cached_pool", JSON.stringify(capped));
    console.log(`💾 [CACHED POOL] Merged ${newSongs.length} songs. Capped total size to ${capped.length} (limit: ${maxLimit}).`);
  } catch (error) {
    console.error("Error updating cached pool:", error);
  }
};
