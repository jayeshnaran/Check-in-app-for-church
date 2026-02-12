import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import Settings from "@/pages/Settings";
import Dashboard from "@/pages/Dashboard";
import LandingPage from "@/pages/LandingPage";
import ChurchOnboarding from "@/pages/ChurchOnboarding";
import { Loader2 } from "lucide-react";
import type { ChurchMember, Church } from "@shared/schema";

function AuthenticatedRouter() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  const { data: membership, isLoading: membershipLoading } = useQuery<(ChurchMember & { church: Church }) | null>({
    queryKey: ["/api/membership"],
    queryFn: async () => {
      const res = await fetch("/api/membership", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isAuthenticated,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  if (authLoading || (isAuthenticated && membershipLoading)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LandingPage />;
  }

  if (!membership) {
    return <ChurchOnboarding />;
  }

  if (membership.status === "pending") {
    return <ChurchOnboarding pendingChurchName={membership.church?.name} />;
  }

  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AuthenticatedRouter />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
