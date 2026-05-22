const admin = require("firebase-admin");

let serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT
);

// Fix Render newline issue
serviceAccount.private_key =
  serviceAccount.private_key.replace(/\\n/g, "\n");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = admin;