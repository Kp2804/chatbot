import { RouterProvider } from "react-router";
import { createBrowserRouter, Navigate } from "react-router";
import { AuthPage } from "./components/auth/AuthPage";
import { Layout } from "./components/layout/Layout";
import { ChatInterface } from "./components/chat/ChatInterface";
import { WorkflowInterface } from "./components/workflow/WorkflowInterface";
import { WorkflowEditor } from "./components/workflow/WorkflowEditor";
import { FAQManager } from "./components/faq/FAQManager";
import { FAQEditor } from "./components/faq/FAQEditor";

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
    path: "/app",
    Component: Layout,
    children: [
      { index: true, Component: ChatInterface },
      { path: "workflows", Component: WorkflowInterface },
      { path: "workflows/:id", Component: WorkflowEditor },
      { path: "faq", Component: FAQManager },
      { path: "faq/:id", Component: FAQEditor },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
