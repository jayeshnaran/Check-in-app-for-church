import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save, Check, X, Loader2, Users, Church, LogOut, User, Link2, Unlink, CheckCircle2, AlertCircle, UserMinus, HelpCircle } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";
import type { ChurchMember, Church as ChurchType } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
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

  const { data: approvedMembers } = useQuery<(ChurchMember & { userName: string; userEmail: string | null })[]>({
    queryKey: ["/api/membership/approved"],
    queryFn: async () => {
      const res = await fetch("/api/membership/approved", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAdmin,
  });

  const revokeMember = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/membership/${id}/revoke`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/membership/approved"] });
      toast({ title: "Revoked", description: "Member access has been removed." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to revoke access.", variant: "destructive" });
    },
  });

  const { data: pcoStatus, isLoading: pcoLoading } = useQuery<{
    configured: boolean;
    connected: boolean;
    organizationId: string | null;
    connectedAt: string | null;
  }>({
    queryKey: ["/api/pco/status"],
    queryFn: async () => {
      const res = await fetch("/api/pco/status", { credentials: "include" });
      if (!res.ok) return { configured: false, connected: false, organizationId: null, connectedAt: null };
      return res.json();
    },
    enabled: isAdmin,
  });

  const disconnectPco = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/pco/disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pco/status"] });
      toast({ title: "Disconnected", description: "Planning Center has been disconnected." });
    },
  });

  const testPco = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/pco/test");
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.connected) {
        toast({ title: "Connection OK", description: "Planning Center is working correctly." });
      } else {
        toast({ title: "Connection Failed", description: "Could not reach Planning Center. Try reconnecting.", variant: "destructive" });
      }
    },
  });

  const [churchName, setChurchName] = useState(membership?.church?.name || "");
  const [churchDesc, setChurchDesc] = useState(membership?.church?.description || "");
  const [pcoFieldStatus, setPcoFieldStatus] = useState(membership?.church?.pcoFieldMembershipStatus || "");
  const [pcoFieldAge, setPcoFieldAge] = useState(membership?.church?.pcoFieldAgeBracket || "");
  const [pcoEventId, setPcoEventId] = useState(membership?.church?.pcoEventId || "");

  useEffect(() => {
    if (membership?.church) {
      setChurchName(membership.church.name || "");
      setChurchDesc(membership.church.description || "");
      setPcoFieldStatus(membership.church.pcoFieldMembershipStatus || "");
      setPcoFieldAge(membership.church.pcoFieldAgeBracket || "");
      setPcoEventId(membership.church.pcoEventId || "");
    }
  }, [membership?.church]);

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

  const savePcoFields = useMutation({
    mutationFn: async () => {
      if (!membership) return;
      const res = await apiRequest("PUT", `/api/churches/${membership.churchId}`, {
        pcoFieldMembershipStatus: pcoFieldStatus || null,
        pcoFieldAgeBracket: pcoFieldAge || null,
        pcoEventId: pcoEventId || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/membership"] });
      toast({ title: "Saved", description: "PCO settings have been updated." });
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

        <Card className="rounded-3xl border-none shadow-sm bg-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold truncate" data-testid="text-user-name">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-muted-foreground truncate" data-testid="text-user-email">
                  {user?.email}
                </p>
              </div>
              <Badge variant="secondary" className="shrink-0" data-testid="badge-user-role">
                {membership?.role === "admin" ? "Admin" : "Member"}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full shrink-0"
                data-testid="button-logout"
                onClick={() => { window.location.href = "/api/logout"; }}
              >
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </CardContent>
        </Card>

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

        {isAdmin && approvedMembers && approvedMembers.length > 0 && (
          <Card className="rounded-3xl border-none shadow-sm bg-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Approved Members
                <Badge variant="secondary" className="ml-auto">{approvedMembers.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {approvedMembers.map((member) => (
                <div key={member.id} className="flex items-center justify-between gap-2 p-3 rounded-xl bg-muted/30">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium truncate block" data-testid={`text-approved-user-${member.id}`}>
                      {member.userName}
                    </span>
                    {member.userEmail && (
                      <span className="text-xs text-muted-foreground truncate block">{member.userEmail}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary">{member.role}</Badge>
                    {member.role !== "admin" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="rounded-full text-destructive"
                        onClick={() => revokeMember.mutate(member.id)}
                        disabled={revokeMember.isPending}
                        data-testid={`button-revoke-${member.id}`}
                      >
                        <UserMinus className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {isAdmin && (
          <Card className="rounded-3xl border-none shadow-sm bg-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Link2 className="w-5 h-5 text-primary" />
                Planning Center
                {pcoStatus?.connected && (
                  <Badge variant="secondary" className="ml-auto" data-testid="badge-pco-connected">
                    Connected
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {pcoLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : !pcoStatus?.configured ? (
                <div className="p-3 rounded-xl bg-muted/30 space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0" />
                    <p className="text-sm text-muted-foreground">
                      Planning Center integration requires setup. Contact your app administrator to configure the PCO credentials.
                    </p>
                  </div>
                </div>
              ) : pcoStatus?.connected ? (
                <>
                  <div className="p-3 rounded-xl bg-muted/30 space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                      <p className="text-sm">Connected to Planning Center</p>
                    </div>
                    {pcoStatus.organizationId && (
                      <p className="text-xs text-muted-foreground ml-6">
                        Org ID: {pcoStatus.organizationId}
                      </p>
                    )}
                    {pcoStatus.connectedAt && (
                      <p className="text-xs text-muted-foreground ml-6">
                        Connected: {new Date(pcoStatus.connectedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => testPco.mutate()}
                      disabled={testPco.isPending}
                      data-testid="button-test-pco"
                    >
                      {testPco.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Test Connection"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => disconnectPco.mutate()}
                      disabled={disconnectPco.isPending}
                      data-testid="button-disconnect-pco"
                    >
                      {disconnectPco.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                        <>
                          <Unlink className="w-4 h-4 mr-1" />
                          Disconnect
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="border-t pt-4 space-y-3">
                    <p className="text-sm font-medium">Check-Ins Event</p>
                    <p className="text-xs text-muted-foreground">
                      Enter the PCO Event ID for the weekly service you want to sync check-ins from. Find it in your PCO Check-Ins event URL.
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="pco-event-id" className="text-xs">Event ID</Label>
                      <Input
                        id="pco-event-id"
                        placeholder="e.g. 381296"
                        value={pcoEventId}
                        onChange={(e) => setPcoEventId(e.target.value)}
                        data-testid="input-pco-event-id"
                      />
                    </div>
                  </div>
                  <div className="border-t pt-4 space-y-3">
                    <p className="text-sm font-medium">Custom Field IDs</p>
                    <p className="text-xs text-muted-foreground">
                      Enter the PCO field definition IDs for the custom fields you want to populate when pushing people. You can find these in your PCO People custom fields settings.
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="pco-field-status" className="text-xs">Membership Status Field ID</Label>
                      <Input
                        id="pco-field-status"
                        placeholder="e.g. 781090"
                        value={pcoFieldStatus}
                        onChange={(e) => setPcoFieldStatus(e.target.value)}
                        data-testid="input-pco-field-status"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pco-field-age" className="text-xs">Age Bracket Field ID</Label>
                      <Input
                        id="pco-field-age"
                        placeholder="e.g. 826722"
                        value={pcoFieldAge}
                        onChange={(e) => setPcoFieldAge(e.target.value)}
                        data-testid="input-pco-field-age"
                      />
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => savePcoFields.mutate()}
                      disabled={savePcoFields.isPending}
                      data-testid="button-save-pco-fields"
                    >
                      {savePcoFields.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                        <>
                          <Save className="w-4 h-4 mr-1" />
                          Save PCO Settings
                        </>
                      )}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Connect your church's Planning Center account to automatically push newcomer and visitor data to PCO People.
                  </p>
                  <Button
                    className="w-full rounded-xl"
                    onClick={() => { window.location.href = "/auth/pco"; }}
                    data-testid="button-connect-pco"
                  >
                    <Link2 className="w-4 h-4 mr-2" />
                    Connect to Planning Center
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="rounded-3xl border-none shadow-sm bg-card">
          <CardHeader>
            <CardTitle className="text-lg">Service Times</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isAdmin && (
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
            )}
            <div className="flex flex-wrap gap-2">
              {serviceTimes.map(time => (
                <Badge key={time} variant="secondary" className="pl-3 pr-1 py-1 gap-1 rounded-full">
                  {time}
                  {isAdmin && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-4 w-4 rounded-full p-0" 
                      onClick={() => removeTime(time)}
                      data-testid={`button-remove-time-${time}`}
                    >
                      ×
                    </Button>
                  )}
                </Badge>
              ))}
            </div>
            {!isAdmin && (
              <p className="text-xs text-muted-foreground">Only admins can add or remove service times.</p>
            )}
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

        <Card className="rounded-3xl border-none shadow-sm bg-card">
          <CardHeader>
            <CardTitle className="text-lg">Help</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full rounded-xl h-11 gap-2"
              onClick={() => setLocation("/?tour=1")}
              data-testid="button-take-tour"
            >
              <HelpCircle className="w-4 h-4" />
              Take a Tour
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Walk through the app with an interactive guide that shows you each feature.
            </p>
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
