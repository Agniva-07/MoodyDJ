import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { db, auth } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { ARTISTS_DATA } from "../data/artists";
import { getSongsCount } from "../services/dbService";

const ArtistContext = createContext();

export const useArtists = () => useContext(ArtistContext);

export const ArtistProvider = ({ children }) => {
  const [selectedArtists, setSelectedArtistsRaw] = useState([]);
  const [artistsLoaded, setArtistsLoaded] = useState(false);
  const [onboardingCompletedToday, setOnboardingCompletedToday] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [lastOnboardedTimestamp, setLastOnboardedTimestamp] = useState(0);
  const [currentUid, setCurrentUid] = useState(null);

  // Listen for auth state to load artists from Firestore
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setSelectedArtistsRaw([]);
        setOnboardingCompletedToday(false);
        setOnboardingChecked(true);
        setArtistsLoaded(true);
        setCurrentUid(null);
        return;
      }

      setCurrentUid(user.uid);

      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          const data = snap.data();

          // Load selected artists
          if (data.selectedArtists && data.selectedArtists.length > 0) {
            setSelectedArtistsRaw(data.selectedArtists);
            localStorage.setItem("selectedArtists", JSON.stringify(data.selectedArtists));
          } else {
            const local = localStorage.getItem("selectedArtists");
            if (local) setSelectedArtistsRaw(JSON.parse(local));
          }

          // Check if local database is empty. If so, force onboarding.
          const count = await getSongsCount();
          if (count === 0) {
            console.log("💾 [INDEXEDDB] Empty master pool. Resetting onboardingCompletedToday to trigger prompt.");
            setOnboardingCompletedToday(false);
          } else {
            // Check onboarding with 12-hour cycle (timestamp-based)
            const TWELVE_HOURS = 12 * 60 * 60 * 1000;
            const lastTs = data.lastOnboardedTimestamp || 0;
            setLastOnboardedTimestamp(lastTs);
            if ((Date.now() - lastTs) < TWELVE_HOURS) {
              setOnboardingCompletedToday(true);
            } else {
              setOnboardingCompletedToday(false);
            }
          }
        } else {
          const local = localStorage.getItem("selectedArtists");
          if (local) setSelectedArtistsRaw(JSON.parse(local));
          setOnboardingCompletedToday(false);
        }
      } catch (err) {
        console.error("Failed to load artists from Firestore:", err);
        const local = localStorage.getItem("selectedArtists");
        if (local) setSelectedArtistsRaw(JSON.parse(local));
        setOnboardingCompletedToday(false);
      }

      setOnboardingChecked(true);
      setArtistsLoaded(true);
    });

    return () => unsubscribe();
  }, []);

  // Periodically check if 12 hours have passed since last onboarding to trigger daily prompt instantly
  useEffect(() => {
    if (!lastOnboardedTimestamp) return;

    const interval = setInterval(() => {
      const TWELVE_HOURS = 12 * 60 * 60 * 1000;
      if (Date.now() - lastOnboardedTimestamp >= TWELVE_HOURS) {
        if (onboardingCompletedToday) {
          console.log("⏰ 12 hours have passed since last onboarding. Resetting onboardingCompletedToday to false.");
          setOnboardingCompletedToday(false);
        }
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [lastOnboardedTimestamp, onboardingCompletedToday]);

  // Persist to both Firestore + localStorage — SINGLE write path
  const updateArtists = useCallback(async (newArtists) => {
    setSelectedArtistsRaw(newArtists);
    localStorage.setItem("selectedArtists", JSON.stringify(newArtists));

    if (currentUid) {
      try {
        await setDoc(doc(db, "users", currentUid), {
          selectedArtists: newArtists,
        }, { merge: true });
      } catch (err) {
        console.error("Failed to sync artists to Firestore:", err);
      }
    }
  }, [currentUid]);

  // Mark onboarding as completed today — writes to Firestore
  const completeOnboarding = useCallback(async (artistIds) => {
    setSelectedArtistsRaw(artistIds);
    localStorage.setItem("selectedArtists", JSON.stringify(artistIds));

    const today = new Date().toLocaleDateString("en-CA");
    const nowTs = Date.now();

    if (currentUid) {
      try {
        await setDoc(doc(db, "users", currentUid), {
          selectedArtists: artistIds,
          lastOnboardedDate: today,
          lastOnboardedTimestamp: nowTs,
        }, { merge: true });
        setOnboardingCompletedToday(true);
        setLastOnboardedTimestamp(nowTs);
      } catch (err) {
        console.error("Failed to save onboarding to Firestore:", err);
      }
    }

    localStorage.setItem("lastDailyArtistPrompt", nowTs.toString());
  }, [currentUid]);

  // Helper: resolve artist IDs to display names
  const getArtistNames = useCallback(() => {
    return selectedArtists.map((id) => {
      const found = ARTISTS_DATA.find((a) => a.id === id);
      return found ? found.name : id;
    });
  }, [selectedArtists]);

  return (
    <ArtistContext.Provider
      value={{
        selectedArtists,
        setSelectedArtists: updateArtists,
        artistsLoaded,
        getArtistNames,
        onboardingCompletedToday,
        onboardingChecked,
        completeOnboarding,
        currentUid,
      }}
    >
      {children}
    </ArtistContext.Provider>
  );
};
