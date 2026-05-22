/**
 * Local Queue Generation Engine
 * Handles duplicate checks, artist diversity protection, disliked keywords filter, and smart recycling.
 */
export const generateLocalQueue = (pool, options = {}) => {
  const {
    recentSongs = [],
    currentQueue = [],
    targetSize = 50,
    avoidPlayedIds = new Set(),
    dislikedVideoIds = [],
    dislikedArtistNames = []
  } = options;

  console.log(`🧠 [LOCAL QUEUE ENGINE] Building queue. Input Pool: ${pool.length} songs. Target: ${targetSize}. Disliked VideoIds count: ${dislikedVideoIds.length}, Disliked Artists: ${dislikedArtistNames.join(", ")}`);

  // 1. Remove duplicate songs by videoId
  const uniquePoolMap = new Map();
  pool.forEach(song => {
    if (song && song.videoId) {
      uniquePoolMap.set(song.videoId, song);
    }
  });
  const uniquePool = Array.from(uniquePoolMap.values());

  // 2. Identify candidate sets
  const recentIds = new Set(recentSongs.map(s => s.videoId));
  const currentIds = new Set(currentQueue.map(s => s.videoId));
  const dislikedIdsSet = new Set(dislikedVideoIds);
  const dislikedArtistsSet = new Set(dislikedArtistNames.map(a => a.toLowerCase().trim()));

  // Primary candidates: not currently in queue, not recently played, not avoided, and not disliked
  let candidates = uniquePool.filter(s => 
    !currentIds.has(s.videoId) && 
    !recentIds.has(s.videoId) && 
    !avoidPlayedIds.has(s.videoId) &&
    !dislikedIdsSet.has(s.videoId)
  );

  console.log(`🧠 [LOCAL QUEUE ENGINE] Candidates (unplayed, not in current queue, not disliked): ${candidates.length}`);

  // If candidate pool is too small, recycle older songs from history (but still filter disliked songs)
  const freshCount = candidates.length;
  if (freshCount < targetSize) {
    console.log(`⚠️ [LOCAL QUEUE ENGINE] Candidate pool too small (${freshCount}). Recycling older songs...`);
    
    // Find songs that are recently played but not currently in the queue, ordered such that oldest played are added first.
    const recentOrderedList = recentSongs.map(s => s.videoId);
    
    const recycled = uniquePool
      .filter(s => 
        !currentIds.has(s.videoId) && 
        !candidates.some(c => c.videoId === s.videoId) &&
        !dislikedIdsSet.has(s.videoId)
      )
      .sort((a, b) => {
        const idxA = recentOrderedList.indexOf(a.videoId);
        const idxB = recentOrderedList.indexOf(b.videoId);
        // Put those NOT in history first, then older history (higher index in recentSongs list, which goes newest-to-oldest)
        return idxB - idxA; 
      });

    const needed = targetSize - freshCount;
    const recycledToUse = recycled.slice(0, needed);
    candidates = [...candidates, ...recycledToUse];
    console.log(`🧠 [LOCAL QUEUE ENGINE] Pool size after recycling: ${candidates.length} (added ${recycledToUse.length} oldest recycled songs)`);
  }

  // If STILL too small, add back from current queue (but filter disliked songs)
  if (candidates.length < targetSize) {
    const queueAdditions = uniquePool.filter(s => 
      !candidates.some(c => c.videoId === s.videoId) &&
      !dislikedIdsSet.has(s.videoId)
    );
    const needed = targetSize - candidates.length;
    const additionsToUse = queueAdditions.slice(0, needed);
    candidates = [...candidates, ...additionsToUse];
  }

  // LAST RESORT FALLBACK: If candidates is STILL empty
  // Just give whatever we have in the pool, minus dislikes.
  if (candidates.length === 0) {
    console.warn("⚠️ [LOCAL QUEUE ENGINE] Candidates empty after all filters! Falling back to full pool (minus dislikes).");
    candidates = uniquePool.filter(s => !dislikedIdsSet.has(s.videoId));
  }

  // 3. Lower priority for songs by disliked artists, then shuffle
  const highPriority = [];
  const lowPriority = [];

  candidates.forEach(s => {
    const artist = (s.artistNormalized || s.artist || s.channelTitle || "").toLowerCase().trim();
    if (dislikedArtistsSet.has(artist)) {
      lowPriority.push(s);
    } else {
      highPriority.push(s);
    }
  });

  const shuffleList = (arr) => {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const shuffledCandidates = [...shuffleList(highPriority), ...shuffleList(lowPriority)];

  // 4. Group by artist for diversity protection
  const groups = new Map();
  shuffledCandidates.forEach(song => {
    const artist = (song.artistNormalized || song.artist || song.channelTitle || "unknown").toLowerCase().trim();
    if (!groups.has(artist)) groups.set(artist, []);
    groups.get(artist).push(song);
  });

  // 5. Draw from groups in a round-robin fashion to distribute artists evenly
  const diverseList = [];
  const groupLists = Array.from(groups.values());
  let hasMore = true;

  while (hasMore && diverseList.length < targetSize) {
    hasMore = false;
    for (const list of groupLists) {
      if (list.length > 0 && diverseList.length < targetSize) {
        diverseList.push(list.shift());
        hasMore = true;
      }
    }
  }

  console.log(`✅ [LOCAL QUEUE ENGINE] Generated diverse queue of ${diverseList.length} songs. Artist distribution: ${groups.size} unique artists.`);
  return diverseList;
};
