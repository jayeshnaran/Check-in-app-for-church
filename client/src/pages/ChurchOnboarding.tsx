import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Church, Users, Search, Plus, Clock, LogOut, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Church as ChurchType } from "@shared/schema";

type Step = "choose" | "create" | "join" | "pending";

export default function ChurchOnboarding({ pendingChurchName }: { pendingChurchName?: string }) {
  const [step, setStep] = useState<Step>(pendingChurchName ? "pending" : "choose");
  const [churchName, setChurchName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: searchResults } = useQuery<ChurchType[]>({
    queryKey: ["/api/churches/search", searchQuery],
    queryFn: async () => {
      if (searchQuery.length < 2) return [];
      const res = await fetch(`/api/churches/search?q=${encodeURIComponent(searchQuery)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: searchQuery.length >= 2,
  });

  const createChurch = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/churches", { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/membership"] });
      toast({ title: "Church Created", description: "You are now the admin of this church." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create church.", variant: "destructive" });
    },
  });

  const joinChurch = useMutation({
    mutationFn: async (churchId: number) => {
      const res = await apiRequest("POST", "/api/membership/join", { churchId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/membership"] });
      setStep("pending");
      toast({ title: "Request Sent", description: "Waiting for the church admin to approve your request." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send join request.", variant: "destructive" });
    },
  });

  if (step === "pending") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <Card className="w-full max-w-sm rounded-3xl border-none shadow-xl bg-card p-6 space-y-6">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-100 dark:bg-orange-900/30 mb-2">
              <Clock className="w-8 h-8 text-orange-500" />
            </div>
            <h2 className="text-2xl font-black">Approval Pending</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Your request to join <span className="font-semibold text-foreground">{pendingChurchName || "the church"}</span> is waiting for admin approval. You'll get access once approved.
            </p>
          </div>
          <Button
            variant="outline"
            className="w-full h-11 rounded-xl gap-2"
            data-testid="button-logout-pending"
            onClick={() => { window.location.href = "/api/logout"; }}
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </Card>
      </div>
    );
  }

  if (step === "create") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <Card className="w-full max-w-sm rounded-3xl border-none shadow-xl bg-card p-6 space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-black">Create Church Account</h2>
            <p className="text-muted-foreground text-sm">You'll be the admin for this church.</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Church Name</Label>
              <Input
                value={churchName}
                onChange={(e) => setChurchName(e.target.value)}
                placeholder="e.g. Grace Community Church"
                className="rounded-xl h-11 bg-muted/50 border-none"
                data-testid="input-church-name"
              />
            </div>

            <Button
              className="w-full h-12 rounded-xl font-bold text-lg"
              disabled={!churchName.trim() || createChurch.isPending}
              data-testid="button-create-church"
              onClick={() => createChurch.mutate(churchName.trim())}
            >
              {createChurch.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Create Church"}
            </Button>

            <Button
              variant="ghost"
              className="w-full rounded-xl"
              onClick={() => setStep("choose")}
              data-testid="button-back-to-choose"
            >
              Back
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (step === "join") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <Card className="w-full max-w-sm rounded-3xl border-none shadow-xl bg-card p-6 space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-black">Join a Church</h2>
            <p className="text-muted-foreground text-sm">Search for your church to request access.</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Search Churches</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Type church name..."
                  className="rounded-xl h-11 bg-muted/50 border-none pl-9"
                  data-testid="input-search-church"
                />
              </div>
            </div>

            {searchResults && searchResults.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {searchResults.map((church) => (
                  <div
                    key={church.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover-elevate cursor-pointer"
                    data-testid={`church-result-${church.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Church className="w-5 h-5 text-primary" />
                      </div>
                      <span className="font-semibold text-sm">{church.name}</span>
                    </div>
                    <Button
                      size="sm"
                      disabled={joinChurch.isPending}
                      data-testid={`button-join-${church.id}`}
                      onClick={() => joinChurch.mutate(church.id)}
                    >
                      {joinChurch.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Join"}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {searchQuery.length >= 2 && searchResults && searchResults.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">No churches found matching "{searchQuery}"</p>
            )}

            <Button
              variant="ghost"
              className="w-full rounded-xl"
              onClick={() => setStep("choose")}
              data-testid="button-back-to-choose-from-join"
            >
              Back
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-2">
            <Church className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">Set Up Your Church</h1>
          <p className="text-muted-foreground text-sm">Choose how you'd like to get started.</p>
        </div>

        <div className="space-y-3">
          <Card
            className="p-4 cursor-pointer hover-elevate rounded-2xl border-2 border-transparent"
            data-testid="button-create-new-church"
            onClick={() => setStep("create")}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Plus className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-bold text-foreground">Create a New Church Account</p>
                <p className="text-xs text-muted-foreground mt-1">Start fresh. You'll be the admin and can invite team members.</p>
              </div>
            </div>
          </Card>

          <Card
            className="p-4 cursor-pointer hover-elevate rounded-2xl border-2 border-transparent"
            data-testid="button-join-existing-church"
            onClick={() => setStep("join")}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-secondary/80 flex items-center justify-center shrink-0 mt-0.5">
                <Users className="w-5 h-5 text-secondary-foreground" />
              </div>
              <div>
                <p className="font-bold text-foreground">Join an Existing Church Account</p>
                <p className="text-xs text-muted-foreground mt-1">Search for your church and request to join the team.</p>
              </div>
            </div>
          </Card>
        </div>

        <Button
          variant="ghost"
          className="w-full rounded-xl gap-2"
          data-testid="button-logout-onboarding"
          onClick={() => { window.location.href = "/api/logout"; }}
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
