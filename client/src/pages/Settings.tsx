import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save, Check, X, Loader2, Users, Church } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";
import type { ChurchMember, Church as ChurchType } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [offlineMode, setOfflineMode] = useState(localStorage.getItem("offline_mode") === "true");
  const [serviceTimes, setServiceTimes] = useState<string[]>(JSON.parse(localStorage.getItem("service_times") || '["09:30"]'));
  const [newTime, setNewTime] = useState("");

  const { data: membership } = useQuery<(ChurchMember & { church: ChurchType }) | null>({
    queryKey: ["/api/membership"],
    queryFn: async () => {
      const res = await fetch("/api/membership", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const isAdmin = membership?.role === "admin";

  const { data: pendingMembers } = useQuery<ChurchMember[]>({
    queryKey: ["/api/membership/pending"],
    queryFn: async () => {
      const res = await fetch("/api/membership/pending", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAdmin,
    refetchInterval: 10000,
  });

  const approveMember = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("PATCH", `/api/membership/${id}/approve`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/membership/pending"] });
      toast({ title: "Approved", description: "Member has been approved." });
    },
  });

  const rejectMember = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", `/api/membership/${id}/reject`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/membership/pending"] });
      toast({ title: "Rejected", description: "Request has been removed." });
    },
  });

  const [churchName, setChurchName] = useState(membership?.church?.name || "");
  const [churchDesc, setChurchDesc] = useState(membership?.church?.description || "");

  const updateChurch = useMutation({
    mutationFn: async () => {
      if (!membership) return;
      const res = await apiRequest("PUT", `/api/churches/${membership.churchId}`, {
        name: churchName,
        description: churchDesc,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/membership"] });
      toast({ title: "Updated", description: "Church info has been saved." });
    },
  });

  const handleSave = () => {
    localStorage.setItem("offline_mode", offlineMode.toString());
    localStorage.setItem("service_times", JSON.stringify(serviceTimes));
    toast({
      title: "Settings Saved",
      description: "Configuration has been updated.",
    });
    setTimeout(() => {
      window.location.href = "/";
    }, 500);
  };

  const addTime = () => {
    if (newTime && !serviceTimes.includes(newTime)) {
      setServiceTimes([...serviceTimes, newTime].sort());
      setNewTime("");
    }
  };

  const removeTime = (time: string) => {
    setServiceTimes(serviceTimes.filter(t => t !== time));
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="rounded-full" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-black tracking-tight">Settings</h1>
        </div>

        {membership?.church && (
          <Card className="rounded-3xl border-none shadow-sm bg-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Church className="w-5 h-5 text-primary" />
                Church Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isAdmin ? (
                <>
                  <div className="space-y-2">
                    <Label>Church Name</Label>
                    <Input
                      value={churchName || membership.church.name || ""}
                      onChange={(e) => setChurchName(e.target.value)}
                      className="rounded-xl bg-muted/50 border-none h-11"
                      data-testid="input-church-name-edit"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input
                      value={churchDesc || membership.church.description || ""}
                      onChange={(e) => setChurchDesc(e.target.value)}
                      placeholder="Brief description of your church"
                      className="rounded-xl bg-muted/50 border-none h-11"
                      data-testid="input-church-description"
                    />
                  </div>
                  <Button
                    variant="secondary"
                    className="w-full rounded-xl h-11"
                    onClick={() => updateChurch.mutate()}
                    disabled={updateChurch.isPending}
                    data-testid="button-save-church-info"
                  >
                    {updateChurch.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Church Info"}
                  </Button>
                </>
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Church className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold">{membership.church.name}</p>
                    {membership.church.description && (
                      <p className="text-xs text-muted-foreground">{membership.church.description}</p>
                    )}
                  </div>
                  <Badge variant="secondary" className="ml-auto">Member</Badge>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {isAdmin && pendingMembers && pendingMembers.length > 0 && (
          <Card className="rounded-3xl border-none shadow-sm bg-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="w-5 h-5 text-orange-500" />
                Pending Requests
                <Badge variant="secondary" className="ml-auto">{pendingMembers.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingMembers.map((member) => (
                <div key={member.id} className="flex items-center justify-between gap-2 p-3 rounded-xl bg-muted/30">
                  <span className="text-sm font-medium truncate" data-testid={`text-pending-user-${member.id}`}>
                    {(member as any).userName || `User #${member.userId.slice(0, 8)}`}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="rounded-full text-green-600"
                      onClick={() => approveMember.mutate(member.id)}
                      disabled={approveMember.isPending}
                      data-testid={`button-approve-${member.id}`}
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="rounded-full text-destructive"
                      onClick={() => rejectMember.mutate(member.id)}
                      disabled={rejectMember.isPending}
                      data-testid={`button-reject-${member.id}`}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card className="rounded-3xl border-none shadow-sm bg-card">
          <CardHeader>
            <CardTitle className="text-lg">Service Times</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input 
                type="time" 
                value={newTime} 
                onChange={(e) => setNewTime(e.target.value)}
                className="rounded-xl bg-muted/50 border-none h-11"
                data-testid="input-new-time"
              />
              <Button onClick={addTime} variant="secondary" className="rounded-xl h-11" data-testid="button-add-time">Add</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {serviceTimes.map(time => (
                <Badge key={time} variant="secondary" className="pl-3 pr-1 py-1 gap-1 rounded-full">
                  {time}
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-4 w-4 rounded-full p-0" 
                    onClick={() => removeTime(time)}
                    data-testid={`button-remove-time-${time}`}
                  >
                    ×
                  </Button>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-none shadow-sm bg-card">
          <CardHeader>
            <CardTitle className="text-lg">Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-muted/30">
              <div className="space-y-0.5">
                <Label>Offline Mode</Label>
                <p className="text-xs text-muted-foreground">Export to CSV instead of database</p>
              </div>
              <Switch 
                checked={offlineMode}
                onCheckedChange={setOfflineMode}
                data-testid="switch-offline-mode"
              />
            </div>
          </CardContent>
        </Card>

        <Button 
          onClick={handleSave}
          className="w-full rounded-xl h-11 gap-2 font-bold"
          data-testid="button-save-settings"
        >
          <Save className="w-4 h-4" />
          Save Settings
        </Button>
      </div>
    </div>
  );
}
