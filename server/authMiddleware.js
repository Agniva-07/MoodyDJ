/**
 * Firebase Auth token verification middleware.
 * Extracts uid from the verified token and attaches it to req.authenticatedUid.
 * Falls back to req.body.userId for backwards compatibility when no token is present.
 */
const { admin } = require("./firebaseAdmin");

const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const idToken = authHeader.split("Bearer ")[1];
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      req.authenticatedUid = decodedToken.uid;
    } catch (err) {
      console.warn("⚠️ Token verification failed:", err.message);
      // Don't block — fall through to body userId for backward compat
    }
  }

  // Fallback: trust body userId if no token was verified (backward compatible)
  if (!req.authenticatedUid && req.body?.userId) {
    req.authenticatedUid = req.body.userId;
  }

  next();
};

module.exports = { verifyFirebaseToken };
