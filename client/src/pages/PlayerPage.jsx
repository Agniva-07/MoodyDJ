import { motion, useReducedMotion } from "framer-motion";
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
  dislikedArtists,
  liked,
  disliked,
  playerRef,
  onAddToQueue,
  onRefreshList,
}) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="player-page">
      <Navbar moods={moods} activeMood={selectedMood} onMoodSelect={onMoodSelect} />

      <main className="player-layout">
        <motion.div
          className="player-shell"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 28 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
        >
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
            dislikedArtists={dislikedArtists}
            liked={liked}
            disliked={disliked}
            playerRef={playerRef}
            onAddToQueue={onAddToQueue}
          />
        </motion.div>

        <motion.div
          className="queue-shell"
          initial={prefersReducedMotion ? false : { opacity: 0, x: 24 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1, x: 0 }}
          transition={{ duration: 0.55, delay: 0.08, ease: [0.4, 0, 0.2, 1] }}
        >
          <QueuePanel
            songs={songs}
            currentIndex={currentIndex}
            onSelect={onSelectSong}
            recentSongs={recentSongs}
            onAddToQueue={onAddToQueue}
            onRefreshList={onRefreshList}
          />
        </motion.div>
      </main>
    </div>
  );
}

export default PlayerPage;
