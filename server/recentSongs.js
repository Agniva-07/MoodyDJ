const { initFirebaseAdmin } = require("./firebaseAdmin");

const MAX_RECENT_SONGS = 40;

const getRecentSongs = async (userId) => {
  if (!userId) return [];

  const db = initFirebaseAdmin();
  if (!db) return [];

  try {
    const userRef = db.collection("users").doc(userId);
    const snap = await userRef.get();
    if (!snap.exists) return [];

    const data = snap.data() || {};
    return Array.isArray(data.recentSongs) ? data.recentSongs : [];
  } catch (error) {
    console.error("Failed to fetch recent songs:", error.message);
    return [];
  }
};

const addRecentSongs = async (userId, videoIds = []) => {
  if (!userId || !Array.isArray(videoIds) || videoIds.length === 0) return;

  const db = initFirebaseAdmin();
  if (!db) return;

  try {
    const userRef = db.collection("users").doc(userId);
    const snap = await userRef.get();
    const currentRecent = snap.exists && Array.isArray(snap.data()?.recentSongs)
      ? snap.data().recentSongs
      : [];

    const now = Date.now();
    const incoming = videoIds
      .filter(Boolean)
      .map((videoId, index) => ({ videoId, ts: now + index }));

    const merged = new Map();
    [...incoming, ...currentRecent].forEach((entry) => {
      if (!entry?.videoId || merged.has(entry.videoId)) return;
      merged.set(entry.videoId, entry);
    });

    await userRef.set(
      {
        recentSongs: Array.from(merged.values()).slice(0, MAX_RECENT_SONGS),
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Failed to add recent songs:", error.message);
  }
};

module.exports = {
  getRecentSongs,
  addRecentSongs,
  MAX_RECENT_SONGS,
};
