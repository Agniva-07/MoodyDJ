import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { playlistService } from '../services/playlistService';
import { useToast } from './ToastContext';
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

const PlaylistContext = createContext();

export const usePlaylist = () => useContext(PlaylistContext);

export const PlaylistProvider = ({ children }) => {
  const [playlists, setPlaylists] = useState([]);
  const [playlistsLoaded, setPlaylistsLoaded] = useState(false);
  const [songMetadataCache, setSongMetadataCache] = useState(new Map());
  const { showToast } = useToast();
  
  const currentUserId = useRef(null);

  // Load user from localStorage
  useEffect(() => {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        currentUserId.current = JSON.parse(userStr).uid;
      }
    } catch (e) {
      console.error("Failed to parse user for playlist context", e);
    }
  }, []);

  // Initialize song metadata cache from localStorage
  useEffect(() => {
    try {
      const cached = localStorage.getItem('moodydj_song_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        const map = new Map();
        Object.keys(parsed).forEach(key => map.set(key, parsed[key]));
        setSongMetadataCache(map);
      }
    } catch (e) {
      console.error("Failed to load song cache", e);
    }
  }, []);

  const cacheSongMetadata = useCallback((song) => {
    if (!song || !song.videoId) return;
    
    setSongMetadataCache(prev => {
      const next = new Map(prev);
      next.set(song.videoId, {
        videoId: song.videoId,
        title: song.title,
        channelTitle: song.channelTitle,
        thumbnail: song.thumbnail,
        duration: song.duration
      });
      
      // Save to localStorage with safe eviction to avoid storage overflow
      let limit = 500;
      let success = false;
      
      while (limit >= 50 && !success) {
        const obj = {};
        let count = 0;
        const entries = Array.from(next.entries()).reverse();
        for (const [k, v] of entries) {
          if (count >= limit) break;
          obj[k] = v;
          count++;
        }
        
        try {
          localStorage.setItem('moodydj_song_cache', JSON.stringify(obj));
          success = true;
        } catch (e) {
          // If quota exceeded, reduce cache size and try again
          limit = Math.floor(limit / 2);
        }
      }
      
      return next;
    });
  }, []);

  const getSongMetadata = useCallback((videoId) => {
    return songMetadataCache.get(videoId) || null;
  }, [songMetadataCache]);

  const fetchPlaylists = useCallback(async (force = false) => {
    const userId = currentUserId.current;
    if (!userId) return;
    
    // Check cache first if not forcing
    if (!force) {
      try {
        const cached = localStorage.getItem(`moodydj_playlists_${userId}`);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          const age = Date.now() - timestamp;
          if (age < 5 * 60 * 1000) { // 5 minutes cache
            setPlaylists(data);
            setPlaylistsLoaded(true);
            return;
          }
        }
      } catch (e) {
        // Ignore cache errors
      }
    }
    
    // Fetch from Firestore
    try {
      const data = await playlistService.getUserPlaylists(userId);
      setPlaylists(data);
      setPlaylistsLoaded(true);
      
      // Update cache
      localStorage.setItem(`moodydj_playlists_${userId}`, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error("Failed to fetch playlists:", error);
      showToast("Failed to load playlists", "error");
    }
  }, [showToast]);

  const createPlaylist = async (name, description) => {
    const userId = currentUserId.current;
    if (!userId) return null;
    
    try {
      const newPlaylist = await playlistService.createPlaylist(userId, { name, description });
      
      // Optimistic update
      setPlaylists(prev => {
        const next = [newPlaylist, ...prev];
        localStorage.setItem(`moodydj_playlists_${userId}`, JSON.stringify({
          data: next,
          timestamp: Date.now()
        }));
        return next;
      });
      
      showToast("Playlist created successfully", "success");
      return newPlaylist;
    } catch (error) {
      showToast("Failed to create playlist", "error");
      return null;
    }
  };

  const addSongToPlaylist = async (playlistId, song) => {
    const userId = currentUserId.current;
    if (!userId) return false;
    
    // Cache the song metadata first
    cacheSongMetadata(song);
    
    const playlist = playlists.find(p => p.id === playlistId);
    if (!playlist) return false;
    
    if (playlist.songIds && playlist.songIds.includes(song.videoId)) {
      showToast("Song already in playlist", "info");
      return false;
    }
    
    const newSongCount = (playlist.songCount || 0);
    
    // Optimistic update
    setPlaylists(prev => {
      const next = prev.map(p => {
        if (p.id === playlistId) {
          return {
            ...p,
            songIds: [...(p.songIds || []), song.videoId],
            songCount: newSongCount + 1
          };
        }
        return p;
      });
      
      localStorage.setItem(`moodydj_playlists_${userId}`, JSON.stringify({
        data: next,
        timestamp: Date.now()
      }));
      
      return next;
    });
    
    try {
      await playlistService.addSongToPlaylist(userId, playlistId, song.videoId, newSongCount);
      showToast("Added to playlist", "success");
      return true;
    } catch (error) {
      // Revert on failure (simplified)
      fetchPlaylists(true);
      showToast("Failed to add song", "error");
      return false;
    }
  };

  const removeSongFromPlaylist = async (playlistId, songId) => {
    const userId = currentUserId.current;
    if (!userId) return false;
    
    const playlist = playlists.find(p => p.id === playlistId);
    if (!playlist) return false;
    
    const newSongCount = (playlist.songCount || 0);
    
    // Optimistic update
    setPlaylists(prev => {
      const next = prev.map(p => {
        if (p.id === playlistId) {
          return {
            ...p,
            songIds: (p.songIds || []).filter(id => id !== songId),
            songCount: Math.max(0, newSongCount - 1)
          };
        }
        return p;
      });
      
      localStorage.setItem(`moodydj_playlists_${userId}`, JSON.stringify({
        data: next,
        timestamp: Date.now()
      }));
      
      return next;
    });
    
    try {
      await playlistService.removeSongFromPlaylist(userId, playlistId, songId, newSongCount);
      showToast("Song removed", "success");
      return true;
    } catch (error) {
      fetchPlaylists(true);
      showToast("Failed to remove song", "error");
      return false;
    }
  };

  const deletePlaylist = async (playlistId) => {
    const userId = currentUserId.current;
    if (!userId) return false;
    
    // Optimistic update
    setPlaylists(prev => {
      const next = prev.filter(p => p.id !== playlistId);
      
      localStorage.setItem(`moodydj_playlists_${userId}`, JSON.stringify({
        data: next,
        timestamp: Date.now()
      }));
      
      return next;
    });
    
    try {
      await playlistService.deletePlaylist(userId, playlistId);
      showToast("Playlist deleted", "success");
      return true;
    } catch (error) {
      fetchPlaylists(true);
      showToast("Failed to delete playlist", "error");
      return false;
    }
  };
  
  const updatePlaylist = async (playlistId, updates) => {
    const userId = currentUserId.current;
    if (!userId) return false;
    
    // Optimistic update
    setPlaylists(prev => {
      const next = prev.map(p => {
        if (p.id === playlistId) {
          return { ...p, ...updates };
        }
        return p;
      });
      
      localStorage.setItem(`moodydj_playlists_${userId}`, JSON.stringify({
        data: next,
        timestamp: Date.now()
      }));
      
      return next;
    });
    
    try {
      await playlistService.updatePlaylist(userId, playlistId, updates);
      showToast("Playlist updated", "success");
      return true;
    } catch (error) {
      fetchPlaylists(true);
      showToast("Failed to update playlist", "error");
      return false;
    }
  };

  const fetchSongMetadata = useCallback(async (videoIds) => {
    if (!videoIds || videoIds.length === 0) return;
    
    let storedCache = {};
    try {
      const cached = localStorage.getItem('moodydj_song_cache');
      if (cached) {
        storedCache = JSON.parse(cached);
      }
    } catch (e) {}

    const toLoadInMemory = [];
    const missingIds = [];

    videoIds.forEach(id => {
      if (songMetadataCache.has(id)) {
        return;
      }
      if (storedCache[id]) {
        toLoadInMemory.push({ id, data: storedCache[id] });
      } else {
        missingIds.push(id);
      }
    });

    if (toLoadInMemory.length > 0) {
      setSongMetadataCache(prev => {
        const next = new Map(prev);
        toLoadInMemory.forEach(({ id, data }) => {
          next.set(id, data);
        });
        return next;
      });
    }

    if (missingIds.length === 0) return;

    try {
      const response = await axios.post(`${API_BASE}/api/songs/metadata`, {
        videoIds: missingIds
      });
      
      if (response.data && response.data.songs) {
        response.data.songs.forEach(song => {
          cacheSongMetadata(song);
        });
      }
    } catch (error) {
      console.error("Failed to fetch song metadata:", error);
    }
  }, [songMetadataCache, cacheSongMetadata]);

  const getPlaylistSongs = useCallback((playlistId) => {
    const playlist = playlists.find(p => p.id === playlistId);
    if (!playlist || !playlist.songIds) return [];
    
    return playlist.songIds.map(id => {
      const meta = getSongMetadata(id);
      return meta || { videoId: id, title: "Unknown Song", channelTitle: "Loading...", thumbnail: "" };
    });
  }, [playlists, getSongMetadata]);

  return (
    <PlaylistContext.Provider value={{
      playlists,
      playlistsLoaded,
      fetchPlaylists,
      createPlaylist,
      addSongToPlaylist,
      removeSongFromPlaylist,
      deletePlaylist,
      updatePlaylist,
      cacheSongMetadata,
      getSongMetadata,
      getPlaylistSongs,
      fetchSongMetadata
    }}>
      {children}
    </PlaylistContext.Provider>
  );
};
