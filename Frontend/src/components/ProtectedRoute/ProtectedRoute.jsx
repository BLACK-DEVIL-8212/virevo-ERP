import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Loader from "../Loader/Loader";

const ProtectedRoute = ({ children, allowedRoles = [] }) => {

  const { user, loading } = useAuth();

  // ⏳ Loading
  if (loading) return <Loader />;

  // ❌ Not logged in
  if (!user) return <Navigate to="/login" replace />;

  // 👑 Superadmin = full access
  if (user.role === "superadmin") return children;

  // ✅ If no role restriction → allow
  if (allowedRoles.length === 0) return children;

  // ❌ Role not allowed → redirect properly
  if (!allowedRoles.includes(user.role)) {

    // Admin → dashboard
    if (user.role === "admin") {
      return <Navigate to="/dashboard" replace />;
    }

    // Manager / Cashier / others → billing
    return <Navigate to="/billing" replace />;
  }

  // ✅ Allowed
  return children;
};

export default ProtectedRoute;