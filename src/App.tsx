import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useStore } from '@/store';
import { UNAUTH_EVENT, clearAuth } from '@/api/client';
import LoginPage from '@/pages/LoginPage';
import WorkspaceSelectionPage from '@/pages/WorkspaceSelectionPage';
import NotFoundPage from '@/pages/NotFoundPage';
import InternalLayout from '@/layouts/InternalLayout';
import InternalDashboardPage from '@/features/internal/dashboard/InternalDashboardPage';
import ProspectsListPage from '@/features/internal/prospects/ProspectsListPage';
import ProspectProfilePage from '@/features/internal/prospects/ProspectProfilePage';
import AuditsListPage from '@/features/internal/audits/AuditsListPage';
import AuditDetailPage from '@/features/internal/audits/AuditDetailPage';
import OutreachBoardPage from '@/features/internal/outreach/OutreachBoardPage';
import SalesProposalsPage from '@/features/internal/sales/SalesProposalsPage';
import ReportsPage from '@/features/internal/reports/ReportsPage';
import FounderAIPage from '@/features/internal/ai/FounderAIPage';
import AIExecutionsPage from '@/features/internal/ai/AIExecutionsPage';
import IntegrationHealthPage from '@/features/internal/integrations/IntegrationHealthPage';
import InternalSettingsPage from '@/features/internal/settings/InternalSettingsPage';
import ClinicOnboardingPage from '@/features/onboarding/ClinicOnboardingPage';
import ClinicLayout from '@/layouts/ClinicLayout';
import ClinicDashboardPage from '@/features/clinic/dashboard/ClinicDashboardPage';
import LeadsListPage from '@/features/clinic/leads/LeadsListPage';
import LeadDetailPage from '@/features/clinic/leads/LeadDetailPage';
import ConversationsPage from '@/features/clinic/conversations/ConversationsPage';
import AppointmentsPage from '@/features/clinic/appointments/AppointmentsPage';
import FollowupsPage from '@/features/clinic/followups/FollowupsPage';
import ReviewsPage from '@/features/clinic/reviews/ReviewsPage';
import ReferralsPage from '@/features/clinic/referrals/ReferralsPage';
import AnalyticsPage from '@/features/clinic/analytics/AnalyticsPage';
import ClinicSettingsPage from '@/features/clinic/settings/ClinicSettingsPage';

function RequireAuth({ children }: { children: JSX.Element }) {
  const session = useStore((s) => s.session);
  const location = useLocation();
  if (!session.email) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

function RequireClinicWorkspace({ children }: { children: JSX.Element }) {
  const session = useStore((s) => s.session);
  const clinics = useStore((s) => s.clinics);
  const setActiveClinic = useStore((s) => s.setActiveClinic);

  if (session.currentWorkspace !== 'clinic') {
    return <Navigate to="/select-workspace" replace />;
  }

  if (!session.activeClinicId && Object.keys(clinics).length > 0) {
    setActiveClinic(Object.keys(clinics)[0]);
  }

  return children;
}

function AuthInitializer({ children }: { children: JSX.Element }) {
  const navigate = useNavigate();
  const restoreSession = useStore((s) => s.restoreSession);
  const logout = useStore((s) => s.logout);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    const handler = () => {
      logout();
      clearAuth();
      navigate('/login', { replace: true });
    };
    window.addEventListener(UNAUTH_EVENT, handler);
    return () => window.removeEventListener(UNAUTH_EVENT, handler);
  }, [navigate, logout]);

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthInitializer>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/select-workspace"
          element={
            <RequireAuth>
              <WorkspaceSelectionPage />
            </RequireAuth>
          }
        />
        <Route
          path="/internal/*"
          element={
            <RequireAuth>
              <InternalLayout />
            </RequireAuth>
          }
        >
          <Route index element={<InternalDashboardPage />} />
          <Route path="prospects" element={<ProspectsListPage />} />
          <Route path="prospects/:prospectId" element={<ProspectProfilePage />} />
          <Route path="audits" element={<AuditsListPage />} />
          <Route path="audits/:auditId" element={<AuditDetailPage />} />
          <Route path="outreach" element={<OutreachBoardPage />} />
          <Route path="sales" element={<SalesProposalsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="ai" element={<FounderAIPage />} />
          <Route path="ai/executions" element={<AIExecutionsPage />} />
          <Route path="integrations" element={<IntegrationHealthPage />} />
          <Route path="settings" element={<InternalSettingsPage />} />
        </Route>
        <Route
          path="/clinic/*"
          element={
            <RequireAuth>
              <RequireClinicWorkspace>
                <ClinicLayout />
              </RequireClinicWorkspace>
            </RequireAuth>
          }
        >
          <Route index element={<ClinicDashboardPage />} />
          <Route path="leads" element={<LeadsListPage />} />
          <Route path="leads/:leadId" element={<LeadDetailPage />} />
          <Route path="conversations" element={<ConversationsPage />} />
          <Route path="appointments" element={<AppointmentsPage />} />
          <Route path="follow-ups" element={<FollowupsPage />} />
          <Route path="reviews" element={<ReviewsPage />} />
          <Route path="referrals" element={<ReferralsPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="settings" element={<ClinicSettingsPage />} />
        </Route>
      <Route
        path="/onboarding/:prospectId"
        element={
          <RequireAuth>
            <ClinicOnboardingPage />
          </RequireAuth>
        }
      />
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AuthInitializer>
  );
}