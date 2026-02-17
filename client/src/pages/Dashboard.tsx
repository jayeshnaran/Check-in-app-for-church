import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useFamilies, useCreateFamily, useUpdateFamily, useDeleteFamily, useCreatePerson, useUpdatePerson, useDeletePerson, ServiceSessionContext } from "@/hooks/use-families";
import { PersonTile, AddPersonTile } from "@/components/PersonTile";
import { EditPersonDialog } from "@/components/EditPersonDialog";
import { CheckinEditDialog } from "@/components/CheckinEditDialog";
import { GuidedTour, dashboardTourSteps } from "@/components/GuidedTour";
import { type Person, type Family, type PcoCheckin } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Lock, Unlock, Loader2, Users, Settings, Database, Download, AlertTriangle, Upload, RefreshCw, CalendarIcon, User, ChevronLeft, ChevronRight, ClipboardCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";

function getRecentSunday(): Date {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSunday(date: Date): boolean {
  return date.getDay() === 0;
}

function formatDateStr(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function formatSessionDate(dateStr: string): string {
  if (!dateStr || dateStr.length < 10) return dateStr;
  const [, mm, dd] = dateStr.split('-');
  const dateFormat = localStorage.getItem("date_format") || "MM/DD";
  return dateFormat === "DD/MM" ? `${dd}/${mm}` : `${mm}/${dd}`;
}

function getPrevSunday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - 7);
  return formatDateStr(d);
}

function getNextSunday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 7);
  return formatDateStr(d);
}

function isNextSundayInFuture(dateStr: string): boolean {
  const next = new Date(dateStr + "T00:00:00");
  next.setDate(next.getDate() + 7);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return next > today;
}

export default function Dashboard() {
  const [session, setSession] = useState<{ date: string, time: string } | null>(() => {
    const saved = localStorage.getItem("service_session");
    return saved ? JSON.parse(saved) : null;
  });

  const serviceTimes = JSON.parse(localStorage.getItem("service_times") || '["09:30"]');
  const [selectedDate, setSelectedDate] = useState<Date>(getRecentSunday());
  const [selectedTime, setSelectedTime] = useState(serviceTimes[0]);

  if (!session) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <Card className="w-full max-w-sm rounded-3xl border-none shadow-xl bg-card p-6 space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-black">Welcome</h2>
            <p className="text-muted-foreground text-sm">Select service session to begin</p>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Sunday Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-left font-normal rounded-xl h-11 bg-muted/50 border-none"
                    data-testid="input-sunday-date"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(selectedDate, localStorage.getItem("date_format") === "DD/MM" ? "EEEE, d MMM yyyy" : "EEEE, MMM d, yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    disabled={(date) => !isSunday(date) || date > new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            <div className="space-y-2">
              <Label>Service Time</Label>
              <Select value={selectedTime} onValueChange={setSelectedTime}>
                <SelectTrigger className="rounded-xl h-11 bg-muted/50 border-none" data-testid="select-service-time">
                  <SelectValue placeholder="Select time" />
                </SelectTrigger>
                <SelectContent>
                  {serviceTimes.map((t: string) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button 
              className="w-full h-12 rounded-xl font-bold text-lg"
              data-testid="button-start-checkin"
              onClick={() => {
                const sessionData = { date: formatDateStr(selectedDate), time: selectedTime };
                localStorage.setItem("service_session", JSON.stringify(sessionData));
                setSession(sessionData);
              }}
            >
              Start Check-in
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <ServiceSessionContext.Provider value={session}>
      <DashboardContent session={session} setSession={setSession} />
    </ServiceSessionContext.Provider>
  );
}

interface ClashInfo {
  familyId: number;
  familyName: string;
  updatedBy: string | null;
}

function DashboardContent({ session, setSession }: { session: { date: string, time: string }, setSession: (s: { date: string, time: string } | null) => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [mode, setMode] = useState<"locked" | "unlocked">("locked");
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isOffline, setIsOffline] = useState(localStorage.getItem("offline_mode") === "true");
  const [isSyncing, setIsSyncing] = useState(false);
  const [showClashDialog, setShowClashDialog] = useState(false);
  const [clashes, setClashes] = useState<ClashInfo[]>([]);
  const [showTour, setShowTour] = useState(false);
  const lastSyncTimestamps = useRef<Record<number, string>>({});

  const [activeTab, setActiveTab] = useState<"new-people" | "checkins">("new-people");
  const [editingCheckin, setEditingCheckin] = useState<PcoCheckin | null>(null);
  const [isSyncingCheckins, setIsSyncingCheckins] = useState(false);

  useEffect(() => {
    const checkOffline = () => {
      setIsOffline(localStorage.getItem("offline_mode") === "true");
    };
    window.addEventListener('focus', checkOffline);
    return () => window.removeEventListener('focus', checkOffline);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tour") === "1") {
      setShowTour(true);
      setMode("unlocked");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: globalSearchResults } = useQuery<(Person & { familyName: string | null; familyStatus: string | null; serviceDate: string | null })[]>({
    queryKey: ["/api/people/search", debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch) return [];
      const res = await fetch(`/api/people/search?q=${encodeURIComponent(debouncedSearch)}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: debouncedSearch.length > 0,
  });

  const isSearching = debouncedSearch.length > 0;

  const { data: families, isLoading } = useFamilies(session.date, session.time);
  const createFamily = useCreateFamily();
  const updateFamily = useUpdateFamily();
  const deleteFamily = useDeleteFamily();
  const createPerson = useCreatePerson();
  const updatePerson = useUpdatePerson();
  const deletePerson = useDeletePerson();

  // Handlers
  const handleTogglePersonType = (person: Person) => {
    const childBrackets = ["0-3", "4-7", "8-11", "12-17"];
    const isChild = childBrackets.includes(person.ageBracket || "");
    
    let types: string[];
    if (person.ageBracket && isChild) {
      types = ['boy', 'girl'];
    } else if (person.ageBracket && !isChild) {
      types = ['man', 'woman'];
    } else {
      types = ['man', 'woman', 'boy', 'girl'];
    }

    const currentIndex = types.indexOf(person.type);
    const nextType = types[(currentIndex + 1) % types.length] as any;
    
    updatePerson.mutate({ id: person.id, type: nextType });
  };

  const handleAddFamily = () => {
    createFamily.mutate({ 
      status: 'newcomer',
      serviceDate: session?.date,
      serviceTime: session?.time 
    });
  };

  const handleAddPerson = (e: React.MouseEvent, familyId: number) => {
    e.preventDefault();
    e.stopPropagation();
    createPerson.mutate({
      familyId,
      type: 'man',
      status: 'newcomer'
    });
  };

  const [isPushing, setIsPushing] = useState(false);

  const { data: pcoStatus } = useQuery<{ configured: boolean; connected: boolean }>({
    queryKey: ["/api/pco/status"],
    queryFn: async () => {
      const res = await fetch("/api/pco/status", { credentials: "include" });
      if (!res.ok) return { configured: false, connected: false };
      return res.json();
    },
  });

  const { data: pcoCheckins, isLoading: isLoadingCheckins } = useQuery<PcoCheckin[]>({
    queryKey: ["/api/pco/checkins", session.date],
    queryFn: async () => {
      const res = await fetch(`/api/pco/checkins?date=${encodeURIComponent(session.date)}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: activeTab === "checkins" && !!pcoStatus?.connected,
  });

  const updateCheckinMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/pco/checkins/${id}`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pco/checkins", session.date] });
      setEditingCheckin(null);
      toast({ title: "Saved", description: "Person updated in PCO" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update person", variant: "destructive" });
    },
  });

  const handleSyncCheckins = async () => {
    setIsSyncingCheckins(true);
    try {
      const res = await apiRequest("POST", "/api/pco/sync-checkins", { date: session.date });
      const result = await res.json();
      toast({ title: "Synced", description: `${result.synced} check-ins synced from PCO` });
      queryClient.invalidateQueries({ queryKey: ["/api/pco/checkins", session.date] });
    } catch (err: any) {
      let msg = "Could not sync check-ins from PCO";
      try {
        const errMsg = err?.message || "";
        const jsonMatch = errMsg.match(/\d+:\s*(.*)/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[1]);
          if (parsed?.message) msg = parsed.message;
        }
      } catch {}
      toast({ title: "Sync Failed", description: msg, variant: "destructive" });
    } finally {
      setIsSyncingCheckins(false);
    }
  };

  const syncInitialized = useRef(false);

  useEffect(() => {
    if (families && !syncInitialized.current) {
      const timestamps: Record<number, string> = {};
      families.forEach(f => {
        timestamps[f.id] = (f as any).updatedAt || (f as any).createdAt || "";
      });
      lastSyncTimestamps.current = timestamps;
      syncInitialized.current = true;
    }
  }, [families]);

  const updateSyncTimestamps = (serverFamilies: any[]) => {
    const timestamps: Record<number, string> = {};
    serverFamilies.forEach((f: any) => {
      timestamps[f.id] = f.updatedAt || f.createdAt || "";
    });
    lastSyncTimestamps.current = timestamps;
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const params = `?serviceDate=${encodeURIComponent(session.date)}&serviceTime=${encodeURIComponent(session.time)}`;
      const res = await fetch(`/api/families${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      const serverFamilies: any[] = await res.json();

      const currentUserId = user?.id;
      const detectedClashes: ClashInfo[] = [];

      for (const sf of serverFamilies) {
        const lastKnown = lastSyncTimestamps.current[sf.id];
        const serverUpdated = sf.updatedAt || sf.createdAt || "";
        if (lastKnown && serverUpdated && serverUpdated !== lastKnown && sf.updatedBy !== currentUserId) {
          detectedClashes.push({
            familyId: sf.id,
            familyName: sf.name || "Unknown Family",
            updatedBy: sf.updatedBy,
          });
        }
      }

      if (detectedClashes.length > 0) {
        setClashes(detectedClashes);
        setShowClashDialog(true);
        pendingSyncFamilies.current = serverFamilies;
      } else {
        updateSyncTimestamps(serverFamilies);
        queryClient.invalidateQueries({ queryKey: ["/api/families"] });
        toast({ title: "Synced", description: "Data is up to date" });
      }
    } catch {
      toast({ title: "Sync Failed", description: "Could not refresh data from the server.", variant: "destructive" });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleModeSwitch = (newMode: "locked" | "unlocked") => {
    setMode(newMode);
    handleManualSync();
  };

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (mode !== "locked") return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (mode !== "locked" || touchStartX.current === null || touchStartY.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (Math.abs(deltaX) < 60 || Math.abs(deltaY) > Math.abs(deltaX)) return;
    if (deltaX > 0) {
      navigateSunday("prev");
    } else {
      navigateSunday("next");
    }
  };

  const canGoNext = !isNextSundayInFuture(session.date);

  const navigateSunday = (direction: "prev" | "next") => {
    if (direction === "next" && !canGoNext) return;
    const newDate = direction === "prev" ? getPrevSunday(session.date) : getNextSunday(session.date);
    const newSession = { date: newDate, time: session.time };
    localStorage.setItem("service_session", JSON.stringify(newSession));
    setSession(newSession);
  };

  const pendingSyncFamilies = useRef<any[]>([]);

  const handleAcceptServerChanges = () => {
    updateSyncTimestamps(pendingSyncFamilies.current);
    queryClient.invalidateQueries({ queryKey: ["/api/families"] });
    pendingSyncFamilies.current = [];
    setShowClashDialog(false);
    setClashes([]);
    toast({ title: "Synced", description: "Accepted the latest changes from other team members." });
  };

  const handleOverwriteWithMine = () => {
    updateSyncTimestamps(pendingSyncFamilies.current);
    pendingSyncFamilies.current = [];
    setShowClashDialog(false);
    setClashes([]);
    toast({ title: "Kept Your Changes", description: "Your local edits have been preserved. They were already saved to the server." });
  };

  const handlePushToPco = async () => {
    if (isOffline) {
      handleExportCSV();
      return;
    }

    if (!pcoStatus?.connected) {
      toast({
        title: "Not Connected",
        description: "Connect Planning Center in Settings to push data.",
        variant: "destructive",
      });
      return;
    }

    setIsPushing(true);
    toast({ title: "Pushing to PCO...", description: "Sending people to Planning Center" });

    try {
      const res = await apiRequest("POST", "/api/pco/push-all", {
        serviceDate: session.date,
        serviceTime: session.time,
      });
      const result = await res.json();
      toast({
        title: "Push Complete",
        description: `${result.pushed} people sent to PCO${result.failed > 0 ? `, ${result.failed} failed` : ""}`,
      });
    } catch {
      toast({
        title: "Push Failed",
        description: "Could not send data to Planning Center. Check your connection in Settings.",
        variant: "destructive",
      });
    } finally {
      setIsPushing(false);
    }
  };

  const handleExportCSV = () => {
    if (!families) return;
    
    let csvContent = "Family,Status,First Name,Last Name,Type,Age Bracket\n";
    
    families.forEach(family => {
      family.people.forEach(person => {
        const row = [
          family.name || "Unknown",
          family.status || "newcomer",
          person.firstName || "",
          person.lastName || "",
          person.type,
          person.ageBracket || ""
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
        csvContent += row + "\n";
      });
    });

    const encodedUri = "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `church_checkins_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({ 
      title: "Exported", 
      description: "CSV file has been downloaded",
    });
  };

  const filteredFamilies = useMemo(() => {
    return families?.filter(f => {
      if (!search) return true;
      const searchLower = search.toLowerCase();
      const familyNameMatch = f.name?.toLowerCase().includes(searchLower);
      const personMatch = f.people.some(p => 
        p.firstName?.toLowerCase().includes(searchLower) || 
        p.lastName?.toLowerCase().includes(searchLower)
      );
      return familyNameMatch || personMatch;
    });
  }, [families, search]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground font-medium">Loading families...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border shadow-sm">
        <div className="max-w-md mx-auto px-4 py-3 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-xl font-black tracking-tight text-foreground flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Check-in
            </h1>
            
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleManualSync}
                disabled={isSyncing}
                className="rounded-full"
                data-testid="button-sync"
              >
                {isSyncing ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <RefreshCw className="w-5 h-5" />
                )}
              </Button>
              <div className="flex items-center gap-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigateSunday("prev")}
                  className="rounded-full h-7 w-7"
                  data-testid="button-prev-sunday"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-[10px] px-2 font-bold rounded-full border border-primary/20 bg-primary/5 text-primary"
                  onClick={() => {
                    localStorage.removeItem("service_session");
                    setSession(null);
                  }}
                  data-testid="button-session-info"
                >
                  {formatSessionDate(session?.date || '')} @ {session?.time}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigateSunday("next")}
                  disabled={!canGoNext}
                  className={cn("rounded-full h-7 w-7", !canGoNext && "opacity-30 cursor-not-allowed")}
                  data-testid="button-next-sunday"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              <Link href="/settings">
                <Button variant="ghost" size="icon" className="rounded-full" data-testid="button-settings">
                  <Settings className="w-5 h-5" />
                </Button>
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Input 
              placeholder="Search families or people..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-0 bg-secondary/30 border-secondary-foreground/10"
              data-testid="input-search"
            />
            <div className="flex items-center bg-secondary/50 p-1 rounded-full border border-border shrink-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleModeSwitch("locked")}
                data-testid="button-mode-locked"
                className={`rounded-full toggle-elevate ${
                  mode === "locked" ? "toggle-elevated text-primary" : "text-muted-foreground"
                }`}
              >
                <Lock className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleModeSwitch("unlocked")}
                data-testid="button-mode-unlocked"
                className={`rounded-full toggle-elevate ${
                  mode === "unlocked" ? "toggle-elevated text-orange-500" : "text-muted-foreground"
                }`}
              >
                <Unlock className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {pcoStatus?.connected && (
            <div className="flex items-center gap-1 bg-secondary/30 rounded-full p-0.5" data-testid="tab-bar">
              <button
                className={cn(
                  "flex-1 text-xs font-semibold py-1.5 px-3 rounded-full transition-colors",
                  activeTab === "new-people"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground"
                )}
                onClick={() => setActiveTab("new-people")}
                data-testid="tab-new-people"
              >
                <Users className="w-3.5 h-3.5 inline mr-1" />
                New People
              </button>
              <button
                className={cn(
                  "flex-1 text-xs font-semibold py-1.5 px-3 rounded-full transition-colors",
                  activeTab === "checkins"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground"
                )}
                onClick={() => setActiveTab("checkins")}
                data-testid="tab-checkins"
              >
                <ClipboardCheck className="w-3.5 h-3.5 inline mr-1" />
                Check-ins
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-md mx-auto px-4 py-6 space-y-6">
        {activeTab === "checkins" && pcoStatus?.connected ? (
          <CheckinsView
            checkins={pcoCheckins || []}
            isLoading={isLoadingCheckins}
            isSyncing={isSyncingCheckins}
            onSync={handleSyncCheckins}
            onEdit={setEditingCheckin}
            sessionDate={session.date}
          />
        ) : isSearching ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium px-1">
              {globalSearchResults?.length || 0} {globalSearchResults?.length === 1 ? "person" : "people"} found across all dates
            </p>
            {globalSearchResults && globalSearchResults.length > 0 ? (
              <Card className="border-border shadow-sm overflow-hidden">
                {globalSearchResults.map((person, idx) => (
                  <button
                    key={person.id}
                    className={cn(
                      "w-full text-left px-4 py-3 flex items-center gap-3 hover-elevate focus:outline-none",
                      idx > 0 && "border-t border-border/50"
                    )}
                    onClick={() => setEditingPerson(person)}
                    data-testid={`search-result-${person.id}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      {person.type === "man" || person.type === "woman" ? (
                        <User className="w-4 h-4 text-primary" />
                      ) : (
                        <Users className="w-4 h-4 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate" data-testid={`search-result-name-${person.id}`}>
                        {[person.firstName, person.lastName].filter(Boolean).join(" ") || "Unnamed"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {person.familyName || "Unknown"} family
                        {person.serviceDate && ` \u00B7 First seen ${person.serviceDate}`}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "shrink-0",
                        (person as any).familyStatus === 'newcomer' ? "bg-green-100 text-green-700 border-green-200" : "bg-orange-100 text-orange-700 border-orange-200"
                      )}
                    >
                      {(person as any).familyStatus === 'newcomer' ? 'Newcomer' : 'Visitor'}
                    </Badge>
                  </button>
                ))}
              </Card>
            ) : (
              <div className="text-center py-12 opacity-50">
                <p>No people found matching "{debouncedSearch}"</p>
              </div>
            )}
          </div>
        ) : (
          <>
            <AnimatePresence>
              {filteredFamilies?.map((family: any) => (
                <motion.div
                  key={family._clientKey || family.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className={`relative overflow-hidden border-2 transition-all ${
                    mode === 'unlocked' ? 'border-dashed border-primary/20 bg-primary/5' : 'border-border shadow-sm hover:shadow-md'
                  }`}>
                    {/* Family Header */}
                    <div className="p-4 border-b border-border/50 flex items-center justify-between bg-card/50">
                      <div className="flex items-center gap-2">
                        {mode === "locked" ? (
                          <h3 className="font-bold text-lg text-foreground">
                            {family.name || "Unknown Family"}
                          </h3>
                        ) : (
                          <Input
                            value={family.name || ""}
                            onChange={(e) => {
                              const newName = e.target.value;
                              updateFamily.mutate({ id: family.id, name: newName });
                              family.people.forEach((person: any) => {
                                if (!person.lastName || person.lastName === family.name) {
                                  updatePerson.mutate({ id: person.id, lastName: newName });
                                }
                              });
                            }}
                            placeholder="Family Name"
                            className="h-8 text-sm font-bold w-40 bg-white"
                          />
                        )}
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "cursor-pointer transition-colors",
                            family.status === 'newcomer' ? "bg-green-100 text-green-700 border-green-200" : "bg-orange-100 text-orange-700 border-orange-200"
                          )}
                          onClick={() => {
                            if (mode === 'unlocked') {
                              const newStatus = family.status === 'newcomer' ? 'visitor' : 'newcomer';
                              updateFamily.mutate({ id: family.id, status: newStatus });
                            }
                          }}
                        >
                          {family.status === 'newcomer' ? 'Newcomer' : 'Visitor'}
                        </Badge>
                      </div>
                      
                      {mode === "unlocked" && (
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={family.status === 'visitor'}
                            onCheckedChange={(checked) => {
                              const newStatus = checked ? 'visitor' : 'newcomer';
                              updateFamily.mutate({ id: family.id, status: newStatus });
                            }}
                            className="scale-75"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm("Delete this family and all members?")) {
                                deleteFamily.mutate(family.id);
                              }
                            }}
                            className="text-muted-foreground hover:text-destructive h-8 w-8"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* People Grid */}
                    <div className="p-4 grid grid-cols-3 gap-3 items-start content-start min-h-[100px]">
                      {[...family.people].sort((a: any, b: any) => {
                        const keyA = a._clientKey || '';
                        const keyB = b._clientKey || '';
                        if (keyA && keyB) return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
                        const timeA = new Date(a.createdAt || 0).getTime();
                        const timeB = new Date(b.createdAt || 0).getTime();
                        return timeA - timeB || a.id - b.id;
                      }).map((person: any) => (
                        <PersonTile
                          key={person._clientKey || person.id}
                          person={person}
                          mode={mode}
                          onToggleType={() => handleTogglePersonType(person)}
                          onEdit={() => setEditingPerson(person)}
                          onDelete={() => deletePerson.mutate(person.id)}
                        />
                      ))}
                      {mode === "unlocked" && (
                        <AddPersonTile key="add-button" onClick={(e) => handleAddPerson(e, family.id)} />
                      )}
                    </div>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>

            {filteredFamilies?.length === 0 && (
              <div className="text-center py-12 opacity-50">
                <p>No families found.</p>
              </div>
            )}
          </>
        )}
      </main>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-40">
        <Button
          size="icon"
          className="h-14 w-14 rounded-full shadow-xl bg-secondary text-secondary-foreground"
          onClick={handlePushToPco}
          disabled={isPushing}
          data-testid="button-push-pco"
        >
          {isPushing ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : isOffline ? (
            <Download className="w-6 h-6" />
          ) : pcoStatus?.connected ? (
            <Upload className="w-6 h-6" />
          ) : (
            <Database className="w-6 h-6" />
          )}
        </Button>
        {mode === "unlocked" && (
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
          >
            <Button
              size="lg"
              className="h-14 w-14 rounded-full shadow-xl bg-primary hover:bg-primary/90"
              onClick={handleAddFamily}
              data-testid="button-add-family"
            >
              <Plus className="w-6 h-6" />
            </Button>
          </motion.div>
        )}
      </div>

      {/* Edit Dialog */}
      <EditPersonDialog
        person={editingPerson}
        isOpen={!!editingPerson}
        onClose={() => setEditingPerson(null)}
        onSave={(id, updates) => {
          updatePerson.mutate({ id, ...updates }, {
            onSuccess: () => {
              setEditingPerson(null);
              toast({ title: "Saved", description: "Person details updated" });
            }
          });
        }}
        isSaving={updatePerson.isPending}
      />

      {/* Checkin Edit Dialog */}
      <CheckinEditDialog
        checkin={editingCheckin}
        isOpen={!!editingCheckin}
        onClose={() => setEditingCheckin(null)}
        onSave={(id, updates) => updateCheckinMutation.mutate({ id, updates })}
        isSaving={updateCheckinMutation.isPending}
      />

      {/* Clash Detection Dialog */}
      <Dialog open={showClashDialog} onOpenChange={setShowClashDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Editing Clash Detected
            </DialogTitle>
            <DialogDescription>
              Another team member has edited {clashes.length === 1 
                ? `the "${clashes[0]?.familyName}" family` 
                : `${clashes.length} families`
              } since you last synced. What would you like to do?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col gap-2 sm:flex-col">
            <Button 
              onClick={handleAcceptServerChanges}
              data-testid="button-accept-changes"
            >
              Accept Their Changes
            </Button>
            <Button 
              variant="outline"
              onClick={handleOverwriteWithMine}
              data-testid="button-keep-mine"
            >
              Keep My Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GuidedTour
        steps={dashboardTourSteps}
        isOpen={showTour}
        onClose={() => setShowTour(false)}
      />
    </div>
  );
}

function CheckinsView({
  checkins,
  isLoading,
  isSyncing,
  onSync,
  onEdit,
  sessionDate,
}: {
  checkins: PcoCheckin[];
  isLoading: boolean;
  isSyncing: boolean;
  onSync: () => void;
  onEdit: (c: PcoCheckin) => void;
  sessionDate: string;
}) {
  const [searchFilter, setSearchFilter] = useState("");

  const filtered = useMemo(() => {
    if (!searchFilter) return checkins;
    const q = searchFilter.toLowerCase();
    return checkins.filter(
      (c) =>
        c.firstName?.toLowerCase().includes(q) ||
        c.lastName?.toLowerCase().includes(q)
    );
  }, [checkins, searchFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground font-medium">
          {filtered.length} {filtered.length === 1 ? "person" : "people"} checked in
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={onSync}
          disabled={isSyncing}
          data-testid="button-sync-checkins"
        >
          {isSyncing ? (
            <Loader2 className="w-4 h-4 animate-spin mr-1" />
          ) : (
            <Download className="w-4 h-4 mr-1" />
          )}
          {isSyncing ? "Syncing..." : "Sync from PCO"}
        </Button>
      </div>

      {checkins.length > 5 && (
        <Input
          placeholder="Filter checked-in people..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          className="bg-secondary/30 border-secondary-foreground/10"
          data-testid="input-checkin-filter"
        />
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <ClipboardCheck className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">
            {checkins.length === 0
              ? "No check-in data for this date. Tap 'Sync from PCO' to pull check-ins."
              : "No matches found."}
          </p>
        </div>
      ) : (
        <Card className="border-border shadow-sm overflow-hidden">
          {filtered.map((checkin, idx) => (
            <button
              key={checkin.id}
              className={cn(
                "w-full text-left px-4 py-3 flex items-center gap-3 hover-elevate focus:outline-none",
                idx > 0 && "border-t border-border/50"
              )}
              onClick={() => onEdit(checkin)}
              data-testid={`checkin-row-${checkin.id}`}
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-primary/10">
                <User className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate" data-testid={`checkin-name-${checkin.id}`}>
                  {[checkin.firstName, checkin.lastName].filter(Boolean).join(" ") || "Unnamed"}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {[
                    checkin.gender === "F" ? "Female" : checkin.gender === "M" ? "Male" : null,
                    checkin.child ? "Child" : null,
                    checkin.ageBracket,
                    checkin.eventName,
                  ].filter(Boolean).join(" \u00B7 ") || "Tap to view details"}
                </p>
              </div>
              {checkin.membershipStatus && (
                <Badge variant="outline" className="shrink-0 text-xs">
                  {checkin.membershipStatus}
                </Badge>
              )}
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}
