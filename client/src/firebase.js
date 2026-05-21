// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyB5zniwEFIX-uyEJpJyG3P05XsNVvjx6NA",
  authDomain: "moodydj-337a9.firebaseapp.com",
  projectId: "moodydj-337a9",
  storageBucket: "moodydj-337a9.firebasestorage.app",
  messagingSenderId: "153214516290",
  appId: "1:153214516290:web:011c2b5c27219cdfee01db",
  measurementId: "G-67EYTDJZWE"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export const auth = getAuth(app);
export const db = getFirestore(app);

// Explicitly set persistence to local for robust PWA behavior
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error("Auth persistence error:", error);
});