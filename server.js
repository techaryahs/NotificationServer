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

  const { title, body, token } = req.body;

  if (!token) {
    return res.status(400).send({
      success: false,
      error: "Token is required"
    });
  }

  try {

    const message = {

      token: token,

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

    const response = await admin.messaging().send(message);

    console.log("Notification sent:", response);

    res.send({
      success: true,
      messageId: response
    });

  } catch (error) {

    console.error(error);

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
