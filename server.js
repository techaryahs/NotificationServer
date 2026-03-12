const admin = require("firebase-admin");
const express = require("express");
const fs = require("fs");
require("dotenv").config();

const app = express();
app.use(express.json());

/* ----------------------------------------------------
   Initialize Firebase Admin SDK
---------------------------------------------------- */

let serviceAccount;

try {

  if (fs.existsSync("/etc/secrets/firebase-admin-key.json")) {

    serviceAccount = require("/etc/secrets/firebase-admin-key.json");
    console.log("Using Firebase credentials from /etc/secrets/");

  } else {

    serviceAccount = require("./firebase-admin-key.json");
    console.log("Using local Firebase credentials");

  }

} catch (error) {

  console.error("Error loading Firebase credentials:", error);
  process.exit(1);

}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

/* ----------------------------------------------------
   Send Notification API
---------------------------------------------------- */

app.post("/send", async (req, res) => {

  const { title, body } = req.body;

  if (!title || !body) {
    return res.status(400).send({
      success: false,
      error: "Title and body are required"
    });
  }

  try {

    /* Fetch tokens from database */

    const snapshot = await admin
      .database()
      .ref("salonandspa/user_tokens")
      .once("value");

    const tokensData = snapshot.val();

    if (!tokensData) {
      return res.status(400).send({
        success: false,
        error: "No tokens found in database"
      });
    }

    const tokens = [];

    Object.values(tokensData).forEach(device => {

      if (device.token) {
        tokens.push(device.token);
      }

    });

    console.log(`Sending notification to ${tokens.length} devices`);

    if (tokens.length === 0) {
      return res.status(400).send({
        success: false,
        error: "No valid tokens found"
      });
    }

    /* Notification payload */

    const message = {

      tokens: tokens,

      notification: {
        title: title,
        body: body
      },

      android: {
        priority: "high"
      },

      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1
          }
        }
      }

    };

    /* Send notifications */

    const response = await admin
      .messaging()
      .sendEachForMulticast(message);

    console.log("Success:", response.successCount);
    console.log("Failure:", response.failureCount);

    res.send({
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount
    });

  } catch (error) {

    console.error("Error sending notification:", error);

    res.status(500).send({
      success: false,
      error: error.message
    });

  }

});

/* ----------------------------------------------------
   Start Server
---------------------------------------------------- */

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`FCM server running on port ${PORT}`);
});