import Navbar from "../components/Navbar";
import PlayerCard from "../components/PlayerCard";
import QueuePanel from "../components/QueuePanel";

function PlayerPage({
  moods,
  selectedMood,
  songs,
  currentIndex,
  currentSong,
  isPlaying,
  stats,
  shuffle,
  onMoodSelect,
  onPlayPause,
  onPrev,
  onNext,
  onShuffle,
  onLike,
  onDislike,
  onSelectSong,
  recentSongs,
  likedKeywords,
  dislikedKeywords,
  liked,
  playerRef,
}) {
  return (
    <div className="player-page">
      <Navbar moods={moods} activeMood={selectedMood} onMoodSelect={onMoodSelect} />

      <main className="player-layout">
        <PlayerCard
          song={currentSong}
          isPlaying={isPlaying}
          stats={stats}
          shuffle={shuffle}
          onPlayPause={onPlayPause}
          onPrev={onPrev}
          onNext={onNext}
          onShuffle={onShuffle}
          onLike={onLike}
          onDislike={onDislike}
          likedKeywords={likedKeywords}
          dislikedKeywords={dislikedKeywords}
          liked={liked}
          playerRef={playerRef}
        />

        <QueuePanel
          songs={songs}
          currentIndex={currentIndex}
          onSelect={onSelectSong}
          recentSongs={recentSongs}
        />
      </main>
    </div>
  );
}

export default PlayerPage;
