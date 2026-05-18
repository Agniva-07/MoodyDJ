import { useEffect, useRef, useState } from "react";

function YouTubePlayer({
  videoId,
  onStateChange,
  onTimeUpdate,
  playerRef,
  onPlayerReady, // ✅ ADD THIS
}) {
  const containerRef = useRef(null);
  const playerInstanceRef = useRef(null);
  const pollingRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const lastVideoIdRef = useRef(null);
  const failedLoadCount = useRef(0);

  // 🔥 LOAD YT API
  useEffect(() => {
    if (window.YT && window.YT.Player) return;

    const existing = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    if (existing) return;

    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(tag);
  }, []);

  // 🔥 CREATE PLAYER (ONLY ONCE)
  useEffect(() => {
    if (playerInstanceRef.current) return;

    const createPlayer = () => {
      if (!containerRef.current) return;

      const player = new window.YT.Player(containerRef.current, {
        width: 300,
        height: 170,
        videoId: "",
        playerVars: {
          autoplay: 0,
          controls: 0,
          rel: 0,
          modestbranding: 1,
          origin: window.location.origin
        },
        events: {
          onReady: (e) => {
            playerInstanceRef.current = e.target;
            failedLoadCount.current = 0;

            if (playerRef) {
              playerRef.current = e.target;
            }

            setIsReady(true);
            onPlayerReady?.();
            console.log("✅ Player Ready");
          },

          onStateChange: (e) => {
            const PLAYER_STATES = {
              '-1': 'unstarted', '0': 'ended', '1': 'playing',
              '2': 'paused', '3': 'buffering', '5': 'cued'
            };
            const state = e.data;
            console.log(`🎮 State: ${PLAYER_STATES[state] || state}`);

            if (state === -1) {
              failedLoadCount.current += 1;
              if (failedLoadCount.current >= 2) {
                console.log("⚠️ Video failed to load twice. Skipping.");
                onStateChange?.(0); // Trigger next
              }
            } else if (state === 1) {
              failedLoadCount.current = 0;
            }

            onStateChange?.(state);
          },

          onError: (e) => {
            const YT_ERRORS = {
              2: 'invalid parameter',
              5: 'html5 player error', 
              100: 'video not found',
              101: 'not allowed in embedded players',
              150: 'not allowed in embedded players'
            };
            const errorCode = e.data;
            console.error(`❌ YT Player Error: ${YT_ERRORS[errorCode] || errorCode}`);
            
            // Auto skip on major errors
            if (errorCode === 100 || errorCode === 150 || errorCode === 101) {
              onStateChange?.(0); // Skip silently
            } else {
              onStateChange?.(0); // Fallback skip
            }
          }
        },
      });
    };

    if (window.YT && window.YT.Player) {
      createPlayer();
    } else {
      window.onYouTubeIframeAPIReady = createPlayer;
    }
  }, []);

  // 🔥 LOAD VIDEO
  useEffect(() => {
    if (!isReady || !videoId) return;

    if (lastVideoIdRef.current === videoId) return;
    lastVideoIdRef.current = videoId;
    failedLoadCount.current = 0;

    console.log("📹 Load:", videoId);

    try {
      if (playerInstanceRef.current && typeof playerInstanceRef.current.loadVideoById === 'function') {
        playerInstanceRef.current.loadVideoById(videoId);
      }
    } catch (err) {
      console.error("Failed to load video:", err.message);
    }
  }, [videoId, isReady]);

  // 🔥 POLLING
  useEffect(() => {
    if (!isReady) return;
    if (pollingRef.current) return;

    console.log("📊 Start polling");

    pollingRef.current = setInterval(() => {
      try {
        const player = playerInstanceRef.current;
        if (!player || typeof player.getCurrentTime !== 'function') return;

        const current = player.getCurrentTime();
        const duration = player.getDuration();

        if (duration > 0) {
          onTimeUpdate?.(current, duration);
        }
      } catch (err) {
        // Silently catch postMessage errors during polling
      }
    }, 500);

    return () => {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
      console.log("⏹️ Stop polling");
    };
  }, [isReady]);

  // 🔥 CLEANUP
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);

      try {
        if (playerInstanceRef.current && typeof playerInstanceRef.current.destroy === 'function') {
          playerInstanceRef.current.destroy();
        }
      } catch (err) {
        console.error("Cleanup error:", err.message);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: "300px",
        height: "170px",
        opacity: 0.01,
        pointerEvents: "none",
        position: "absolute",
        top: 0,
        left: 0,
        zIndex: -1,
      }}
    />
  );
}

export default YouTubePlayer;