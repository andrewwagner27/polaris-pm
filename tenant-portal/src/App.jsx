import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// Landlord
import LandlordLogin          from "./LandlordLogin";
import LandlordDashboard      from "./LandlordDashboard";
import LandlordTenants        from "./LandlordTenants";
import LandlordTenantDetail   from "./LandlordTenantDetail";
import LandlordProperties     from "./LandlordProperties";
import LandlordMaintenance    from "./LandlordMaintenance";
import LandlordFinancials     from "./LandlordFinancials";
import LandlordMessages       from "./LandlordMessages";
import LandlordReports        from "./LandlordReports";
import LandlordSettings       from "./LandlordSettings";
import LandlordApplications   from "./LandlordApplications";
import ProtectedLandlordRoute from "./ProtectedLandlordRoute";

// Tenant
import LoginScreen            from "./LoginScreen";
import TenantOnboarding       from "./TenantOnboarding";
import HomeDashboard          from "./HomeDashboard";
import RentPaymentScreen      from "./RentPaymentScreen";
import TenantMaintenanceList  from "./TenantMaintenanceList";
import TenantMaintenanceDetail from "./TenantMaintenanceDetail";
import MessagingScreen        from "./MessagingScreen";
import BulletinBoard          from "./BulletinBoard";
import AccountScreen          from "./AccountScreen";
import DocumentsScreen        from "./DocumentsScreen";
import AuthCallback           from "./AuthCallback";
import LandingPage            from "./LandingPage";
import ForgotPassword         from "./ForgotPassword";
import ResetPassword          from "./ResetPassword";
import VendorAccess           from "./VendorAccess";
import VendorTicket           from "./VendorTicket";

function ProtectedTenantRoute({ children }) {
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { setStatus("unauth"); return; }
      const meta = session.user?.user_metadata || {};
      if (meta.role === "landlord") { setStatus("landlord"); return; }
      setStatus("ok");
    });
  }, []);

  if (status === "loading") return null;
  if (status === "unauth")  return <Navigate to="/login" replace/>;
  if (status === "landlord") return <Navigate to="/landlord" replace/>;
  return children;
}

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Public */}
        <Route path="/"                element={<LandingPage/>}/>
        <Route path="/login"           element={<LoginScreen/>}/>
        <Route path="/forgot-password" element={<ForgotPassword/>}/>
        <Route path="/reset-password"  element={<ResetPassword/>}/>
        <Route path="/auth/callback"   element={<AuthCallback/>}/>
        <Route path="/onboarding"      element={<TenantOnboarding/>}/>
        <Route path="/vendor/:token"   element={<VendorAccess/>}/>
        <Route path="/vendor/ticket/:token" element={<VendorTicket/>}/>

        {/* Tenant */}
        <Route path="/home"              element={<ProtectedTenantRoute><HomeDashboard/></ProtectedTenantRoute>}/>
        <Route path="/pay"               element={<ProtectedTenantRoute><RentPaymentScreen/></ProtectedTenantRoute>}/>
        <Route path="/maintenance"       element={<ProtectedTenantRoute><TenantMaintenanceList/></ProtectedTenantRoute>}/>
        <Route path="/maintenance/:id"   element={<ProtectedTenantRoute><TenantMaintenanceDetail/></ProtectedTenantRoute>}/>
        <Route path="/messages"          element={<ProtectedTenantRoute><MessagingScreen/></ProtectedTenantRoute>}/>
        <Route path="/bulletin"          element={<ProtectedTenantRoute><BulletinBoard/></ProtectedTenantRoute>}/>
        <Route path="/account"           element={<ProtectedTenantRoute><AccountScreen/></ProtectedTenantRoute>}/>
        <Route path="/documents"         element={<ProtectedTenantRoute><DocumentsScreen/></ProtectedTenantRoute>}/>

        {/* Landlord */}
        <Route path="/landlord/login"            element={<LandlordLogin/>}/>
        <Route path="/landlord"                  element={<ProtectedLandlordRoute><LandlordDashboard/></ProtectedLandlordRoute>}/>
        <Route path="/landlord/properties"       element={<ProtectedLandlordRoute><LandlordProperties/></ProtectedLandlordRoute>}/>
        <Route path="/landlord/tenants"          element={<ProtectedLandlordRoute><LandlordTenants/></ProtectedLandlordRoute>}/>
        <Route path="/landlord/tenants/:id"      element={<ProtectedLandlordRoute><LandlordTenantDetail/></ProtectedLandlordRoute>}/>
        <Route path="/landlord/applications"     element={<ProtectedLandlordRoute><LandlordApplications/></ProtectedLandlordRoute>}/>
        <Route path="/landlord/maintenance"      element={<ProtectedLandlordRoute><LandlordMaintenance/></ProtectedLandlordRoute>}/>
        <Route path="/landlord/maintenance/:id"  element={<ProtectedLandlordRoute><LandlordMaintenance/></ProtectedLandlordRoute>}/>
        <Route path="/landlord/financials"       element={<ProtectedLandlordRoute><LandlordFinancials/></ProtectedLandlordRoute>}/>
        <Route path="/landlord/messages"         element={<ProtectedLandlordRoute><LandlordMessages/></ProtectedLandlordRoute>}/>
        <Route path="/landlord/reports"          element={<ProtectedLandlordRoute><LandlordReports/></ProtectedLandlordRoute>}/>
        <Route path="/landlord/settings"         element={<ProtectedLandlordRoute><LandlordSettings/></ProtectedLandlordRoute>}/>

        <Route path="*" element={<Navigate to="/" replace/>}/>
      </Routes>
    </Router>
  );
}