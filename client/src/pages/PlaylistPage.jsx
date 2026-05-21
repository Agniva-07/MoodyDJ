import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { usePlaylist } from '../context/PlaylistContext';
import { useToast } from '../context/ToastContext';
import AddToPlaylistModal from '../components/playlist/AddToPlaylistModal';
import SongMenu from '../components/SongMenu';
import '../components/playlist/Playlist.css';

const PlaylistPage = ({ onPlaySongs, onAddToQueue }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { 
    playlists, 
    playlistsLoaded, 
    fetchPlaylists, 
    getPlaylistSongs,
    removeSongFromPlaylist,
    deletePlaylist,
    updatePlaylist,
    fetchSongMetadata
  } = usePlaylist();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [playlistSong, setPlaylistSong] = useState(null);

  useEffect(() => {
    if (!playlistsLoaded) {
      fetchPlaylists();
    }
  }, [playlistsLoaded, fetchPlaylists]);

  const playlist = useMemo(() => playlists.find(p => p.id === id), [playlists, id]);

  useEffect(() => {
    if (playlist && playlist.songIds && playlist.songIds.length > 0) {
      fetchSongMetadata(playlist.songIds);
    }
  }, [playlist, fetchSongMetadata]);

  const songs = useMemo(() => playlist ? getPlaylistSongs(id) : [], [playlist, getPlaylistSongs, id]);

  useEffect(() => {
    if (playlist && !isEditing) {
      setEditName(playlist.name);
      setEditDesc(playlist.description || '');
    }
  }, [playlist, isEditing]);

  if (!playlistsLoaded) {
    return (
      <div className="landing-page">
        <Navbar />
        <div className="bg-overlay" />
        <div className="animated-gradient" />
        <div style={{ zIndex: 10, textAlign: 'center', color: '#e0f2fe' }}>Loading...</div>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="landing-page">
        <Navbar />
        <div className="bg-overlay" />
        <div className="animated-gradient" />
        <div style={{ zIndex: 10, textAlign: 'center' }}>
          <h2 style={{ color: '#e0f2fe', marginBottom: '1rem' }}>Playlist not found</h2>
          <button className="blend-start-btn" onClick={() => navigate('/profile')}>Go to Profile</button>
        </div>
      </div>
    );
  }

  const handlePlayAll = () => {
    if (songs.length === 0) return;
    onPlaySongs(songs, 0);
  };

  const handleShufflePlay = () => {
    if (songs.length === 0) return;
    const shuffled = [...songs].sort(() => Math.random() - 0.5);
    onPlaySongs(shuffled, 0);
  };

  const handlePlaySong = (index) => {
    onPlaySongs(songs, index);
  };

  const handleAddAllToQueue = () => {
    if (songs.length === 0) return;
    songs.forEach(song => onAddToQueue(song));
    showToast(`Added ${songs.length} songs to queue`, 'success');
  };

  const handleDeletePlaylist = async () => {
    const success = await deletePlaylist(playlist.id);
    if (success) {
      navigate('/profile');
    }
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) return;
    const success = await updatePlaylist(playlist.id, { 
      name: editName.trim(), 
      description: editDesc.trim() 
    });
    if (success) setIsEditing(false);
  };

  const handleTogglePin = () => {
    updatePlaylist(playlist.id, { pinned: !playlist.pinned });
  };

  const formattedDate = playlist.createdAt && playlist.createdAt.toDate 
    ? playlist.createdAt.toDate().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'Recently';

  return (
    <div className="landing-page" style={{ alignItems: 'flex-start', paddingTop: '6rem' }}>
      <Navbar />
      <div className="bg-overlay" />
      <div className="animated-gradient" />

      <section className="landing-content fade-in" style={{ maxWidth: '700px', margin: '0 auto', width: '100%' }}>
        
        <div className="playlist-page-header">
          <div className="playlist-page-cover" style={{ background: playlist.coverGradient || '#7c3aed' }}>
            <span>🎵</span>
          </div>
          
          <div className="playlist-page-info">
            <p className="meta">
              Playlist • {playlist.songCount || 0} songs • Created {formattedDate}
            </p>
            
            {isEditing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                <input 
                  className="playlist-input" 
                  value={editName} 
                  onChange={e => setEditName(e.target.value)} 
                  placeholder="Playlist Name"
                  autoFocus
                />
                <textarea 
                  className="playlist-input" 
                  value={editDesc} 
                  onChange={e => setEditDesc(e.target.value)} 
                  placeholder="Description (optional)"
                  style={{ minHeight: '60px' }}
                />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="play-all-btn" onClick={handleSaveEdit} disabled={!editName.trim()}>Save</button>
                  <button className="playlist-action-btn" onClick={() => setIsEditing(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <h1>{playlist.name}</h1>
                {playlist.description && <p className="desc">{playlist.description}</p>}
                
                <div className="playlist-header-actions">
                  <button className="play-all-btn" onClick={handlePlayAll} disabled={songs.length === 0}>
                    ▶ Play All
                  </button>
                  <button className="playlist-action-btn" onClick={handleShufflePlay} disabled={songs.length === 0} title="Shuffle Play">
                    🔀
                  </button>
                  <button className="playlist-action-btn" onClick={handleAddAllToQueue} disabled={songs.length === 0} title="Add all to queue">
                    ➕
                  </button>
                  <button className="playlist-action-btn" onClick={handleTogglePin} title={playlist.pinned ? "Unpin" : "Pin"}>
                    {playlist.pinned ? "📌 Unpin" : "📌 Pin"}
                  </button>
                  <button className="playlist-action-btn" onClick={() => setIsEditing(true)} title="Edit">
                    ✏️
                  </button>
                  <button className="playlist-action-btn" onClick={() => setShowConfirmDelete(!showConfirmDelete)} title="Delete">
                    🗑
                  </button>
                </div>

                {showConfirmDelete && (
                  <div className="delete-confirm">
                    <span style={{ color: '#ef4444', fontSize: '0.9rem' }}>Are you sure?</span>
                    <button className="playlist-action-btn" style={{ borderColor: '#ef4444', color: '#ef4444', padding: '0.3rem 0.8rem' }} onClick={handleDeletePlaylist}>Yes, Delete</button>
                    <button className="playlist-action-btn" style={{ padding: '0.3rem 0.8rem' }} onClick={() => setShowConfirmDelete(false)}>Cancel</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="playlist-song-list">
          {songs.length === 0 ? (
            <div className="playlist-empty">
              No songs in this playlist yet. Add songs from the player or home page!
            </div>
          ) : (
            songs.map((song, index) => (
              <div 
                key={`${song.videoId}-${index}`} 
                className="playlist-song-item"
                onClick={() => handlePlaySong(index)}
                style={{ cursor: 'pointer' }}
              >
                <div style={{ color: '#94a3b8', width: '20px', textAlign: 'center', fontSize: '0.85rem' }}>
                  {index + 1}
                </div>
                
                {song.thumbnail ? (
                  <img src={song.thumbnail} alt="" className="playlist-song-thumb" />
                ) : (
                  <div className="playlist-song-thumb" style={{ display: 'grid', placeItems: 'center' }}>
                    <span style={{ fontSize: '1.5rem', color: '#94a3b8' }}>♪</span>
                  </div>
                )}
                
                <div className="playlist-song-info">
                  <h4>{song.title}</h4>
                  <p>{song.channelTitle}</p>
                </div>
                
                <SongMenu 
                  song={song}
                  onAddToQueue={(song) => {
                    onAddToQueue(song);
                    showToast("Added to queue", "success");
                  }}
                  onAddToPlaylist={setPlaylistSong}
                  onRemove={() => removeSongFromPlaylist(playlist.id, song.videoId)}
                  removeLabel="Remove from Playlist"
                />
              </div>
            ))
          )}
        </div>
        
        <div style={{ textAlign: 'center', marginTop: '3rem', marginBottom: '2rem' }}>
          <button className="playlist-action-btn" onClick={() => navigate('/profile')}>
            ← Back to Profile
          </button>
        </div>

      </section>
      <AddToPlaylistModal 
        isOpen={!!playlistSong} 
        song={playlistSong} 
        onClose={() => setPlaylistSong(null)} 
      />
    </div>
  );
};

export default PlaylistPage;
