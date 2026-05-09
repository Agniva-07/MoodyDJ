const admin = require("firebase-admin");

let db = null;

const initFirebaseAdmin = () => {
  if (db) return db;

  try {
    if (!admin.apps.length) {
      const serviceAccount = require("./serviceAccount.json");

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    db = admin.firestore();
    console.log("✅ Firebase connected");
    return db;
  } catch (error) {
    console.error("❌ Firebase init failed:", error.message);
    return null;
  }
};

module.exports = { initFirebaseAdmin };