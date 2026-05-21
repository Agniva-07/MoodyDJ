import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Playlist.css';

const PlaylistCard = ({ playlist }) => {
  const navigate = useNavigate();
  
  if (!playlist) return null;

  const handleClick = () => {
    navigate(`/playlist/${playlist.id}`);
  };

  // Format date safely
  const formattedDate = React.useMemo(() => {
    if (!playlist.createdAt) return 'Recently';
    try {
      const date = playlist.createdAt.toDate ? playlist.createdAt.toDate() : new Date(playlist.createdAt);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) {
      return 'Recently';
    }
  }, [playlist.createdAt]);

  return (
    <div className="playlist-card" onClick={handleClick}>
      {playlist.pinned && (
        <div className="playlist-card-pin" title="Pinned">📌</div>
      )}
      
      <div 
        className="playlist-card-cover"
        style={{ background: playlist.coverGradient || '#7c3aed' }}
      >
        <span className="playlist-card-cover-icon">🎵</span>
      </div>
      
      <div className="playlist-card-info">
        <h4>{playlist.name}</h4>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p>{playlist.songCount || 0} songs</p>
          <p style={{ fontSize: '0.7rem' }}>{formattedDate}</p>
        </div>
      </div>
    </div>
  );
};

export default PlaylistCard;
