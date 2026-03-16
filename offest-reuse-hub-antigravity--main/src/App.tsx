/**
 * @file App.tsx
 * @description Main application entry point that sets up routing, global providers 
 * (QueryClient, Toaster, Tooltip), and handles protected route logic for authenticated users.
 */
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { PageTransitionLoader } from "@/components/shared/PageLoader";
import Index from "./pages/Index";
import ListingDetail from "./pages/ListingDetail";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import SellerDashboard from "./pages/SellerDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import PendingApproval from "./pages/PendingApproval";
import Profile from "./pages/Profile";
import ContactUs from "./pages/ContactUs";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

/**
 * ProtectedRoute Component
 * Ensures that only authenticated and approved users (or admins) can access specific dashboard routes.
 * Redirects unapproved users to the pending approval page and unauthenticated users to login.
 *
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - The child components to render if access is granted
 */
const ProtectedRoute = ({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) => {
  const { user, isLoading, isApproved, isAdmin } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isApproved && !isAdmin) {
    return <Navigate to="/pending-approval" replace />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

/**
 * App Component
 * Defines the main routing structure using react-router-dom.
 * Wraps the application in necessary context providers for state management and UI components.
 */
const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <PageTransitionLoader />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/listing/:id" element={<ListingDetail />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/contact" element={<ContactUs />} />
          <Route path="/pending-approval" element={<PendingApproval />} />
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <SellerDashboard />
            </ProtectedRoute>
          } />
          <Route path="/admin" element={
            <ProtectedRoute requireAdmin>
              <AdminDashboard />
            </ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          } />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
