const functions = require("firebase-functions");
const admin = require("./admin");
const Razorpay = require("razorpay");

/* ============================
   🔐 RAZORPAY SETUP
============================ */

const razorpay = new Razorpay({
  key_id: functions.config().razorpay.key,
  key_secret: functions.config().razorpay.secret
});

/* ============================
   📧 QUEUE EMPLOYEE INVITE EMAIL
============================ */

exports.sendInviteEmail = functions.https.onCall(async (data, context) => {

  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Login required"
    );
  }

  const { email, name, role, signupLink } = data;

  if (!email || !signupLink) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing email or signup link"
    );
  }

  const html = `
    <h2>Hello ${name || "Employee"}</h2>

    <p>You have been invited as <b>${role}</b> on Virevo ERP.</p>

    <p>Click the button below to complete signup:</p>

    <a href="${signupLink}" style="
      padding:10px 20px;
      background:#000;
      color:#fff;
      text-decoration:none;
      border-radius:4px;
    ">
      Complete Signup
    </a>

    <p>If you did not expect this invite you can ignore this email.</p>
  `;

  try {

    const mailRef = admin.database().ref("mailQueue").push();

    await mailRef.set({

      to: email,
      subject: "Employee Invitation - Virevo ERP",
      html,

      createdAt: Date.now(),
      sent: false

    });

    return { success: true };

  } catch (error) {

    console.error("Mail Queue Error:", error);

    throw new functions.https.HttpsError(
      "internal",
      error.message
    );

  }

});

/* ============================
   👤 CREATE POS USER (ADMIN)
============================ */

exports.createUser = functions.https.onCall(async (data, context) => {

  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Login required"
    );
  }

  const adminUid = context.auth.uid;

  const adminSnap = await admin
    .database()
    .ref(`users/${adminUid}`)
    .once("value");

  if (!adminSnap.exists() || adminSnap.val().role !== "admin") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Admin access only"
    );
  }

  const { username, password, role, name } = data;

  if (!username || !password || !role) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required fields"
    );
  }

  const email = `${username}@virevo.local`;

  try {

    const userRecord = await admin.auth().createUser({
      email,
      password
    });

    await admin.database().ref(`users/${userRecord.uid}`).set({
      username,
      role,
      name: name || "",
      active: true,
      online: false,
      forceLogout: false,
      createdAt: Date.now()
    });

    await admin
      .database()
      .ref(`usernames/${username}`)
      .set(userRecord.uid);

    return {
      success: true,
      uid: userRecord.uid
    };

  } catch (error) {

    throw new functions.https.HttpsError(
      "internal",
      error.message
    );

  }

});

/* ============================
   💳 CREATE RAZORPAY ORDER
============================ */

exports.createRazorpayOrder = functions.https.onCall(
  async (data, context) => {

    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Login required"
      );
    }

    const { amount, billId } = data;

    if (!amount || amount <= 0) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Invalid amount"
      );
    }

    try {

      const order = await razorpay.orders.create({
        amount: amount * 100,
        currency: "INR",
        receipt: billId,
        payment_capture: 1
      });

      return order;

    } catch (err) {

      throw new functions.https.HttpsError(
        "internal",
        err.message
      );

    }

  }
);

/* ============================
   🔴 FORCE LOGOUT USER
============================ */

exports.forceLogoutUser = functions.https.onCall(
  async ({ uid }, context) => {

    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Login required"
      );
    }

    const adminUid = context.auth.uid;

    const adminSnap = await admin
      .database()
      .ref(`users/${adminUid}`)
      .once("value");

    if (!adminSnap.exists() || adminSnap.val().role !== "admin") {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Admin access only"
      );
    }

    if (!uid) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "User UID required"
      );
    }

    await admin.database().ref(`users/${uid}`).update({
      forceLogout: true,
      online: false,
      lastLogoutAt: Date.now()
    });

    return { success: true };

  }
);

/* ============================
   🧪 HEALTH CHECK
============================ */

exports.healthCheck = functions.https.onRequest((req, res) => {
  res.status(200).send("✅ Virevo POS Functions Running");
});

