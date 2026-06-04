import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import LoginScreen from "./LoginScreen";
import HomeDashboard from "./HomeDashboard";
import RentPaymentScreen from "./RentPaymentScreen";
import MaintenanceRequestForm from "./MaintenanceRequestForm";
import MessagingScreen from "./MessagingScreen";
import DocumentsScreen from "./DocumentsScreen";
import InsuranceValidator from './InsuranceValidator';
import BulletinBoard from './BulletinBoard';
import AccountScreen from './AccountScreen';
import LandlordDashboard from './LandlordDashboard';
import LandlordTenants from './LandlordTenants';
import LandlordTenantDetail from './LandlordTenantDetail';
import LandlordMaintenance from './LandlordMaintenance';
import LandlordFinancials from './LandlordFinancials';
import LandlordMessages from './LandlordMessages';
import LandlordProperties from './LandlordProperties';
import LandlordReports from './LandlordReports';
import LandlordSettings from './LandlordSettings';
import LandingPage from './LandingPage';
import TenantOnboarding from './TenantOnboarding';
import AuthCallback from './AuthCallback';
import LandlordLogin from './LandlordLogin';
import ProtectedLandlordRoute from './ProtectedLandlordRoute';
import ForgotPassword from './ForgotPassword';
import ResetPassword from './ResetPassword';
import TenantMaintenanceList from './TenantMaintenanceList';
import TenantMaintenanceDetail from './TenantMaintenanceDetail';
import VendorAccess from './VendorAccess';
import VendorTicket from './VendorTicket';

function Login() {
  const navigate = useNavigate();
  return <LoginScreen onSuccess={(user) => {
    if (user?.user_metadata?.onboarding_complete) {
      navigate("/home");
    } else {
      navigate("/onboarding");
    }
  }} />;
}

function Home() {
  const navigate = useNavigate();
  return <HomeDashboard onNavigate={navigate} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"                        element={<LandingPage />} />
        <Route path="/login"                   element={<Login />} />
        <Route path="/forgot-password"         element={<ForgotPassword />} />
        <Route path="/reset-password"          element={<ResetPassword />} />
        <Route path="/home"                    element={<Home />} />
        <Route path="/pay"                     element={<RentPaymentScreen />} />
        <Route path="/maintenance"             element={<TenantMaintenanceList />} />
        <Route path="/maintenance/new"         element={<MaintenanceRequestForm />} />
        <Route path="/maintenance/:id"         element={<TenantMaintenanceDetail />} />
        <Route path="/messages"                element={<MessagingScreen />} />
        <Route path="/documents"               element={<DocumentsScreen />} />
        <Route path="/bulletin"                element={<BulletinBoard />} />
        <Route path="/account"                 element={<AccountScreen />} />
        <Route path="/insurance"               element={<InsuranceValidator />} />
        <Route path="/onboarding"              element={<TenantOnboarding />} />
        <Route path="/auth/callback"           element={<AuthCallback />} />
        <Route path="/vendor/:token"           element={<VendorAccess />} />
        <Route path="/vendor/ticket/:token"    element={<VendorTicket />} />
        <Route path="/landlord/login"          element={<LandlordLogin />} />
        <Route path="/landlord"                element={<ProtectedLandlordRoute><LandlordDashboard /></ProtectedLandlordRoute>} />
        <Route path="/landlord/tenants"        element={<ProtectedLandlordRoute><LandlordTenants /></ProtectedLandlordRoute>} />
        <Route path="/landlord/tenants/:id"    element={<ProtectedLandlordRoute><LandlordTenantDetail /></ProtectedLandlordRoute>} />
        <Route path="/landlord/maintenance"    element={<ProtectedLandlordRoute><LandlordMaintenance /></ProtectedLandlordRoute>} />
        <Route path="/landlord/financials"     element={<ProtectedLandlordRoute><LandlordFinancials /></ProtectedLandlordRoute>} />
        <Route path="/landlord/messages"       element={<ProtectedLandlordRoute><LandlordMessages /></ProtectedLandlordRoute>} />
        <Route path="/landlord/properties"     element={<ProtectedLandlordRoute><LandlordProperties /></ProtectedLandlordRoute>} />
        <Route path="/landlord/rentroll"       element={<ProtectedLandlordRoute><LandlordReports /></ProtectedLandlordRoute>} />
        <Route path="/landlord/reports"        element={<ProtectedLandlordRoute><LandlordReports /></ProtectedLandlordRoute>} />
        <Route path="/landlord/settings"       element={<ProtectedLandlordRoute><LandlordSettings /></ProtectedLandlordRoute>} />
        <Route path="*"                        element={<Login />} />
      </Routes>
    </BrowserRouter>
  );
}