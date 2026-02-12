import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Users, ClipboardCheck, Wifi, LogIn } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-2">
              <Users className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-black tracking-tight text-foreground">
              Church Check-in
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Fast, simple guest tracking for your Sunday welcoming team.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/40">
              <ClipboardCheck className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">Quick Capture</p>
                <p className="text-xs text-muted-foreground">Add families and people in seconds with tap-to-toggle tiles</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/40">
              <Wifi className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">Real-time Sync</p>
                <p className="text-xs text-muted-foreground">Multiple team members can work together at the same time</p>
              </div>
            </div>
          </div>

          <Button
            className="w-full h-12 rounded-xl font-bold text-lg gap-2"
            data-testid="button-login"
            onClick={() => {
              window.location.href = "/api/login";
            }}
          >
            <LogIn className="w-5 h-5" />
            Sign In to Continue
          </Button>
        </div>
      </div>

      <footer className="text-center py-4">
        <p className="text-xs text-muted-foreground">Church Check-in App</p>
      </footer>
    </div>
  );
}
