const admin = require("firebase-admin");
const express = require("express");
const fs = require("fs");
require("dotenv").config();

const app = express();
app.use(express.json());

/// 🔥 INIT FIREBASE
let serviceAccount;
try {
  if (fs.existsSync("/etc/secrets/firebase-admin-key.json")) {
    serviceAccount = require("/etc/secrets/firebase-admin-key.json");
    console.log("Using production Firebase key");
  } else {
    serviceAccount = require("./firebase-admin-key.json");
    console.log("Using local Firebase key");
  }
} catch (e) {
  console.error("Firebase init error:", e);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const db = admin.database();

/// 🔥 HELPER: GET USER TOKEN
async function getUserToken(userId) {
  const snap = await db
    .ref(`salonandspa/customer/${userId}/fcmToken`)
    .once("value");

  return snap.val();
}

/// 🔥 HELPER: GET STAFF TOKEN
async function getStaffToken(staffId, salonId) {
  const snap = await db
    .ref(`salonandspa/salons/${salonId}/staff/${staffId}/fcmToken`)
    .once("value");

  return snap.val();
}

/// 🔥 HELPER: GET OWNER TOKEN
async function getOwnerToken(salonId) {
  const snap = await db
    .ref(`salonandspa/salons/${salonId}/FCM/owner`)
    .once("value");

  return snap.val();
}

//////////////////////////////////////////////////////////
// 🚀 1️⃣ SINGLE / BROADCAST (YOUR EXISTING IMPROVED)
//////////////////////////////////////////////////////////

app.post("/send", async (req, res) => {
  const { title, body, userId } = req.body;

  try {
    let tokens = [];

    if (userId) {
      const token = await getUserToken(userId);

      if (!token) {
        return res.status(404).send({
          success: false,
          error: "User token not found",
        });
      }

      tokens.push(token);
    } else {
      const snapshot = await db
        .ref("salonandspa/customer")
        .once("value");

      const users = snapshot.val();

      if (!users) {
        return res.status(400).send({
          success: false,
          error: "No users found",
        });
      }

      Object.values(users).forEach((user) => {
        if (user.fcmToken) tokens.push(user.fcmToken);
      });
    }

    const response = await sendToTokens(tokens, title, body);

    res.send(response);
  } catch (err) {
    res.status(500).send({ success: false, error: err.message });
  }
});

//////////////////////////////////////////////////////////
// 🚀 2️⃣ MULTI USER (NEW)
//////////////////////////////////////////////////////////

app.post("/send-multi", async (req, res) => {
  const { title, body, userIds = [] } = req.body;

  try {
    let tokens = [];

    for (const userId of userIds) {
      const token = await getUserToken(userId);
      if (token) tokens.push(token);
    }

    if (tokens.length === 0) {
      return res.status(400).send({
        success: false,
        error: "No valid tokens found",
      });
    }

    const response = await sendToTokens(tokens, title, body);

    res.send(response);
  } catch (err) {
    res.status(500).send({ success: false, error: err.message });
  }
});

//////////////////////////////////////////////////////////
// 🚀 3️⃣ BOOKING NOTIFICATION (BEST FEATURE 🔥)
//////////////////////////////////////////////////////////

app.post("/booking-notify", async (req, res) => {
  const { title, body, customerId, staffId, salonId } = req.body;

  try {
    let tokens = [];

    /// customer
    if (customerId) {
      const token = await getUserToken(customerId);
      if (token) tokens.push(token);
    }

    /// staff
    if (staffId && salonId) {
      const token = await getStaffToken(staffId, salonId);
      if (token) tokens.push(token);
    }

    /// owner/admin
    if (salonId) {
      const token = await getOwnerToken(salonId);
      if (token) tokens.push(token);
    }

    if (tokens.length === 0) {
      return res.status(400).send({
        success: false,
        error: "No tokens found",
      });
    }

    const response = await sendToTokens(tokens, title, body);

    res.send(response);
  } catch (err) {
    res.status(500).send({ success: false, error: err.message });
  }
});

//////////////////////////////////////////////////////////
// 🔥 COMMON FUNCTION
//////////////////////////////////////////////////////////

async function sendToTokens(tokens, title, body) {
  console.log(`Sending to ${tokens.length} devices`);

  const results = await Promise.allSettled(
    tokens.map((token) =>
      admin.messaging().send({
        token,
        notification: { title, body },
      })
    )
  );

  const successCount = results.filter((r) => r.status === "fulfilled").length;
  const failureCount = results.filter((r) => r.status === "rejected").length;

  return {
    success: true,
    successCount,
    failureCount,
  };
}

//////////////////////////////////////////////////////////

const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 FCM server running on port ${PORT}`)
);