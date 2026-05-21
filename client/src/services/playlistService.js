import { db } from "../firebase";
import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp, 
  arrayUnion, 
  arrayRemove 
} from "firebase/firestore";

// Simple hash function to generate a deterministic color from a string
const generateGradient = (name) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Base hues around MoodyDJ theme (purples and blues)
  // Hue 1: 250-290 (Purple)
  // Hue 2: 190-230 (Blue/Cyan)
  const hue1 = Math.abs(hash % 40) + 250;
  const hue2 = Math.abs((hash * 2) % 40) + 190;
  
  return `linear-gradient(135deg, hsl(${hue1}, 80%, 40%), hsl(${hue2}, 80%, 40%))`;
};

export const playlistService = {
  // Get all playlists for a user
  getUserPlaylists: async (userId) => {
    if (!userId) return [];
    try {
      const playlistsRef = collection(db, "users", userId, "playlists");
      const snap = await getDocs(playlistsRef);
      return snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error("Error fetching user playlists:", error);
      return [];
    }
  },

  // Create a new playlist
  createPlaylist: async (userId, { name, description = "" }) => {
    if (!userId || !name) throw new Error("User ID and Name are required");
    
    try {
      const newDocRef = doc(collection(db, "users", userId, "playlists"));
      const playlistData = {
        name,
        description,
        coverGradient: generateGradient(name),
        songIds: [],
        songCount: 0,
        pinned: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      await setDoc(newDocRef, playlistData);
      
      return {
        id: newDocRef.id,
        ...playlistData,
        createdAt: new Date(), // Mock date for immediate optimistic UI
        updatedAt: new Date()
      };
    } catch (error) {
      console.error("Error creating playlist:", error);
      throw error;
    }
  },

  // Add a song to a playlist
  addSongToPlaylist: async (userId, playlistId, songId, currentSongCount) => {
    if (!userId || !playlistId || !songId) throw new Error("Missing required parameters");
    
    try {
      const playlistRef = doc(db, "users", userId, "playlists", playlistId);
      
      await updateDoc(playlistRef, {
        songIds: arrayUnion(songId),
        songCount: currentSongCount + 1,
        updatedAt: serverTimestamp()
      });
      
      return true;
    } catch (error) {
      console.error("Error adding song to playlist:", error);
      throw error;
    }
  },

  // Remove a song from a playlist
  removeSongFromPlaylist: async (userId, playlistId, songId, currentSongCount) => {
    if (!userId || !playlistId || !songId) throw new Error("Missing required parameters");
    
    try {
      const playlistRef = doc(db, "users", userId, "playlists", playlistId);
      
      await updateDoc(playlistRef, {
        songIds: arrayRemove(songId),
        songCount: Math.max(0, currentSongCount - 1),
        updatedAt: serverTimestamp()
      });
      
      return true;
    } catch (error) {
      console.error("Error removing song from playlist:", error);
      throw error;
    }
  },

  // Update a playlist (e.g., name, description, pinned)
  updatePlaylist: async (userId, playlistId, updates) => {
    if (!userId || !playlistId) throw new Error("Missing required parameters");
    
    try {
      const playlistRef = doc(db, "users", userId, "playlists", playlistId);
      
      await updateDoc(playlistRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });
      
      return true;
    } catch (error) {
      console.error("Error updating playlist:", error);
      throw error;
    }
  },

  // Delete a playlist
  deletePlaylist: async (userId, playlistId) => {
    if (!userId || !playlistId) throw new Error("Missing required parameters");
    
    try {
      const playlistRef = doc(db, "users", userId, "playlists", playlistId);
      await deleteDoc(playlistRef);
      return true;
    } catch (error) {
      console.error("Error deleting playlist:", error);
      throw error;
    }
  },
  
  generateGradient
};
