import { useEffect, useState } from "react";
import "./Attendance.scss";
import { useAuth } from "../../context/AuthContext";
import { ref, onValue, set, get } from "firebase/database";
import { db } from "../../services/firebase";

const Attendance = () => {

  const { user } = useAuth();
  const shopId = user?.shopId;

  const [staffList, setStaffList] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toLocaleDateString("en-CA")
  );

  /* ================= ROLE CHECK ================= */

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const isManager = user?.role === "manager";
  const canManageAttendance = isAdmin || isManager;
  const isEmployee = user?.type === "employee" || user?.role === "employee" || user?.role === "cashier";

  /* ================= AUTO MARK PRESENT ON LOGIN DAY ================= */
  
  useEffect(() => {
    // Auto mark employee as present on their login day
    const autoMarkAttendance = async () => {
      try {
        if (!shopId || !user?.employeeId || !isEmployee) return;

        const today = new Date().toLocaleDateString("en-CA");

        const attRef = ref(
          db,
          `shops/${shopId}/attendance/${today}/${user.employeeId}`
        );

        console.log("🧠 Auto-mark attempt:", {
          shopId,
          employeeId: user.employeeId,
          role: user?.role
        });

        // ------------------------
        // CHECK EXISTING RECORD
        // ------------------------
        let snapshot;
        try {
          snapshot = await get(attRef);
        } catch (err) {
          console.error("❌ READ permission denied:", err);
          return; // stop silently
        }

        // ------------------------
        // ONLY MARK IF NOT EXISTS
        // ------------------------
        if (snapshot.exists()) {
          console.log("✅ Already marked, skipping...");
          return;
        }

        // ------------------------
        // WRITE ATTENDANCE
        // ------------------------
        try {
          await set(attRef, {
            status: "present",
            markedAt: Date.now(),
            markedBy: user.employeeId,
            markedByName: user?.name || "Employee",
            auto: true,
            ipAddress: null,
            userAgent: navigator.userAgent
          });

          console.log("✅ Auto-marked attendance successfully");

        } catch (err) {
          console.error("🔥 WRITE permission denied:", err);

          // 🔥 CLEAN ERROR MESSAGE
          if (err.code === "PERMISSION_DENIED") {
            console.warn("⚠ Employee cannot write attendance (rules issue)");
          }
        }

      } catch (error) {
        console.error("❌ Fatal autoMarkAttendance error:", error);
      }
    };
    
    autoMarkAttendance();
  }, [shopId, user?.employeeId, isEmployee, user?.name]);

  /* ================= LOAD STAFF ================= */

  useEffect(() => {
    if (!shopId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const staffRef = ref(db, `shops/${shopId}/employees`);

    const unsubscribe = onValue(staffRef, (snap) => {
      const list = [];
      
      snap.forEach(child => {
        const data = child.val();
        
        // For employees, only show themselves
        if (isEmployee && child.key !== user?.employeeId) {
          return;
        }
        
        // Only show active employees unless admin
        if (!isAdmin && data.active === false) {
          return;
        }
        
        list.push({
          id: child.key,
          name: data?.name || "Unnamed",
          salary: data?.salary || 0,
          role: data?.role || "employee",
          active: data?.active !== false,
          createdAt: data?.createdAt || Date.now(),
          ...data
        });
      });
      
      // Sort by name
      list.sort((a, b) => a.name.localeCompare(b.name));
      setStaffList(list);
      setLoading(false);
    }, (error) => {
      console.error("Error loading staff:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [shopId, isAdmin, isEmployee, user?.employeeId]);

  /* ================= LOAD ATTENDANCE ================= */

  useEffect(() => {
    if (!shopId) return;

    const attRef = ref(db, `shops/${shopId}/attendance/${selectedDate}`);

    const unsubscribe = onValue(attRef, (snap) => {
      if (snap.exists()) {
        setAttendance(snap.val());
      } else {
        setAttendance({});
      }
    }, (error) => {
      console.error("Error loading attendance:", error);
    });

    return () => unsubscribe();
  }, [shopId, selectedDate]);

  /* ================= MARK ATTENDANCE ================= */

  const markAttendance = async (staffId, status, markedByName = null) => {
    // Only admin and superadmin can mark attendance
    if (!canManageAttendance) {
      alert("Only admin and superadmin can mark attendance");
      return;
    }
    
    if (updating) {
      alert("Please wait...");
      return;
    }

    try {
      setUpdating(true);
      
      const attRef = ref(db, `shops/${shopId}/attendance/${selectedDate}/${staffId}`);
      
      const attendanceData = {
        status,
        markedAt: Date.now(),
        markedBy: user?.uid,
        markedByName: markedByName || user?.name || "Admin",
        auto: false,
        ipAddress: null,
        userAgent: navigator.userAgent
      };
      
      await set(attRef, attendanceData);
      
      // Show success feedback
      console.log(`Attendance marked as ${status} for ${staffId}`);
      
    } catch (error) {
      console.error("Error marking attendance:", error);
      alert("Failed to mark attendance. Please try again.");
    } finally {
      setUpdating(false);
    }
  };

  /* ================= BULK MARK ATTENDANCE ================= */
  
  const markAllPresent = async () => {
    if (!canManageAttendance) return;
    if (!window.confirm(`Mark all staff as PRESENT for ${selectedDate}?`)) return;
    
    setUpdating(true);
    try {
      const promises = visibleStaff.map(staff => 
        markAttendance(staff.id, "present", user?.name)
      );
      await Promise.all(promises);
      alert("All staff marked as present!");
    } catch (error) {
      console.error("Error in bulk mark:", error);
      alert("Failed to mark all staff. Please try individual marking.");
    } finally {
      setUpdating(false);
    }
  };

  /* ================= FILTER DATA ================= */

  // For employees, only show themselves
  const visibleStaff = canManageAttendance
    ? staffList
    : staffList;

  // Filter staff created after selected date
  const filteredStaff = visibleStaff.filter((staff) => {
    const selectedDateTime = new Date(selectedDate).setHours(0, 0, 0, 0);
    const staffCreatedDate = new Date(staff.createdAt).setHours(0, 0, 0, 0);
    return selectedDateTime >= staffCreatedDate;
  });

  /* ================= STATISTICS ================= */
  
  const getAttendanceStats = () => {
    const total = filteredStaff.length;
    const present = filteredStaff.filter(s => attendance?.[s.id]?.status === "present").length;
    const absent = filteredStaff.filter(s => !attendance?.[s.id]?.status || attendance?.[s.id]?.status === "absent").length;
    const leave = filteredStaff.filter(s => attendance?.[s.id]?.status === "leave").length;
    const medical = filteredStaff.filter(s => attendance?.[s.id]?.status === "medical").length;
    
    return { total, present, absent, leave, medical, attendanceRate: total ? ((present / total) * 100).toFixed(1) : 0 };
  };
  
  const stats = getAttendanceStats();

  /* ================= UI ================= */

  if (loading) {
    return (
      <div className="attendance-page">
        <div className="loading">Loading attendance data...</div>
      </div>
    );
  }

  return (
    <div className="attendance-page">
      <h2>Attendance Management</h2>
      
      {/* DATE SELECTOR - Show for both admin and employees */}
      <div className="controls">
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          max={new Date().toLocaleDateString("en-CA")}
        />
        
        {canManageAttendance && (
          <button 
            className="bulk-present-btn" 
            onClick={markAllPresent}
            disabled={updating}
          >
            Mark All Present
          </button>
        )}
      </div>
      
      {/* STATISTICS CARDS - Show for both admin and employees */}
      <div className="stats-container">
        <div className="stat-card">
          <h4>Total Staff</h4>
          <p className="stat-number">{stats.total}</p>
        </div>
        <div className="stat-card present">
          <h4>Present</h4>
          <p className="stat-number">{stats.present}</p>
        </div>
        <div className="stat-card absent">
          <h4>Absent</h4>
          <p className="stat-number">{stats.absent}</p>
        </div>
        <div className="stat-card leave">
          <h4>On Leave</h4>
          <p className="stat-number">{stats.leave + stats.medical}</p>
        </div>
        <div className="stat-card rate">
          <h4>Attendance Rate</h4>
          <p className="stat-number">{stats.attendanceRate}%</p>
        </div>
      </div>

      {/* TABLE */}
      <div className="attendance-table">
         <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Name</th>
              <th>Role</th>
              <th>Emp ID</th>
              <th>Status</th>
              {canManageAttendance && <th>Action</th>}
              <th>Marked By</th>
            </tr>
          </thead>
          <tbody>
            {filteredStaff.length === 0 ? (
              <tr>
                <td colSpan={canManageAttendance ? 7 : 6} className="no-data">
                  No staff members found for this date
                </td>
              </tr>
            ) : (
              filteredStaff.map((staff) => {
                const current = attendance?.[staff.id];
                const status = current?.status || "absent";
                const markedBy = current?.markedByName || 
                                (current?.auto ? "Auto (Login)" : "-");
                const isAutoMarked = current?.auto === true;
                
                return (
                  <tr key={staff.id} className={!staff.active ? "inactive" : ""}>
                    <td>{selectedDate}</td>
                    <td>
                      {staff.name}
                      {!staff.active && <span className="badge inactive">Inactive</span>}
                      {isAutoMarked && status === "present" && (
                        <span className="badge auto">Auto</span>
                      )}
                    </td>
                    <td>
                      <span className={`role-badge ${staff.role}`}>
                        {staff.role || "employee"}
                      </span>
                    </td>
                    <td>{staff.id?.slice(-6)}</td>
                    <td>
                      <span className={`status-badge ${status}`}>
                        {status === "present" ? "✅ Present" : 
                         status === "absent" ? "❌ Absent" :
                         status === "leave" ? "🏖️ Leave" :
                         status === "medical" ? "🏥 Medical" : "❌ Absent"}
                      </span>
                    </td>
                    
                    {canManageAttendance && (
                      <td className="actions">
                        <button
                          className="btn-present"
                          onClick={() => markAttendance(staff.id, "present", user?.name)}
                          disabled={updating || status === "present"}
                          title="Mark Present"
                        >
                          ✅
                        </button>
                        
                        <button
                          className="btn-absent"
                          onClick={() => markAttendance(staff.id, "absent", user?.name)}
                          disabled={updating || status === "absent"}
                          title="Mark Absent"
                        >
                          ❌
                        </button>
                        
                        <button
                          className="btn-leave"
                          onClick={() => markAttendance(staff.id, "leave", user?.name)}
                          disabled={updating || status === "leave"}
                          title="Mark Leave"
                        >
                          🏖️
                        </button>
                        
                        <button
                          className="btn-medical"
                          onClick={() => markAttendance(staff.id, "medical", user?.name)}
                          disabled={updating || status === "medical"}
                          title="Mark Medical Leave"
                        >
                          🏥
                        </button>
                      </td>
                    )}
                    
                    <td className="marked-by">
                      {markedBy}
                      {isAutoMarked && <span className="auto-badge"> (Auto)</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      
      {updating && <div className="updating-overlay">Updating attendance...</div>}
    </div>
  );
};

export default Attendance;