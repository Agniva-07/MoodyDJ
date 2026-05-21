import React, { useState } from 'react';
import AddToPlaylistModal from './playlist/AddToPlaylistModal';
import SongMenu from './SongMenu';

function QueuePanel({ songs, currentIndex, onSelect, recentSongs = [], onAddToQueue, onRefreshList }) {
  const [playlistSong, setPlaylistSong] = useState(null);
  const initialsForSong = (song) =>
    (song?.title || song?.channelTitle || "MD")
      .split(" ")
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();

  return (
    <aside className="queue-panel fade-in">
      <div className="queue-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3>🎵 Queue</h3>
          <p>Next up in your session</p>
        </div>
        {onRefreshList && (
          <button className="refresh-queue-btn" onClick={onRefreshList} title="Refresh Queue">
            🔄 Refresh
          </button>
        )}
      </div>

      <div className="queue-list">
        {songs.length === 0 ? (
          <div className="queue-song empty">No songs in queue</div>
        ) : (
          songs.map((song, index) => (
            <div
              key={song.videoId}
              className={`queue-song ${index === currentIndex ? "active" : ""}`}
              onClick={() => onSelect(index)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(index);
                }
              }}
              aria-label={`Play: ${song.title}`}
            >
              <span className="queue-index">{index === currentIndex ? "▶" : String(index + 1).padStart(2, "0")}</span>
              <div className="queue-thumb" aria-hidden="true">
                {song.thumbnail ? <img src={song.thumbnail} alt="" /> : <span>{initialsForSong(song)}</span>}
              </div>
              <div className="queue-copy">
                <strong>{song.title}</strong>
                <p>{song.channelTitle || "YouTube"}</p>
              </div>
              <SongMenu 
                song={song}
                onAddToQueue={onAddToQueue}
                onAddToPlaylist={setPlaylistSong}
              />
            </div>
          ))
        )}
      </div>

      <div className="recent-section">
        <h4>Recently Played</h4>
        <div className="recent-list">
          {recentSongs.length === 0 ? (
            <p>No recent tracks yet.</p>
          ) : (
            recentSongs.slice(0, 6).map((song) => (
              <div key={`recent-${song.videoId}`} className="recent-item">
                <div className="recent-item__thumb" aria-hidden="true">
                  {song.thumbnail ? <img src={song.thumbnail} alt="" /> : <span>{initialsForSong(song)}</span>}
                </div>
                <div className="recent-item__copy">
                  <strong>{song.title || "Untitled track"}</strong>
                  <span>{song.channelTitle || "YouTube"}</span>
                </div>
                <SongMenu 
                  song={song}
                  onAddToQueue={onAddToQueue}
                  onAddToPlaylist={setPlaylistSong}
                />
              </div>
            ))
          )}
        </div>
      </div>

      <AddToPlaylistModal 
        isOpen={!!playlistSong} 
        song={playlistSong} 
        onClose={() => setPlaylistSong(null)} 
      />
    </aside>
  );
}

export default QueuePanel;
