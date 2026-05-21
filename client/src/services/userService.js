import { db } from "../firebase";
import { doc, getDoc, setDoc, updateDoc, runTransaction, increment, serverTimestamp, collection, getDocs } from "firebase/firestore";

export const syncUserToFirestore = async (user) => {
  if (!user || !user.uid) return;
  try {
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      await setDoc(userRef, {
        name: user.displayName || "User",
        email: user.email || "",
        photo: user.photoURL || "",
        createdAt: serverTimestamp(),
        selectedArtists: [],
        liked: [],
        disliked: [],
        history: [],
        totalSongsPlayed: 0,
        totalListeningTime: 0,
      });
    }
  } catch (error) {
    console.error("Error creating user document:", error);
  }
};

export const getUserData = async (userId) => {
  if (!userId) return null;
  try {
    const userRef = doc(db, "users", userId);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      return snap.data();
    }
  } catch (error) {
    console.error("Error fetching user data:", error);
  }
  return null;
};

export const syncAndGetHistory = (userId, firestoreHistory = []) => {
  if (!userId) return [];
  try {
    const localKey = `moodydj_local_history_${userId}`;
    let localHistory = [];
    try {
      const stored = localStorage.getItem(localKey);
      if (stored) {
        localHistory = JSON.parse(stored);
      }
    } catch (e) {
      console.error("Failed to parse local history from localStorage:", e);
    }

    if (!Array.isArray(localHistory)) {
      localHistory = [];
    }

    // Helper to get milliseconds from playedAt
    const getTimestampMs = (playedAt) => {
      if (!playedAt) return 0;
      if (typeof playedAt.toMillis === "function") return playedAt.toMillis();
      if (typeof playedAt.toDate === "function") return playedAt.toDate().getTime();
      if (playedAt.seconds) return playedAt.seconds * 1000;
      if (playedAt._seconds) return playedAt._seconds * 1000;
      const parsed = new Date(playedAt).getTime();
      return isNaN(parsed) ? 0 : parsed;
    };

    // Merge both lists
    const mergedMap = new Map();

    // Add local history first
    localHistory.forEach((item) => {
      if (item && item.videoId) {
        mergedMap.set(item.videoId, item);
      }
    });

    // Add Firestore history (overwrite local or add new, preferring Firestore fields if present)
    (firestoreHistory || []).forEach((item) => {
      if (item && item.videoId) {
        // If it exists, let's pick the more recent playedAt
        const existing = mergedMap.get(item.videoId);
        if (existing) {
          const tExisting = getTimestampMs(existing.playedAt);
          const tNew = getTimestampMs(item.playedAt);
          if (tNew > tExisting) {
            mergedMap.set(item.videoId, item);
          }
        } else {
          mergedMap.set(item.videoId, item);
        }
      }
    });

    // Convert back to array, sort descending by playedAt
    const mergedList = Array.from(mergedMap.values());
    mergedList.sort((a, b) => getTimestampMs(b.playedAt) - getTimestampMs(a.playedAt));

    // Cap to max 100
    const cappedList = mergedList.slice(0, 100);

    // Save back to localStorage
    try {
      localStorage.setItem(localKey, JSON.stringify(cappedList));
    } catch (e) {
      console.error("Failed to write merged history to localStorage:", e);
    }

    return cappedList;
  } catch (err) {
    console.error("Error in syncAndGetHistory:", err);
    return firestoreHistory || [];
  }
};

export const saveHistory = async (userId, song) => {
  if (!userId || !song || !song.videoId) return null;

  // 1. Update localStorage history first (prepend the song, remove duplicates, cap at 100)
  const localKey = `moodydj_local_history_${userId}`;
  let localHistory = [];
  try {
    const stored = localStorage.getItem(localKey);
    if (stored) {
      localHistory = JSON.parse(stored);
    }
  } catch (e) {}

  if (!Array.isArray(localHistory)) {
    localHistory = [];
  }

  // Remove existing duplicate
  localHistory = localHistory.filter(item => item.videoId !== song.videoId);

  const historyItem = {
    videoId: song.videoId,
    title: song.title || "Unknown Title",
    channelTitle: song.channelTitle || "Unknown Artist",
    thumbnail: song.thumbnail || "",
    playedAt: new Date().toISOString()
  };

  // Prepend and cap to 100
  localHistory.unshift(historyItem);
  const cappedLocal = localHistory.slice(0, 100);

  try {
    localStorage.setItem(localKey, JSON.stringify(cappedLocal));
  } catch (e) {
    console.error("Failed to save history to localStorage:", e);
  }

  // 2. Run the Firestore transaction (max 20 entries, totalSongsPlayed increment)
  const userRef = doc(db, "users", userId);

  try {
    const newFirestoreHistory = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(userRef);
      
      let data = {};
      if (snap.exists()) {
        data = snap.data();
      }

      let history = data.history || [];

      // Remove duplicates
      history = history.filter(item => item.videoId !== song.videoId);

      // Add new entry at top
      const firestoreHistoryItem = {
        videoId: song.videoId,
        title: song.title || "Unknown Title",
        channelTitle: song.channelTitle || "Unknown Artist",
        thumbnail: song.thumbnail || "",
        playedAt: new Date() // Store as firestore-compatible Date object
      };

      history.unshift(firestoreHistoryItem);

      // Slice to max 20
      if (history.length > 20) {
        history = history.slice(0, 20);
      }

      // Atomic transaction update — also bump totalSongsPlayed
      transaction.set(userRef, {
        history,
        totalSongsPlayed: (data?.totalSongsPlayed || 0) + 1,
      }, { merge: true });

      return history;
    });

    // 3. Merge Firestore updates with local history using syncAndGetHistory and return the full merged list
    return syncAndGetHistory(userId, newFirestoreHistory);
  } catch (error) {
    console.error("Failed to save history via transaction, falling back to local history:", error);
    // Return local history gracefully
    return cappedLocal;
  }
};

/**
 * Track listening time in seconds.
 * Call this when user skips or a song ends.
 */
export const addListeningTime = async (userId, durationSeconds) => {
  if (!userId || !durationSeconds || durationSeconds <= 0) return;
  try {
    const userRef = doc(db, "users", userId);
    await setDoc(userRef, {
      totalListeningTime: increment(Math.round(durationSeconds)),
    }, { merge: true });
  } catch (error) {
    console.error("Failed to update listening time:", error);
  }
};

export const getLikedSongs = async (userId) => {
  if (!userId) return [];
  try {
    const likedSongsRef = collection(db, "users", userId, "likedSongs");
    const snap = await getDocs(likedSongsRef);
    return snap.docs.map(doc => doc.data());
  } catch (error) {
    console.error("Error fetching liked songs:", error);
    return [];
  }
};
