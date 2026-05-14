import { useLocation, useNavigate } from "react-router-dom";
import { ref, update, set } from "firebase/database";
import { db } from "../../services/firebase";
import { SUBSCRIPTION_PLANS } from "../../constants/subscriptionPlans";
import { useEffect, useState } from "react";
import "./Payment.scss";

/* =========================
   GST CONFIG
========================= */
const GST_RATE = 0.18;

const Payment = () => {

  const location = useLocation();
  const navigate = useNavigate();

  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);

  /* ✅ FIX: persist plan */
  const selectedPlanId =
    location.state?.selectedPlan ||
    localStorage.getItem("selectedPlan");

  /* =========================
     LOAD RAZORPAY SCRIPT
  ========================= */
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  /* =========================
     FETCH PLAN
  ========================= */
  useEffect(() => {

    if (!selectedPlanId) {
      navigate("/");
      return;
    }

    const foundPlan = SUBSCRIPTION_PLANS.find(
      (p) => p.id === selectedPlanId
    );

    if (!foundPlan) {
      navigate("/");
      return;
    }

    setPlan(foundPlan);

  }, [selectedPlanId, navigate]);

  /* =========================
     CALCULATE EXPIRY
  ========================= */
  const calculateExpiry = (duration) => {

    const expiry = new Date();

    if (duration === "month") {
      expiry.setMonth(expiry.getMonth() + 1);
    }

    if (duration === "year") {
      expiry.setFullYear(expiry.getFullYear() + 1);
    }

    return expiry.toISOString();
  };

  /* =========================
     PRICING
  ========================= */
  const getPricing = () => {
    if (!plan) return null;

    const gst = Math.round(plan.price * GST_RATE);
    const total = plan.price + gst;

    return { gst, total };
  };

  /* =========================
     PAYMENT
  ========================= */
  const handlePayment = () => {

    console.log("Pay clicked");

    const user = JSON.parse(localStorage.getItem("user"));

    if (!user) {
      alert("User not found. Please login again.");
      return;
    }

    if (!plan) {
      alert("Plan not selected.");
      return;
    }

    if (!window.Razorpay) {
      alert("Razorpay not loaded. Refresh.");
      return;
    }

    const pricing = getPricing();

    setLoading(true);

    const options = {

      key: import.meta.env.VITE_RAZORPAY_KEY,
      amount: pricing.total * 100,
      currency: "INR",
      name: "Virevo POS",
      description: `${plan.name} Subscription`,

      handler: async function (response) {

        try {

          const expiryDate = calculateExpiry(plan.duration);
          const paymentId = response.razorpay_payment_id;

          const subscriptionData = {
            userId: user.uid,
            userName: user.name,
            email: user.email,
            shopId: user.shopId,

            planId: plan.id,
            planName: plan.name,

            amount: pricing.total,
            gst: pricing.gst,

            paymentId: paymentId,

            startDate: new Date().toISOString(),
            expiryDate: expiryDate,

            status: "active",
            createdAt: Date.now()
          };

          /* ✅ USER */
          await update(ref(db, `users/${user.uid}`), {
            plan: plan.id,
            planExpiry: expiryDate,
            planAmount: pricing.total,
            gstAmount: pricing.gst
          });

          /* ✅ SHOP */
          await set(
            ref(db, `shops/${user.shopId}/info/subscription`),
            subscriptionData
          );

          /* ✅ GLOBAL (SUPERADMIN) */
          await set(
            ref(db, `subscriptions/${paymentId}`),
            subscriptionData
          );

          /* ✅ LOCAL */
          localStorage.setItem(
            "user",
            JSON.stringify({
              ...user,
              plan: plan.id,
              planExpiry: expiryDate
            })
          );

          navigate("/dashboard");

        } catch (err) {
          console.error(err);
          alert("Payment success but saving failed");
        } finally {
          setLoading(false);
        }
      },

      prefill: {
        name: user.name,
        email: user.email
      },

      theme: {
        color: "#00e0ff"
      }
    };

    const rzp = new window.Razorpay(options);

    rzp.on("payment.failed", function (response) {
      console.error(response);
      alert("Payment failed");
      setLoading(false);
    });

    rzp.open();
  };

  if (!plan) return null;

  const pricing = getPricing();

  /* =========================
     UI
  ========================= */
  return (
    <div className="payment-page">

      <div className="payment-card">

        <div className="payment-header">
          <h2>{plan.name} Plan</h2>
          <p className="subtitle">
            Unlock premium features for your store
          </p>
        </div>

        <div className="price-breakdown">
          <p>Base Price: ₹{plan.price}</p>
          <p>GST (18%): ₹{pricing.gst}</p>

          <h2 className="total">
            ₹{pricing.total}
            <span> / {plan.duration}</span>
          </h2>
        </div>

        <ul className="features">
          {plan.features.map((feature, index) => (
            <li key={index}>✔ {feature}</li>
          ))}
        </ul>

        <button
          className="pay-btn"
          onClick={handlePayment}
          disabled={loading}
        >
          {loading ? "Processing..." : `Pay ₹${pricing.total}`}
        </button>

        <p className="secure-text">
          🔒 Secure Payment Powered by Razorpay
        </p>

      </div>

    </div>
  );
};

export default Payment;