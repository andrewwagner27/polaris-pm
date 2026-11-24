import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { PropertyScopeProvider } from "./lib/propertyScope";
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import AuthLinkError, { LinkErrorCatcher } from "./AuthLinkError";

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
import LandlordAgentCenter    from "./LandlordAgentCenter";
import EvictionWatch          from "./EvictionWatch";
import LandlordInspection    from "./LandlordInspection";
import FinancialSnapshot     from "./FinancialSnapshot";
import BudgetVsActual        from "./BudgetVsActual";

// Tenant
import LoginScreen            from "./LoginScreen";
import TenantOnboarding       from "./TenantOnboarding";
import HomeDashboard          from "./HomeDashboard";
import RentPaymentScreen      from "./RentPaymentScreen";
import TenantMaintenanceList  from "./TenantMaintenanceList";
import TenantMaintenanceDetail from "./TenantMaintenanceDetail";
import MaintenanceRequestForm from "./MaintenanceRequestForm";
import MessagingScreen        from "./MessagingScreen";
import BulletinBoard          from "./BulletinBoard";
import AccountScreen          from "./AccountScreen";
import ActivityLedger         from "./ActivityLedger";
import Wallet                  from "./Wallet";
import DocumentsScreen        from "./DocumentsScreen";
import MoveInInspection      from "./MoveInInspection";
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
      <LinkErrorCatcher/>
      <Routes>
        {/* Public */}
        <Route path="/"                element={<LandingPage/>}/>
        <Route path="/about"           element={<LandingPage page="about"/>}/>
        <Route path="/faq"             element={<LandingPage page="faq"/>}/>
        <Route path="/contact"         element={<LandingPage page="contact"/>}/>
        <Route path="/login"           element={<LoginScreen/>}/>
        <Route path="/forgot-password" element={<ForgotPassword/>}/>
        <Route path="/reset-password"  element={<ResetPassword/>}/>
        <Route path="/link-error"      element={<AuthLinkError/>}/>
        <Route path="/auth/callback"   element={<AuthCallback/>}/>
        <Route path="/onboarding"      element={<TenantOnboarding/>}/>
        <Route path="/vendor/:token"   element={<VendorAccess/>}/>
        <Route path="/vendor/ticket/:token" element={<VendorTicket/>}/>

        {/* Tenant */}
        <Route path="/home"              element={<ProtectedTenantRoute><HomeDashboard/></ProtectedTenantRoute>}/>
        <Route path="/pay"               element={<ProtectedTenantRoute><RentPaymentScreen/></ProtectedTenantRoute>}/>
        <Route path="/maintenance"       element={<ProtectedTenantRoute><TenantMaintenanceList/></ProtectedTenantRoute>}/>
        <Route path="/maintenance/new"    element={<ProtectedTenantRoute><MaintenanceRequestForm/></ProtectedTenantRoute>}/>
        <Route path="/maintenance/:id"   element={<ProtectedTenantRoute><TenantMaintenanceDetail/></ProtectedTenantRoute>}/>
        <Route path="/messages"          element={<ProtectedTenantRoute><MessagingScreen/></ProtectedTenantRoute>}/>
        <Route path="/bulletin"          element={<ProtectedTenantRoute><BulletinBoard/></ProtectedTenantRoute>}/>
        <Route path="/account"           element={<ProtectedTenantRoute><AccountScreen/></ProtectedTenantRoute>}/>
        <Route path="/activity"          element={<ProtectedTenantRoute><ActivityLedger/></ProtectedTenantRoute>}/>
        <Route path="/wallet"            element={<ProtectedTenantRoute><Wallet/></ProtectedTenantRoute>}/>
        <Route path="/documents"         element={<ProtectedTenantRoute><DocumentsScreen/></ProtectedTenantRoute>}/>
        <Route path="/inspection"        element={<ProtectedTenantRoute><MoveInInspection/></ProtectedTenantRoute>}/>

        {/* Landlord */}
        <Route path="/landlord/login"           element={<LandlordLogin/>}/>
        {/* One property scope for the whole management app (survives navigation between landlord pages). */}
        <Route element={<ProtectedLandlordRoute><PropertyScopeProvider><Outlet/></PropertyScopeProvider></ProtectedLandlordRoute>}>
          <Route path="/landlord"                 element={<LandlordDashboard/>}/>
          <Route path="/landlord/properties"      element={<LandlordProperties/>}/>
          <Route path="/landlord/tenants"         element={<LandlordTenants/>}/>
          <Route path="/landlord/tenants/:id"     element={<LandlordTenantDetail/>}/>
          <Route path="/landlord/applications"    element={<LandlordApplications/>}/>
          <Route path="/landlord/maintenance"     element={<LandlordMaintenance/>}/>
          <Route path="/landlord/maintenance/:id" element={<LandlordMaintenance/>}/>
          <Route path="/landlord/financials"              element={<LandlordFinancials/>}/>
          <Route path="/landlord/financials/:tenantId"   element={<LandlordFinancials/>}/>
          <Route path="/landlord/messages"        element={<LandlordMessages/>}/>
          <Route path="/landlord/reports"         element={<LandlordReports/>}/>
          <Route path="/landlord/snapshot"        element={<FinancialSnapshot/>}/>
          <Route path="/landlord/budgets"         element={<BudgetVsActual/>}/>
          <Route path="/landlord/agent"           element={<LandlordAgentCenter/>}/>
          <Route path="/landlord/settings"        element={<LandlordSettings/>}/>
          <Route path="/landlord/evictions"       element={<EvictionWatch/>}/>
          <Route path="/landlord/inspections"     element={<LandlordInspection/>}/>
        </Route>

        <Route path="*" element={<Navigate to="/" replace/>}/>
      </Routes>
    </Router>
  );
}
