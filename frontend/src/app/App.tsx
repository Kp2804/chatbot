import { RouterProvider } from "react-router";
import { createBrowserRouter, Navigate } from "react-router";
import type { ReactElement } from "react";
import { AuthPage } from "./components/auth/AuthPage";
import { Layout } from "./components/layout/Layout";
import { ChatInterface } from "./components/chat/ChatInterface";
import { WorkflowInterface } from "./components/workflow/WorkflowInterface";
import { WorkflowEditor } from "./components/workflow/WorkflowEditor";
import { FAQManager } from "./components/faq/FAQManager";
import { FAQEditor } from "./components/faq/FAQEditor";
import { AnalyticsPage } from "./components/analytics/AnalyticsPage";
import { ChatbotSelectionPage } from "./components/chat/ChatbotSelectionPage";
import { ChatbotManagePage } from "./components/chat/ChatbotManagePage";
import { EmbeddedChatPage } from "./components/chat/EmbeddedChatPage";
import { ProfilePage } from "./components/profile/ProfilePage";
import { SettingsPage } from "./components/settings/SettingsPage";
import { KnowledgeBasePage } from "./components/knowledge/KnowledgeBasePage";
import { PricingPage } from "./components/billing/PricingPage";
import { AdminChatbotsPage } from "./components/admin/AdminChatbotsPage";
import { AdminUsersPage } from "./components/admin/AdminUsersPage";
import { LandingPage } from "./components/marketing/LandingPage";
import { Toaster } from "sonner";
import { useUserRole, type AppRole } from "./hooks/useUserRole";

function RoleProtectedRoute({
  allow,
  children,
}: {
  allow: AppRole[];
  children: ReactElement;
}) {
  const { loading, role } = useUserRole();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-white dark:bg-[#0f0f13] text-gray-600 dark:text-gray-300">
        Loading workspace...
      </div>
    );
  }

  if (!role) {
    return <Navigate to="/auth" replace />;
  }

  if (!allow.includes(role)) {
    return <Navigate to="/app" replace />;
  }

  return children;
}

const router = createBrowserRouter([
  {
    path: "/",
    Component: LandingPage,
  },
  {
    path: "/auth",
    Component: AuthPage,
  },
  {
    path: "/embed/:chatbotId",
    Component: EmbeddedChatPage,
  },
  {
    path: "/app",
    Component: Layout,
    children: [
      { index: true, element: <Navigate to="/app/workflows" replace /> },
      { path: "chatbots", Component: ChatbotSelectionPage },
      { path: "chat", element: <Navigate to="/app/chatbots" replace /> },
      { path: "chat/:chatbotId", Component: ChatInterface },
      {
        path: "chat/:chatbotId/manage",
        element: (
          <RoleProtectedRoute allow={["admin", "superadmin"]}>
            <ChatbotManagePage />
          </RoleProtectedRoute>
        ),
      },
      { path: "workflows", Component: WorkflowInterface },
      { path: "workflows/:id", Component: WorkflowEditor },
      { path: "faq", Component: FAQManager },
      { path: "faq/:id", Component: FAQEditor },
      {
        path: "analytics",
        element: (
          <RoleProtectedRoute allow={["admin", "superadmin"]}>
            <AnalyticsPage />
          </RoleProtectedRoute>
        ),
      },
      {
        path: "knowledge",
        element: (
          <RoleProtectedRoute allow={["superadmin", "admin", "customer"]}>
            <KnowledgeBasePage />
          </RoleProtectedRoute>
        ),
      },
      { path: "profile", Component: ProfilePage },
      { path: "pricing", Component: PricingPage },
      {
        path: "settings",
        element: (
          <RoleProtectedRoute allow={["admin", "superadmin"]}>
            <SettingsPage />
          </RoleProtectedRoute>
        ),
      },
      {
        path: "admin/chatbots",
        element: (
          <RoleProtectedRoute allow={["superadmin"]}>
            <AdminChatbotsPage />
          </RoleProtectedRoute>
        ),
      },
      {
        path: "admin/users",
        element: (
          <RoleProtectedRoute allow={["superadmin"]}>
            <AdminUsersPage />
          </RoleProtectedRoute>
        ),
      },
    ],
  },
]);

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster
        richColors
        position="top-right"
        theme="system"
        toastOptions={{
          className: "border border-gray-300 dark:border-white/10",
        }}
      />
    </>
  );
}
