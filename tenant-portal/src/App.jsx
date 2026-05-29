import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import LoginScreen from "./LoginScreen";
import HomeDashboard from "./HomeDashboard";
import RentPaymentScreen from "./RentPaymentScreen";
import MaintenanceRequestForm from "./MaintenanceRequestForm";
import MessagingScreen from "./MessagingScreen";
import DocumentsScreen from "./DocumentsScreen";
import InsuranceValidator from './InsuranceValidator'
import BulletinBoard from './BulletinBoard'
import AccountScreen from './AccountScreen'
import LandlordDashboard from './LandlordDashboard'
import LandlordTenants from './LandlordTenants'
import LandlordTenantDetail from './LandlordTenantDetail'
import LandlordMaintenance from './LandlordMaintenance'
import LandlordFinancials from './LandlordFinancials'
import LandlordMessages from './LandlordMessages'
import LandlordProperties from './LandlordProperties'
import LandlordReports from './LandlordReports'
import LandlordSettings from './LandlordSettings'
import LandingPage from './LandingPage'

// ── Bottom nav bar — shown on all screens except login ───────────────────────
function BottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Don't show on login screen
  if (pathname === "/" || pathname === "/login" || pathname.startsWith("/landlord")) return null;

  const items = [
  { icon: "🏠", label: "Home",     path: "/home" },
  { icon: "💳", label: "Pay",      path: "/pay" },
  { icon: "🔧", label: "Requests", path: "/maintenance" },
  { icon: "💬", label: "Messages", path: "/messages" },
  { icon: "👤", label: "Account",  path: "/account" },
];

  return (
    <div style={{
      position: "fixed", bottom: 0, left: "50%",
      transform: "translateX(-50%)",
      width: "100%", maxWidth: 460,
      background: "#fff", borderTop: "1px solid #e8eaed",
      display: "flex", zIndex: 100,
    }}>
      {items.map(item => {
        const active = pathname === item.path;
        return (
          <button key={item.path} onClick={() => navigate(item.path)} style={{
            flex: 1, padding: "10px 0 8px",
            display: "flex", flexDirection: "column",
            alignItems: "center", gap: 3,
            background: "none", border: "none",
            cursor: "pointer",
            fontFamily: "'Inter', 'Segoe UI', sans-serif",
          }}>
            <span style={{ fontSize: 20 }}>{item.icon}</span>
            <span style={{
              fontSize: 10,
              fontWeight: active ? 600 : 400,
              color: active ? "#0C447C" : "#aaa",
            }}>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Login wrapper — redirects to /home after sign-in ─────────────────────────
function Login() {
  const navigate = useNavigate();
  return <LoginScreen onSuccess={() => navigate("/home")} />;
}

// ── Home wrapper — passes navigation handlers to dashboard buttons ────────────
function Home() {
  const navigate = useNavigate();
  return <HomeDashboard onNavigate={navigate} />;
}

// ── App routes ────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"     element={<LandingPage />} />
        <Route path="/login"       element={<Login />} />
        <Route path="/home"        element={<Home />} />
        <Route path="/pay"         element={<RentPaymentScreen />} />
        <Route path="/maintenance" element={<MaintenanceRequestForm />} />
        <Route path="/messages"    element={<MessagingScreen />} />
        <Route path="/documents"   element={<DocumentsScreen />} />
        <Route path="*"            element={<Login />} />
        <Route path="/bulletin" element={<BulletinBoard />} />
        <Route path="/account" element={<AccountScreen />} />
        <Route path="/insurance" element={<InsuranceValidator />} />
        <Route path="/landlord" element={<LandlordDashboard />} />
        <Route path="/landlord/tenants" element={<LandlordTenants />} />
        <Route path="/landlord/tenants/:id" element={<LandlordTenantDetail />} />
        <Route path="/landlord/maintenance" element={<LandlordMaintenance />} />
        <Route path="/landlord/financials" element={<LandlordFinancials />} />
        <Route path="/landlord/messages" element={<LandlordMessages />} />
        <Route path="/landlord/properties" element={<LandlordProperties />} />
        <Route path="/landlord/reports" element={<LandlordReports />} />
        <Route path="/landlord/rentroll" element={<LandlordReports />} />
        <Route path="/landlord/settings" element={<LandlordSettings />} />
        <Route path="/" element={<LandingPage />} />
      </Routes>
      <BottomNav />
    </BrowserRouter>
  );
}
