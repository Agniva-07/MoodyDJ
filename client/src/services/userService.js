import { db } from "../firebase";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, runTransaction, increment } from "firebase/firestore";

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

export const saveHistory = async (userId, song) => {
  if (!userId || !song || !song.videoId) return null;

  const userRef = doc(db, "users", userId);

  try {
    const newHistory = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(userRef);
      if (!snap.exists()) {
        throw new Error("User document does not exist");
      }

      const data = snap.data();
      let history = data.history || [];

      // Remove duplicates
      history = history.filter(item => item.videoId !== song.videoId);

      // Add new entry at top
      const historyItem = {
        videoId: song.videoId,
        title: song.title || "Unknown Title",
        channelTitle: song.channelTitle || "Unknown Artist",
        thumbnail: song.thumbnail || "",
        playedAt: serverTimestamp()
      };

      history.unshift(historyItem);

      // Slice to max 50
      if (history.length > 50) {
        history = history.slice(0, 50);
      }

      // Atomic transaction update — also bump totalSongsPlayed
      transaction.update(userRef, {
        history,
        totalSongsPlayed: (data.totalSongsPlayed || 0) + 1,
      });

      return history;
    });

    return newHistory;
  } catch (error) {
    console.error("Failed to save history via transaction:", error);
    return null;
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
    await updateDoc(userRef, {
      totalListeningTime: increment(Math.round(durationSeconds)),
    });
  } catch (error) {
    console.error("Failed to update listening time:", error);
  }
};
