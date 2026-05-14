import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { ref, onValue, onDisconnect, set, off } from "firebase/database";
import { auth, db } from "../services/firebase";
import { initializeDefaultLedgers } from "../accounting/ledgerInitializer";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {

    let userRefListener = null;

    /* =====================================
       1️⃣ CHECK EMPLOYEE SESSION FIRST
    ===================================== */

    const storedEmployee =
      localStorage.getItem("employeeSession");

    if (storedEmployee) {

      try {

        const employee = JSON.parse(storedEmployee);

        /* 🔥 FIX: ensure type exists */
        const employeeUser = {
          ...employee,
          type: "employee" // ✅ CRITICAL FIX
        };

        setUser(employeeUser);
        setLoading(false);

        return; // ✅ stop further execution

      } catch {

        localStorage.removeItem("employeeSession");

      }

    }

    /* =====================================
       2️⃣ FIREBASE ADMIN AUTH LISTENER
    ===================================== */

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {

      if (!firebaseUser) {

        setUser(null);
        setLoading(false);
        return;

      }

      const userRef = ref(db, `users/${firebaseUser.uid}`);
      userRefListener = userRef;

      /* =====================================
         REALTIME USER PROFILE LISTENER
      ===================================== */

      onValue(userRef, async (snapshot) => {

        if (!snapshot.exists()) {

          setUser(null);
          setLoading(false);
          return;

        }

        const profile = snapshot.val();

        /* ===============================
           ONLINE STATUS MANAGEMENT
        =============================== */

        const onlineRef =
          ref(db, `users/${firebaseUser.uid}/online`);

        set(onlineRef, true);
        onDisconnect(onlineRef).set(false);

        /* ===============================
           ACCOUNTING INITIALIZATION
        =============================== */

        try {

          if (profile.shopId) {

            await initializeDefaultLedgers(
              profile.shopId
            );

          }

        } catch (err) {

        // Ledger init failed: ${err.message}

        }

        /* ===============================
           SET USER CONTEXT
        =============================== */

        setUser({
          uid: firebaseUser.uid,
          type: "admin", // 🔥 ensure type
          ...profile
        });

        setLoading(false);

      });

    });

    /* ===============================
       CLEANUP
    =============================== */

    return () => {

      unsubscribe();

      if (userRefListener) {
        off(userRefListener);
      }

    };

  }, []);

  return (

    <AuthContext.Provider value={{ user, loading }}>

      {children}

    </AuthContext.Provider>

  );

};

export const useAuth = () => useContext(AuthContext);