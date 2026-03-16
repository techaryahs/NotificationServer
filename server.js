const admin = require("firebase-admin");
const express = require("express");
const fs = require("fs");
const path = require("path");
require('dotenv').config();

const app = express();
app.use(express.json());

// Initialize Firebase Admin SDK
let serviceAccount;
try {
  // Check if running on Render (production)
  if (fs.existsSync('/etc/secrets/firebase-admin-key.json')) {
    serviceAccount = require('/etc/secrets/firebase-admin-key.json');
    console.log('Using Firebase credentials from /etc/secrets/');
  } else {
    // Local development
    serviceAccount = require('./firebase-admin-key.json');
    console.log('Using local Firebase credentials');
  }
} catch (error) {
  console.error('Error loading Firebase credentials:', error);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});


app.post("/send", async (req, res) => {
  const { title, body, userId } = req.body;

  try {

    let tokens = [];

    // 1️⃣ If userId provided → send to specific user
    if (userId) {

      const snap = await admin
        .database()
        .ref(`salonandspa/customer/${userId}/fcmToken`)
        .once("value");

      const token = snap.val();

      if (!token) {
        return res.status(404).send({
          success: false,
          error: "User token not found"
        });
      }

      tokens.push(token);

    } else {

      // 2️⃣ Otherwise broadcast to all users
      const snapshot = await admin
        .database()
        .ref("salonandspa/customer")
        .once("value");

      const users = snapshot.val();

      if (!users) {
        return res.status(400).send({
          success: false,
          error: "No users found"
        });
      }

      Object.values(users).forEach(user => {
        if (user.fcmToken) {
          tokens.push(user.fcmToken);
        }
      });
    }

    console.log(`Sending notification to ${tokens.length} device(s)`);

    const results = await Promise.allSettled(
      tokens.map(token =>
        admin.messaging().send({
          token,
          notification: { title, body }
        })
      )
    );

    const successCount = results.filter(r => r.status === "fulfilled").length;
    const failureCount = results.filter(r => r.status === "rejected").length;

    res.send({
      success: true,
      successCount,
      failureCount
    });

  } catch (err) {
    res.status(500).send({
      success: false,
      error: err.message
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`FCM server running on port ${PORT}`));