import { RouterProvider } from "react-router";
import { createBrowserRouter, Navigate } from "react-router";
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
import { Toaster } from "sonner";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/auth" replace />,
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
      { index: true, Component: ChatbotSelectionPage },
      { path: "chat", element: <Navigate to="/app" replace /> },
      { path: "chat/:chatbotId", Component: ChatInterface },
      { path: "chat/:chatbotId/manage", Component: ChatbotManagePage },
      { path: "workflows", Component: WorkflowInterface },
      { path: "workflows/:id", Component: WorkflowEditor },
      { path: "faq", Component: FAQManager },
      { path: "faq/:id", Component: FAQEditor },
      { path: "analytics", Component: AnalyticsPage },
      { path: "knowledge", Component: KnowledgeBasePage },
      { path: "profile", Component: ProfilePage },
      { path: "pricing", Component: PricingPage },
      { path: "settings", Component: SettingsPage },
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
