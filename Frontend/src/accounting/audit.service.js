import { db } from "../services/firebase";
import {
  ref,
  push,
  set
} from "firebase/database";

/* =====================================
   SAFE STRING
===================================== */

const safeString = (value, max = 200) => {

  if (!value) return "";

  return value
    .toString()
    .trim()
    .replace(/\s+/g, " ")
    .substring(0, max);

};

/* =====================================
   VALID ACTION TYPES
===================================== */

const VALID_ACTIONS = [
  "LOGIN",
  "LOGOUT",
  "CREATE_LEDGER",
  "UPDATE_LEDGER",
  "DELETE_LEDGER",
  "CREATE_JOURNAL",
  "REVERSE_JOURNAL",
  "CREATE_PRODUCT",
  "UPDATE_PRODUCT",
  "DELETE_PRODUCT",
  "CREATE_BILL",
  "UPDATE_SETTINGS"
];

/* =====================================
   GET CLIENT INFO
===================================== */

const getClientInfo = () => {

  try {

    const ua = navigator.userAgent;

    if (/mobile/i.test(ua)) return "mobile";

    if (/tablet/i.test(ua)) return "tablet";

    return "desktop";

  } catch {

    return "unknown";

  }

};

/* =====================================
   CREATE AUDIT LOG
===================================== */

export const createAuditLog = async ({
  shopId,
  userId,
  action,
  module = "system",
  details = "",
  severity = "info"
}) => {

  try {

    /* ===============================
       VALIDATE INPUT
    =============================== */

    if (!shopId) {
      throw new Error("Missing shopId");
    }

    if (!userId) {
      throw new Error("Missing userId");
    }

    if (!action) {
      throw new Error("Missing action");
    }

    const safeAction = safeString(action, 80).toUpperCase();

    if (!VALID_ACTIONS.includes(safeAction)) {
      console.warn("Unknown audit action:", safeAction);
    }

    /* ===============================
       PREPARE LOG DATA
    =============================== */

    const logData = {

      userId: safeString(userId, 80),

      action: safeAction,

      module: safeString(module, 80),

      details: safeString(details, 300),

      severity: safeString(severity, 20),

      device: getClientInfo(),

      createdAt: Date.now()

    };

    /* ===============================
       SAVE LOG
    =============================== */

    const logRef = ref(
      db,
      `shops/${shopId}/logs`
    );

    const newLog = push(logRef);

    await set(newLog, logData);

    return {
      success: true,
      id: newLog.key
    };

  } catch (err) {

    console.error("Audit log failed:", err);

    return {
      success: false,
      error: err.message
    };

  }

};