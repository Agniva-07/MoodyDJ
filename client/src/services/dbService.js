const DB_NAME = "MoodyDJLocalDB";
const DB_VERSION = 2;
const STORE_NAME = "master_songs";

export const initDb = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error("❌ [INDEXEDDB] Database open error:", event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      let store;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        store = db.createObjectStore(STORE_NAME, { keyPath: "videoId" });
        console.log(`💾 [INDEXEDDB] Object store created: ${STORE_NAME}`);
      } else {
        store = event.target.transaction.objectStore(STORE_NAME);
      }

      if (!store.indexNames.contains("artistNormalized")) {
        store.createIndex("artistNormalized", "artistNormalized", { unique: false });
        console.log("[DB INDEX CREATED] artistNormalized");
      }
      if (!store.indexNames.contains("moodTags")) {
        store.createIndex("moodTags", "moodTags", { unique: false, multiEntry: true });
        console.log("[DB INDEX CREATED] moodTags");
      }
    };
  });
};

/**
 * Batched write to store 700-1000 songs asynchronously in chunks.
 * Yields to main thread between chunks to prevent UI freezes on mobile.
 * Rewrites thumbnails to low/medium quality URLs to optimize storage/memory.
 */
export const saveSongsToPool = async (songs) => {
  if (!songs || !Array.isArray(songs) || songs.length === 0) return;

  try {
    const db = await initDb();
    const batchSize = 100;
    
    // Validate ID format and Low/medium quality thumbnail normalization
    const validIdRegex = /^[a-zA-Z0-9_-]{11}$/;
    const cleanSongs = [];

    songs.forEach(song => {
      // Reject malformed videoIds
      if (!song || typeof song.videoId !== "string" || !validIdRegex.test(song.videoId)) {
        return; 
      }
      
      let optimizedThumb = song.thumbnail || `https://i.ytimg.com/vi/${song.videoId}/mqdefault.jpg`;
      if (optimizedThumb && (optimizedThumb.includes("maxresdefault") || optimizedThumb.includes("hqdefault") || optimizedThumb.includes("sddefault"))) {
        optimizedThumb = optimizedThumb
          .replace("maxresdefault.jpg", "mqdefault.jpg")
          .replace("hqdefault.jpg", "mqdefault.jpg")
          .replace("sddefault.jpg", "mqdefault.jpg");
      }
      
      cleanSongs.push({
        ...song,
        thumbnail: optimizedThumb
      });
    });

    for (let i = 0; i < cleanSongs.length; i += batchSize) {
      const chunk = cleanSongs.slice(i, i + batchSize);
      
      await new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);

        transaction.oncomplete = () => {
          resolve();
        };

        transaction.onerror = (event) => {
          console.error("❌ [INDEXEDDB] Batched transaction failed:", event.target.error);
          reject(event.target.error);
        };

        chunk.forEach((song) => {
          store.put(song);
        });
      });

      // Yield to the main thread to prevent UI freezing on mobile
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    console.log(`💾 [INDEXEDDB] Batched write complete: Saved/Merged ${cleanSongs.length} valid songs.`);

    // [DB VERIFY] and Test Queries
    const allSaved = await new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => reject(event.target.error);
    });

    const totalSongs = allSaved.length;
    const artistIndexedCount = allSaved.filter(s => !!s.artistNormalized).length;
    const moodIndexedCount = allSaved.filter(s => s.moodTags && Array.isArray(s.moodTags) && s.moodTags.length > 0).length;

    console.log("[DB VERIFY]", {
      dbVersion: db.version,
      storeNames: Array.from(db.objectStoreNames),
      activeIndexes: ["artistNormalized", "moodTags"],
      totalSongs,
      artistIndexedCount,
      moodIndexedCount
    });

    if (totalSongs > 0) {
      // Test Queries to verify index functionality
      const sampleArtist = allSaved.find(s => s.artistNormalized)?.artistNormalized;
      if (sampleArtist) {
        await getSongsByArtist(sampleArtist); // Will internally log [ARTIST QUERY]
      }
      const sampleMood = allSaved.find(s => s.moodTags && s.moodTags.length > 0)?.moodTags[0];
      if (sampleMood) {
        await getSongsByMood(sampleMood); // Will internally log [MOOD QUERY]
      }
    }
  } catch (error) {
    console.error("❌ [INDEXEDDB] Failed to save songs to pool:", error);
  }
};

export const clearSongsPool = async () => {
  try {
    const db = await initDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.log("💾 [INDEXEDDB] Cleared master song pool.");
        resolve();
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error("❌ [INDEXEDDB] Failed to clear pool:", error);
  }
};

export const getSongsCount = async () => {
  try {
    const db = await initDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.count();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error("❌ [INDEXEDDB] Failed to get song count:", error);
    return 0;
  }
};

export const getAllSongs = async () => {
  try {
    const db = await initDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        console.log(`💾 [INDEXEDDB READ] Fetched all ${request.result.length} songs.`);
        resolve(request.result);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error("❌ [INDEXEDDB] Failed to get all songs:", error);
    return [];
  }
};

export const getSongsByMood = async (mood) => {
  try {
    const db = await initDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index("moodTags");
      const request = index.getAll(IDBKeyRange.only(mood));

      request.onsuccess = () => {
        console.log(`[MOOD QUERY] ${mood}`, request.result.length);
        resolve(request.result);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error(`❌ [INDEXEDDB] Failed to get songs by mood ${mood}:`, error);
    return [];
  }
};

export const getSongsByArtist = async (artistNormalized) => {
  try {
    const db = await initDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index("artistNormalized");
      const request = index.getAll(IDBKeyRange.only(artistNormalized.toLowerCase().trim()));

      request.onsuccess = () => {
        console.log(`[ARTIST QUERY] ${artistNormalized}`, request.result.length);
        resolve(request.result);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error(`❌ [INDEXEDDB] Failed to get songs by artist ${artistNormalized}:`, error);
    return [];
  }
};

// Hardcoded seed songs for zero-state/offline fallback safety
export const FRONTEND_SEED_SONGS = [
  // Chill
  { videoId: "Umqb9KENgmk", title: "Tum Hi Ho (Aashiqui 2)", artist: "T-Series", artistNormalized: "t-series", thumbnail: "https://i.ytimg.com/vi/Umqb9KENgmk/mqdefault.jpg", durationSeconds: 322, moodTags: ["chill"], energyScore: 0.35, popularityScore: 0.95, sourceArtist: "t-series", validated: true },
  { videoId: "Kz69P-u168o", title: "Raabta (Agent Vinod)", artist: "T-Series", artistNormalized: "t-series", thumbnail: "https://i.ytimg.com/vi/Kz69P-u168o/mqdefault.jpg", durationSeconds: 243, moodTags: ["chill"], energyScore: 0.42, popularityScore: 0.88, sourceArtist: "t-series", validated: true },
  { videoId: "ktP7-x7x00s", title: "Baarishein (Anuv Jain)", artist: "Anuv Jain", artistNormalized: "anuv jain", thumbnail: "https://i.ytimg.com/vi/ktP7-x7x00s/mqdefault.jpg", durationSeconds: 207, moodTags: ["chill"], energyScore: 0.25, popularityScore: 0.82, sourceArtist: "anuv jain", validated: true },
  { videoId: "hoNb6HuNmU0", title: "Khairiyat (Chhichhore)", artist: "T-Series", artistNormalized: "t-series", thumbnail: "https://i.ytimg.com/vi/hoNb6HuNmU0/mqdefault.jpg", durationSeconds: 280, moodTags: ["chill"], energyScore: 0.38, popularityScore: 0.92, sourceArtist: "t-series", validated: true },
  { videoId: "dZ0fwJ1OoEA", title: "Bekhayali (Kabir Singh)", artist: "T-Series", artistNormalized: "t-series", thumbnail: "https://i.ytimg.com/vi/dZ0fwJ1OoEA/mqdefault.jpg", durationSeconds: 341, moodTags: ["chill"], energyScore: 0.30, popularityScore: 0.96, sourceArtist: "t-series", validated: true },
  // Sad
  { videoId: "kpdv3BvTz1U", title: "O Saathi (Baaghi 2)", artist: "T-Series", artistNormalized: "t-series", thumbnail: "https://i.ytimg.com/vi/kpdv3BvTz1U/mqdefault.jpg", durationSeconds: 270, moodTags: ["sad"], energyScore: 0.22, popularityScore: 0.80, sourceArtist: "t-series", validated: true },
  { videoId: "Ww1Be-m5gQY", title: "Hamari Adhuri Kahani", artist: "Sony Music India", artistNormalized: "sony music india", thumbnail: "https://i.ytimg.com/vi/Ww1Be-m5gQY/mqdefault.jpg", durationSeconds: 345, moodTags: ["sad"], energyScore: 0.20, popularityScore: 0.89, sourceArtist: "sony music india", validated: true },
  { videoId: "vUCM_0evdQY", title: "Ae Dil Hai Mushkil", artist: "Sony Music India", artistNormalized: "sony music india", thumbnail: "https://i.ytimg.com/vi/vUCM_0evdQY/mqdefault.jpg", durationSeconds: 297, moodTags: ["sad"], energyScore: 0.28, popularityScore: 0.94, sourceArtist: "sony music india", validated: true },
  { videoId: "wF289n94T9I", title: "Teri Mitti", artist: "Zee Music Company", artistNormalized: "zee music company", thumbnail: "https://i.ytimg.com/vi/wF289n94T9I/mqdefault.jpg", durationSeconds: 317, moodTags: ["sad"], energyScore: 0.35, popularityScore: 0.91, sourceArtist: "zee music company", validated: true },
  // Focus
  { videoId: "UDVtMYqUAyw", title: "Interstellar Theme Hans Zimmer", artist: "Hans Zimmer", artistNormalized: "hans zimmer", thumbnail: "https://i.ytimg.com/vi/UDVtMYqUAyw/mqdefault.jpg", durationSeconds: 240, moodTags: ["focus"], energyScore: 0.45, popularityScore: 0.85, sourceArtist: "hans zimmer", validated: true },
  { videoId: "RxabLA7UQ9k", title: "Time Hans Zimmer", artist: "Hans Zimmer", artistNormalized: "hans zimmer", thumbnail: "https://i.ytimg.com/vi/RxabLA7UQ9k/mqdefault.jpg", durationSeconds: 300, moodTags: ["focus"], energyScore: 0.30, popularityScore: 0.88, sourceArtist: "hans zimmer", validated: true },
  { videoId: "hN_q-_nGv4U", title: "Experience Ludovico Einaudi", artist: "Ludovico Einaudi", artistNormalized: "ludovico einaudi", thumbnail: "https://i.ytimg.com/vi/hN_q-_nGv4U/mqdefault.jpg", durationSeconds: 348, moodTags: ["focus"], energyScore: 0.28, popularityScore: 0.80, sourceArtist: "ludovico einaudi", validated: true },
  { videoId: "7wtfhZwyrcc", title: "Believer Imagine Dragons", artist: "Imagine Dragons", artistNormalized: "imagine dragons", thumbnail: "https://i.ytimg.com/vi/7wtfhZwyrcc/mqdefault.jpg", durationSeconds: 204, moodTags: ["focus", "hype"], energyScore: 0.85, popularityScore: 0.98, sourceArtist: "imagine dragons", validated: true },
  // Hype
  { videoId: "vBw2clyP0Kk", title: "Bala Bala Shaitan Ka Saala", artist: "T-Series", artistNormalized: "t-series", thumbnail: "https://i.ytimg.com/vi/vBw2clyP0Kk/mqdefault.jpg", durationSeconds: 150, moodTags: ["hype"], energyScore: 0.95, popularityScore: 0.90, sourceArtist: "t-series", validated: true },
  { videoId: "qFkNATtc3mc", title: "Ghungroo (War)", artist: "YRF", artistNormalized: "yrf", thumbnail: "https://i.ytimg.com/vi/qFkNATtc3mc/mqdefault.jpg", durationSeconds: 302, moodTags: ["hype"], energyScore: 0.88, popularityScore: 0.95, sourceArtist: "yrf", validated: true },
  { videoId: "Wd2B8OAotU8", title: "Nashe Si Chadh Gayi", artist: "YRF", artistNormalized: "yrf", thumbnail: "https://i.ytimg.com/vi/Wd2B8OAotU8/mqdefault.jpg", durationSeconds: 223, moodTags: ["hype"], energyScore: 0.90, popularityScore: 0.92, sourceArtist: "yrf", validated: true },
  { videoId: "yuCBIJ7s-bE", title: "Badtameez Dil", artist: "T-Series", artistNormalized: "t-series", thumbnail: "https://i.ytimg.com/vi/yuCBIJ7s-bE/mqdefault.jpg", durationSeconds: 252, moodTags: ["hype"], energyScore: 0.92, popularityScore: 0.96, sourceArtist: "t-series", validated: true },
];

export const ensureSeedSongsLoaded = async (reason = "unknown", details = {}) => {
  try {
    const count = await getSongsCount();
    if (count === 0) {
      console.log("[SEED FALLBACK]", { reason, ...details });
      await saveSongsToPool(FRONTEND_SEED_SONGS);
    }
  } catch (error) {
    console.error("❌ [INDEXEDDB] Failed to ensure seed songs loaded:", error);
  }
};
