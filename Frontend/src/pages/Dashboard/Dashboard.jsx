import { useEffect, useState, useMemo } from "react";
import "./Dashboard.scss";
import usePageTitle from "../../hooks/usePageTitle";
import { ref, onValue, query, orderByChild, equalTo } from "firebase/database";
import { db } from "../../services/firebase";
import { getCustomerName, getCustomerPhone } from "../../utils/customerUtils";
import { useAuth } from "../../context/AuthContext";
import { getShopOptionLabel, normalizeShopRecord } from "../../services/shop.service";
import { Search, Store } from "lucide-react";
import Papa from "papaparse";
import JSZip from "jszip";
import { saveAs } from "file-saver";

import { Doughnut, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement
} from "chart.js";

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement
);

const Dashboard = () => {

  usePageTitle("Virevo - Dashboard");

  const { user } = useAuth();

  const [shops, setShops] = useState([]);
  const [selectedShopId, setSelectedShopId] = useState("");

  const isSuperAdmin = user?.role === "superadmin";
  const effectiveShopId = isSuperAdmin ? selectedShopId : user?.shopId || null;

  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  const [shopSettings, setShopSettings] = useState(null);

  const [dailySales, setDailySales] = useState(Array(7).fill(0));
  const [yearlyProfit, setYearlyProfit] = useState(Array(12).fill(0));
  const [itrAmount, setItrAmount] = useState(0);
  const [gstAmount, setGstAmount] = useState(0);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [topProducts, setTopProducts] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);

  const [stats, setStats] = useState({
    monthlySales: 0,
    monthlyProfit: 0,
    lowStock: 0,
    unsoldProducts: 0,
    unsoldUnits: 0
  });

  const [categoryStock, setCategoryStock] = useState({});
  const [paymentStats, setPaymentStats] = useState({
    cash: 0,
    upi: 0,
    card: 0
  });

  const [staffByRole, setStaffByRole] = useState({
    admin: [],
    manager: [],
    cashier: [],
    staff: [],
    employee: []  // Added employee array
  });

  const [bills, setBills] = useState([]);
  const [buyersMap, setBuyersMap] = useState({});
  const [loading, setLoading] = useState(true);

  const selectedShop = useMemo(
    () => shops.find((shop) => shop.id === effectiveShopId),
    [shops, effectiveShopId]
  );

  const activeShopName =
    shopSettings?.companyName ||
    shopSettings?.shopName ||
    selectedShop?.name ||
    (effectiveShopId ? effectiveShopId : "No shop selected");

  const formatCurrency = (value) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0
    }).format(Number(value) || 0);

  useEffect(() => {
    if (!isSuperAdmin) return;

    const unsubscribe = onValue(ref(db, "shops"), (snapshot) => {
      const list = [];
      snapshot.forEach((child) => {
        list.push(normalizeShopRecord(child.key, child.val()));
      });
      setShops(list.sort((a, b) => a.name.localeCompare(b.name)));
    });

    return () => unsubscribe();
  }, [isSuperAdmin]);

  useEffect(() => {

    if (!effectiveShopId) {
      setShopSettings(null);
      setDailySales(Array(7).fill(0));
      setYearlyProfit(Array(12).fill(0));
      setItrAmount(0);
      setGstAmount(0);
      setTopProducts([]);
      setLowStockItems([]);
      setCategoryStock({});
      setPaymentStats({ cash: 0, upi: 0, card: 0 });
      setStaffByRole({ admin: [], manager: [], cashier: [], staff: [], employee: [] });
      setBills([]);
      setBuyersMap({});
      setStats({
        monthlySales: 0,
        monthlyProfit: 0,
        lowStock: 0,
        unsoldProducts: 0,
        unsoldUnits: 0
      });
      setLoading(false);
      return;
    }

    try {

      setLoading(true);

      const productsRef = ref(db, `shops/${effectiveShopId}/products`);
      const billsRef = ref(db, `shops/${effectiveShopId}/bills`);

      const usersRef = query(
        ref(db, "users"),
        orderByChild("shopId"),
        equalTo(effectiveShopId)
      );

      const buyersRef = ref(db, `shops/${effectiveShopId}/buyers`);
      const settingsRef = ref(db, `shops/${effectiveShopId}/info`);

      /* PRODUCTS */

      const handleProducts = snapshot => {

        let lowStock = 0;
        let unsoldProducts = 0;
        let unsoldUnits = 0;

        const categoryMap = {};
        const lowList = [];

        const now = Date.now();

        if (snapshot && snapshot.forEach) {
          snapshot.forEach(child => {

            const p = child.val();
            const stock = Number(p.stock || 0);

            if (stock <= 5) {
              lowStock++;
              lowList.push({ name: p.name, stock });
            }

            // Check if product is unsold (no sales in last 90 days)
            const neverSold = !p.lastSoldAt || (now - p.lastSoldAt) > 90 * 24 * 60 * 60 * 1000;

            if (neverSold) {
              unsoldProducts++;
              unsoldUnits += stock;
            }

            if (p.category) {
              categoryMap[p.category] = (categoryMap[p.category] || 0) + stock;
            }

          });
        }

        setLowStockItems(lowList);
        setCategoryStock(categoryMap);

        setStats(prev => ({
          ...prev,
          lowStock,
          unsoldProducts,
          unsoldUnits
        }));

      };

      /* BILLS - FIXED CALCULATIONS */

      const handleBills = snapshot => {

        let monthlySales = 0;
        let monthlyProfit = 0;
        let yearlyProfitTotal = 0;
        let totalGST = 0;

        const payments = { cash: 0, upi: 0, card: 0 };
        const billsList = [];
        const monthlyProfits = Array(12).fill(0);
        const last7Days = Array(7).fill(0);

        const productSales = {};

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        
        // Get first day of current month at 00:00:00
        const startOfMonth = new Date(currentYear, currentMonth, 1);
        startOfMonth.setHours(0, 0, 0, 0);

        if (snapshot && snapshot.forEach) {
          snapshot.forEach(child => {

            const bill = child.val();
            if (!bill || !bill.createdAt) return;

            billsList.push({ id: child.key, ...bill });

            const billDate = new Date(bill.createdAt);
            let billProfit = 0;

            // Calculate profit and GST from items
            if (bill.items) {
              Object.values(bill.items).forEach(item => {
                const sellingPrice = Number(item.mrp || item.price || item.sellingPrice || 0);
                const costPrice = Number(item.costPrice || 0);
                const qty = Number(item.qty || 0);
                const gstRate = Number(item.gst || 0);

                // Profit calculation (Selling Price - Cost Price) * Quantity
                const profit = (sellingPrice - costPrice) * qty;
                billProfit += profit;

                // GST calculation (Selling Price * GST Rate) / (100 + GST Rate) * Quantity
                const itemGST = (sellingPrice * gstRate) / (100 + gstRate) * qty;
                totalGST += itemGST;
              });
            }

            // Monthly Sales and Profit (current month only)
            if (bill.createdAt >= startOfMonth.getTime()) {
              const amount = Number(bill.totalAmount || 0);
              monthlySales += amount;
              monthlyProfit += billProfit;
            }

            // Payment counts
            if (bill.paymentMode) {
              const mode = bill.paymentMode.toLowerCase();
              if (mode === 'cash') payments.cash++;
              else if (mode === 'upi') payments.upi++;
              else if (mode === 'card') payments.card++;
            }

            // Yearly Profit by month
            if (billDate.getFullYear() === currentYear) {
              const m = billDate.getMonth();
              monthlyProfits[m] += billProfit;
              yearlyProfitTotal += billProfit;
            }

            // Last 7 Days Sales
            const diffDays = Math.floor((now - billDate) / (1000 * 60 * 60 * 24));
            if (diffDays < 7 && diffDays >= 0) {
              last7Days[6 - diffDays] += Number(bill.totalAmount || 0);
            }

            // Product sales tracking
            if (bill.items) {
              Object.values(bill.items).forEach(item => {
                const productName = item.name;
                const qty = Number(item.qty || 0);
                productSales[productName] = (productSales[productName] || 0) + qty;
              });
            }

          });
        }

        // Calculate Income Tax (ITR) based on yearly profit
        let tax = 0;
        const yearlyIncome = yearlyProfitTotal;

        if (yearlyIncome > 1500000) {
          tax = 150000 + (yearlyIncome - 1500000) * 0.30;
        } else if (yearlyIncome > 1200000) {
          tax = 90000 + (yearlyIncome - 1200000) * 0.20;
        } else if (yearlyIncome > 900000) {
          tax = 45000 + (yearlyIncome - 900000) * 0.15;
        } else if (yearlyIncome > 600000) {
          tax = 15000 + (yearlyIncome - 600000) * 0.10;
        } else if (yearlyIncome > 300000) {
          tax = (yearlyIncome - 300000) * 0.05;
        }
        // Add 4% health and education cess
        tax = tax * 1.04;

        // Get top 5 selling products
        const sortedProducts = Object.entries(productSales)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);

        setTopProducts(sortedProducts);
        setDailySales(last7Days);
        setYearlyProfit(monthlyProfits);
        setBills(billsList.reverse());
        setPaymentStats(payments);
        setItrAmount(Number(tax.toFixed(2)));
        setGstAmount(Number(totalGST.toFixed(2)));

        setStats(prev => ({
          ...prev,
          monthlySales,
          monthlyProfit: Number(monthlyProfit.toFixed(2))
        }));

      };

      /* BUYERS */

      const handleBuyers = snapshot => {
        const map = {};
        if (snapshot && snapshot.forEach) {
          snapshot.forEach(child => {
            map[child.key] = child.val();
          });
        }
        setBuyersMap(map);
      };

      /* STAFF */
      const handleUsers = (userSnap, employeeSnap) => {
        const grouped = {
          admin: [],
          manager: [],
          cashier: [],
          staff: [],
          employee: []
        };

        const validRoles = ['admin', 'manager', 'cashier', 'staff', 'employee'];
        
        const normalizeRole = (role) => {
          if (!role) return 'staff';
          const normalized = role.toLowerCase();
          return validRoles.includes(normalized) ? normalized : 'staff';
        };

        const formatDate = (timestamp) => {
          if (!timestamp) return null;
          return new Date(timestamp).toLocaleString();
        };

        const getStatusColor = (online, active) => {
          if (online) return '#22c55e';
          if (!active) return '#ef4444';
          return '#facc15';
        };

        // Process USERS
        if (userSnap && userSnap.forEach) {
          userSnap.forEach(child => {
            const u = child.val();
            if (!u) return;

            const role = normalizeRole(u.role);
            const isActive = u.active !== false;
            const isOnline = !!u.online;

            if (!grouped[role]) grouped[role] = [];

            grouped[role].push({
              id: child.key,
              name: u.name || u.displayName || "Unknown",
              username: u.username || u.email?.split('@')[0] || "-",
              email: u.email || "",
              phone: u.phone || "",
              role: role,
              roleDisplay: role.charAt(0).toUpperCase() + role.slice(1),
              online: isOnline,
              active: isActive,
              statusColor: getStatusColor(isOnline, isActive),
              lastLoginAt: u.lastLoginAt,
              lastLoginFormatted: formatDate(u.lastLoginAt),
              lastLogoutAt: u.lastLogoutAt,
              lastLogoutFormatted: formatDate(u.lastLogoutAt),
              createdAt: u.createdAt,
              createdAtFormatted: formatDate(u.createdAt),
              avatar: u.avatar || null,
              department: u.department || "",
              location: u.location || ""
            });
          });
        }

        // Process EMPLOYEES
        if (employeeSnap && employeeSnap.forEach) {
          employeeSnap.forEach(child => {
            const u = child.val();
            if (!u) return;

            const role = normalizeRole(u.role);
            const isActive = u.active !== false;
            const isOnline = !!u.online;

            if (!grouped[role]) grouped[role] = [];

            grouped[role].push({
              id: child.key,
              name: u.name || u.username || "Unknown",
              username: u.username || "-",
              email: u.email || "",
              phone: u.phone || "",
              role: role,
              roleDisplay: role.charAt(0).toUpperCase() + role.slice(1),
              online: isOnline,
              active: isActive,
              statusColor: getStatusColor(isOnline, isActive),
              salary: u.salary || 0,
              salaryFormatted: u.salary ? `₹${u.salary.toLocaleString()}` : "Not set",
              hireDate: u.createdAt,
              hireDateFormatted: formatDate(u.createdAt),
              lastLoginAt: u.lastLoginAt,
              lastLoginFormatted: formatDate(u.lastLoginAt),
              lastLogoutAt: u.lastLogoutAt,
              lastLogoutFormatted: formatDate(u.lastLogoutAt),
              department: u.department || "",
              position: u.position || "",
              manager: u.manager || "",
              notes: u.notes || "",
              avatar: u.avatar || null
            });
          });
        }

        // Sort each group by online status then name
        Object.keys(grouped).forEach(role => {
          if (grouped[role] && grouped[role].sort) {
            grouped[role].sort((a, b) => {
              if (a.online !== b.online) return b.online - a.online;
              return (a.name || "").localeCompare(b.name || "");
            });
          }
        });

        setStaffByRole(grouped);
      };

      const handleSettings = snapshot => {
        if (!snapshot.exists()) {
          setShopSettings(null);
          return;
        }

        const info = snapshot.val();
        setShopSettings({ ...info, ...(info.settings || {}) });
      };

      const employeesRef = ref(db, `shops/${effectiveShopId}/employees`);

      let usersData = null;
      let employeesData = null;

      const tryUpdateStaff = () => {
        handleUsers(usersData, employeesData);
      };

      const usersUnsubscribe = onValue(usersRef, (snap) => {
        usersData = snap;
        tryUpdateStaff();
      });
      
      const employeesUnsubscribe = onValue(employeesRef, (snap) => {
        employeesData = snap;
        tryUpdateStaff();
      });
      
      const productsUnsubscribe = onValue(productsRef, handleProducts);
      const billsUnsubscribe = onValue(billsRef, handleBills);
      const buyersUnsubscribe = onValue(buyersRef, handleBuyers);
      const settingsUnsubscribe = onValue(settingsRef, handleSettings);

      const timer = setTimeout(() => setLoading(false), 800);

      return () => {
        usersUnsubscribe();
        employeesUnsubscribe();
        productsUnsubscribe();
        billsUnsubscribe();
        buyersUnsubscribe();
        settingsUnsubscribe();
        clearTimeout(timer);
      };

    } catch (err) {
      console.error(err);
      setError("Dashboard failed to load.");
      setLoading(false);
    }

  }, [effectiveShopId]);

  const exportBills = () => {
    const exportData = bills.map(bill => ({
      BillID: bill.billId,
      Date: new Date(bill.createdAt).toLocaleString(),
      Customer: getCustomerName(bill.buyerId, buyersMap),
      Phone: getCustomerPhone(bill.buyerId, buyersMap),
      Amount: bill.totalAmount,
      PaymentMode: bill.paymentMode,
      Cashier: bill.cashierId,
      Items: Object.values(bill.items || {}).map(item => `${item.name}(${item.qty})`).join(', ')
    }));
    
    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `bills_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const downloadITRDocs = async () => {
    if (!fromDate || !toDate) {
      alert("Please select date range");
      return;
    }

    const start = new Date(fromDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);

    const filteredBills = bills.filter(
      b => b.createdAt >= start.getTime() && b.createdAt <= end.getTime()
    );

    if (!filteredBills.length) {
      alert("No bills found in selected range");
      return;
    }

    const zip = new JSZip();

    // Calculate totals
    let totalSales = 0;
    let totalProfit = 0;
    let totalGST = 0;
    let gstByRate = {};

    filteredBills.forEach(bill => {
      totalSales += Number(bill.totalAmount || 0);
      
      Object.values(bill.items || {}).forEach(item => {
        const sellingPrice = Number(item.mrp || item.price || item.sellingPrice || 0);
        const costPrice = Number(item.costPrice || 0);
        const qty = Number(item.qty || 0);
        const gstRate = Number(item.gst || 0);
        
        totalProfit += (sellingPrice - costPrice) * qty;
        
        const itemGST = (sellingPrice * gstRate) / (100 + gstRate) * qty;
        totalGST += itemGST;
        
        gstByRate[gstRate] = (gstByRate[gstRate] || 0) + itemGST;
      });
    });

    // Sales Register CSV
    const salesRegister = filteredBills.map(b => ({
      BillID: b.billId,
      Date: new Date(b.createdAt).toLocaleString(),
      Customer: getCustomerName(b.buyerId, buyersMap),
      Phone: getCustomerPhone(b.buyerId, buyersMap),
      Amount: b.totalAmount,
      PaymentMode: b.paymentMode,
      Cashier: b.cashierId
    }));
    zip.file("sales-register.csv", Papa.unparse(salesRegister));

    // GST Report
    let gstReport = `GST REPORT\n${'='.repeat(50)}\n\nPeriod: ${fromDate} to ${toDate}\nGenerated: ${new Date().toLocaleString()}\n\n${'-'.repeat(50)}\nSUMMARY\n${'-'.repeat(50)}\nTotal Sales: ₹${totalSales.toFixed(2)}\nTotal GST Collected: ₹${totalGST.toFixed(2)}\n\n${'-'.repeat(50)}\nGST BREAKDOWN BY RATE\n${'-'.repeat(50)}`;

    for (const [rate, amount] of Object.entries(gstByRate).sort()) {
      const cgst = amount / 2;
      const sgst = amount / 2;
      gstReport += `\n\nGST ${rate}%:\n  Total GST: ₹${amount.toFixed(2)}\n  CGST (${rate/2}%): ₹${cgst.toFixed(2)}\n  SGST (${rate/2}%): ₹${sgst.toFixed(2)}`;
    }

    zip.file("gst-report.txt", gstReport);

    // Profit & Loss Statement
    const profitLoss = `PROFIT & LOSS STATEMENT\n${'='.repeat(50)}\n\nPeriod: ${fromDate} to ${toDate}\nGenerated: ${new Date().toLocaleString()}\n\n${'-'.repeat(50)}\nREVENUE\n${'-'.repeat(50)}\nTotal Sales: ₹${totalSales.toFixed(2)}\n\n${'-'.repeat(50)}\nCOSTS & EXPENSES\n${'-'.repeat(50)}\nCost of Goods Sold: ₹${(totalSales - totalProfit).toFixed(2)}\n\n${'-'.repeat(50)}\nPROFIT\n${'-'.repeat(50)}\nGross Profit: ₹${totalProfit.toFixed(2)}\nProfit Margin: ${((totalProfit / totalSales) * 100).toFixed(2)}%\n\n${'-'.repeat(50)}\nTAX CALCULATION\n${'-'.repeat(50)}\nEstimated Taxable Income (50% of profit for presumptive taxation): ₹${(totalProfit * 0.5).toFixed(2)}\nEstimated Tax @ 25%: ₹${(totalProfit * 0.5 * 0.25).toFixed(2)}`;

    zip.file("profit-loss.txt", profitLoss);

    // ITR Summary
    const itrSummary = `ITR SUMMARY\n${'='.repeat(50)}\n\nPeriod: ${fromDate} to ${toDate}\nGenerated: ${new Date().toLocaleString()}\n\n${'-'.repeat(50)}\nFINANCIAL SUMMARY\n${'-'.repeat(50)}\nTotal Revenue (Sales): ₹${totalSales.toFixed(2)}\nTotal Profit: ₹${totalProfit.toFixed(2)}\nTotal GST Collected: ₹${totalGST.toFixed(2)}\n\n${'-'.repeat(50)}\nTAX COMPUTATION (Presumptive Taxation Scheme u/s 44AD)\n${'-'.repeat(50)}\nPresumptive Income (8% of turnover): ₹${(totalSales * 0.08).toFixed(2)}\nRecommended Taxable Income: ₹${Math.min(totalProfit, totalSales * 0.08).toFixed(2)}\n\nEstimated Tax Liability:\n- Base Tax: ₹${(Math.min(totalProfit, totalSales * 0.08) * 0.25).toFixed(2)}\n- Health & Education Cess (4%): ₹${(Math.min(totalProfit, totalSales * 0.08) * 0.25 * 0.04).toFixed(2)}\n- Total Tax Payable: ₹${(Math.min(totalProfit, totalSales * 0.08) * 0.25 * 1.04).toFixed(2)}\n\n${'-'.repeat(50)}\nDOCUMENTS INCLUDED\n${'-'.repeat(50)}\n1. Sales Register (sales-register.csv)\n2. GST Report (gst-report.txt)\n3. Profit & Loss Statement (profit-loss.txt)\n\nNote: This is an automated calculation. Please consult a tax professional for final filing.`;

    zip.file("itr-summary.txt", itrSummary);

    // Generate ZIP
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `ITR_${fromDate}_to_${toDate}.zip`);
  };

  const categoryChart = useMemo(() => ({
    labels: Object.keys(categoryStock),
    datasets: [{
      data: Object.values(categoryStock),
      backgroundColor: [
        "#22c55e",
        "#3b82f6",
        "#facc15",
        "#ef4444",
        "#a855f7",
        "#14b8a6",
        "#f97316",
        "#06b6d4",
        "#8b5cf6",
        "#ec4899"
      ],
      borderWidth: 0,
      cutout: "70%"
    }]
  }), [categoryStock]);

  const paymentChart = {
    labels: ["Cash", "UPI", "Card"],
    datasets: [{
      data: [
        paymentStats.cash,
        paymentStats.upi,
        paymentStats.card
      ],
      backgroundColor: ["#22c55e", "#3b82f6", "#facc15"],
      borderWidth: 0
    }]
  };

  const yearlyProfitChart = {
    labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    datasets: [{
      label: "Profit (INR)",
      data: yearlyProfit,
      backgroundColor: "#3b82f6",
      borderRadius: 8
    }]
  };

  const dailySalesChart = {
    labels: ["6 days ago", "5 days ago", "4 days ago", "3 days ago", "2 days ago", "Yesterday", "Today"],
    datasets: [{
      label: "Daily Sales (INR)",
      data: dailySales,
      backgroundColor: "#22c55e",
      borderRadius: 8
    }]
  };

  const renderTable = (title, data) => {
    // Safety check - ensure data is an array
    const safeData = Array.isArray(data) ? data : [];
    
    return (
      <div className="role-table">
        <h3>{title} ({safeData.length})</h3>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Username</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {safeData.map((u, i) => (
                <tr key={u.id || i}>
                  <td>{i + 1}</td>
                  <td>{u.name || "Unknown"}</td>
                  <td>{u.username || "-"}</td>
                  <td>
                    <span className={`status-badge ${u.online ? "online" : "offline"}`}>
                      {u.online ? "Online" : "Offline"}
                    </span>
                  </td>
                </tr>
              ))}
              {safeData.length === 0 && (
                <tr>
                  <td colSpan="4" className="no-data">
                    No {title.toLowerCase()} found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (error) {
    return (
      <div className="virevo-dashboard">
        <div className="error-container">
          <h2>{error}</h2>
          <button onClick={() => window.location.reload()} className="btn primary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="virevo-dashboard">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const filteredBills = bills.filter(b => {
    const name = getCustomerName(b.buyerId, buyersMap) || "";
    const phone = getCustomerPhone(b.buyerId, buyersMap) || "";
    return name.toLowerCase().includes(search.toLowerCase()) || 
           phone.includes(search);
  });

  return (
    <div className="virevo-dashboard">

      {/* HEADER */}
      <header className="dashboard-header">
        <div className="dashboard-title-block">
          <span className="dashboard-eyebrow">Virevo ERP</span>
          <h1>Dashboard</h1>
          <p>{activeShopName}</p>
        </div>
        <pre className="figlet-title">
{`
██╗   ██╗██╗██████╗ ███████╗██╗   ██╗ ██████╗ 
██║   ██║██║██╔══██╗██╔════╝██║   ██║██╔═══██╗
██║   ██║██║██████╔╝█████╗  ██║   ██║██║   ██║
╚██╗ ██╔╝██║██╔══██╗██╔══╝  ╚██╗ ██╔╝██║   ██║
 ╚████╔╝ ██║██║  ██║███████╗ ╚████╔╝ ╚██████╔╝
  ╚═══╝  ╚═╝╚═╝  ╚═╝╚══════╝  ╚═══╝   ╚═════╝ 

██████╗  █████╗ ███████╗██╗  ██╗
██╔══██╗██╔══██╗██╔════╝██║ ██╔╝
██║  ██║███████║███████╗█████╔╝ 
██║  ██║██╔══██║╚════██║██╔═██╗ 
██████╔╝██║  ██║███████║██║  ██╗
╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝
`}
        </pre>

        <div className="header-actions">
          <button className="btn export-btn" onClick={exportBills}>
            Export CSV
          </button>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="date-input"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="date-input"
          />
          <button className="btn primary itr-btn" onClick={downloadITRDocs}>
            Download ITR Documents
          </button>
        </div>
      </header>

      {isSuperAdmin && (
        <section className="dashboard-shop-picker">
          <div>
            <Store size={18} />
            <span>Select Shop</span>
          </div>
          <select
            value={selectedShopId}
            onChange={(e) => setSelectedShopId(e.target.value)}
          >
            <option value="">Select a shop by ID</option>
            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {getShopOptionLabel(shop)}
              </option>
            ))}
          </select>
        </section>
      )}

      {!effectiveShopId ? (
        <section className="dashboard-empty-state">
          <Store size={30} />
          <h2>Select a shop to view dashboard data</h2>
          <p>Superadmin dashboards are loaded from the selected shop ID.</p>
        </section>
      ) : (
        <>
      {/* Search */}
      <div className="search-container">
        <Search size={18} />
        <input
          type="text"
          placeholder="Search customer by name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
        />
      </div>

      {/* KPI Cards */}
      <section className="kpi-grid">
        <div className="kpi-card">
          <h4>Monthly Sales</h4>
          <span className="amount">{formatCurrency(stats.monthlySales)}</span>
        </div>
        <div className="kpi-card">
          <h4>Monthly Profit</h4>
          <span className="amount profit">{formatCurrency(stats.monthlyProfit)}</span>
        </div>
        <div className="kpi-card warning">
          <h4>Low Stock Items</h4>
          <span>{stats.lowStock}</span>
        </div>
        <div className="kpi-card danger">
          <h4>Unsold Products</h4>
          <span>{stats.unsoldProducts}</span>
          <small>{stats.unsoldUnits} units</small>
        </div>
        <div className="kpi-card">
          <h4>Est. Income Tax</h4>
          <span className="amount">{formatCurrency(itrAmount)}</span>
        </div>
        <div className="kpi-card">
          <h4>Total GST</h4>
          <span className="amount">{formatCurrency(gstAmount)}</span>
        </div>
      </section>

      {/* Charts */}
      <section className="chart-grid">
        <div className="chart-card">
          <h3>Stock by Category</h3>
          <Doughnut data={categoryChart} options={{ maintainAspectRatio: true }} />
        </div>
        <div className="chart-card">
          <h3>Payment Methods</h3>
          <Doughnut data={paymentChart} options={{ maintainAspectRatio: true }} />
        </div>
      </section>

      <section className="chart-grid">
        <div className="chart-card full-width">
          <h3>Yearly Profit Overview</h3>
          <Bar data={yearlyProfitChart} options={{ maintainAspectRatio: true }} />
        </div>
      </section>

      <section className="chart-grid">
        <div className="chart-card full-width">
          <h3>Last 7 Days Sales</h3>
          <Bar data={dailySalesChart} options={{ maintainAspectRatio: true }} />
        </div>
      </section>

      {/* Top Products */}
      <section className="top-products">
        <h2>Top Selling Products</h2>
        <div className="products-list">
          {topProducts.map(([name, qty], i) => (
            <div key={i} className="product-item">
              <span className="rank">#{i + 1}</span>
              <span className="name">{name}</span>
              <span className="qty">{qty} units</span>
            </div>
          ))}
          {topProducts.length === 0 && (
            <div className="no-data">No sales data available</div>
          )}
        </div>
      </section>

      {/* Low Stock */}
      <section className="low-stock">
        <h2>Low Stock Alert</h2>
        <div className="stock-list">
          {lowStockItems.map((p, i) => (
            <div key={i} className="stock-item">
              <span className="name">{p.name}</span>
              <span className="stock" style={{ color: p.stock <= 2 ? '#ef4444' : '#facc15' }}>
                {p.stock} units left
              </span>
            </div>
          ))}
          {lowStockItems.length === 0 && (
            <div className="no-data">No low stock items</div>
          )}
        </div>
      </section>

      {/* Staff Section */}
      <section className="staff-section">
        <h2>Staff Status</h2>
        <div className="staff-scroll-container">
          <div className="staff-roles-row">
            {renderTable("Admins", staffByRole.admin)}
            {renderTable("Managers", staffByRole.manager)}
            {renderTable("Cashiers", staffByRole.cashier)}
            {renderTable("Staff", staffByRole.staff)}
          </div>
        </div>
      </section>

      {/* Bills Section */}
      <section className="bills-section">
        <h2>Bills / Customers</h2>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Amount</th>
                <th>Payment Mode</th>
                <th>Status</th>
                <th>Cashier</th>
                <th>Date & Time</th>
              </tr>
            </thead>
            <tbody>
              {filteredBills.map((b, i) => (
                <tr key={b.id}>
                  <td>{i + 1}</td>
                  <td>{getCustomerName(b.buyerId, buyersMap)}</td>
                  <td>{getCustomerPhone(b.buyerId, buyersMap)}</td>
                  <td className="amount">{formatCurrency(b.totalAmount)}</td>
                  <td>
                    <span className={`payment-mode ${b.paymentMode?.toLowerCase()}`}>
                      {b.paymentMode?.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge ${b.paymentStatus === "Success" ? "success" : "pending"}`}>
                      {b.paymentStatus || "Success"}
                    </span>
                  </td>
                  <td>{b.cashierId}</td>
                  <td>{new Date(b.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {filteredBills.length === 0 && (
                <tr>
                  <td colSpan="8" className="no-data">
                    No bills found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
        </>
      )}

    </div>
  );
};

export default Dashboard;
