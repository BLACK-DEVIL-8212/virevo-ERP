import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { checkSubscriptionStatus } from "../../services/subscription.service";
import { Link } from "react-router-dom";

const SubscriptionGuard = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      if (user.role === "superadmin") {
        setLoading(false);
        return;
      }

      const shopId = user?.shopId; // ✅ DECLARED HERE

      if (!shopId) {
        setExpired(true);
        setLoading(false);
        return;
      }

      try {
        const sub = await checkSubscriptionStatus(shopId);

        if (!sub || Date.now() > sub.expiresAt) {
          setExpired(true);
        }
      } catch (err) {
        console.error("Subscription error:", err);
        setExpired(true);
      }

      setLoading(false);
    };

    check();
  }, [user]);

  if (authLoading || loading) return null;

  if (expired) {
    return (
      <div className="subscription-expired">
        <h2>Subscription Expired</h2>
        <p>Please renew your plan to continue using Virevo POS.</p>
        <Link to="/upgrade" className="btn primary">
          Upgrade Plan
        </Link>
      </div>
    );
  }

  return children;
};

export default SubscriptionGuard;