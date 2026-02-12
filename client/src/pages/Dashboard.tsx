import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useFamilies, useCreateFamily, useUpdateFamily, useDeleteFamily, useCreatePerson, useUpdatePerson, useDeletePerson, ServiceSessionContext } from "@/hooks/use-families";
import { useWebSocket, setConflictHandler, suppressConflict } from "@/hooks/use-ws";
import { PersonTile, AddPersonTile } from "@/components/PersonTile";
import { EditPersonDialog } from "@/components/EditPersonDialog";
import { type Person, type Family } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Lock, Unlock, Loader2, Users, Settings, Database, Download, AlertTriangle, Upload } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";

function getRecentSunday() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split('T')[0];
}

export default function Dashboard() {
  const [session, setSession] = useState<{ date: string, time: string } | null>(() => {
    const saved = localStorage.getItem("service_session");
    return saved ? JSON.parse(saved) : null;
  });

  const serviceTimes = JSON.parse(localStorage.getItem("service_times") || '["09:30"]');
  const [selectedDate, setSelectedDate] = useState(getRecentSunday());
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
              <Input 
                type="date" 
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="rounded-xl h-11 bg-muted/50 border-none"
                data-testid="input-sunday-date"
              />
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
                const sessionData = { date: selectedDate, time: selectedTime };
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

function DashboardContent({ session, setSession }: { session: { date: string, time: string }, setSession: (s: { date: string, time: string } | null) => void }) {
  useWebSocket();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [mode, setMode] = useState<"locked" | "unlocked">("locked");
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [search, setSearch] = useState("");
  const [isOffline, setIsOffline] = useState(localStorage.getItem("offline_mode") === "true");
  const [showConflictDialog, setShowConflictDialog] = useState(false);

  useEffect(() => {
    const checkOffline = () => {
      setIsOffline(localStorage.getItem("offline_mode") === "true");
    };
    window.addEventListener('focus', checkOffline);
    return () => window.removeEventListener('focus', checkOffline);
  }, []);

  useEffect(() => {
    setConflictHandler(() => {
      setShowConflictDialog(true);
    });
    return () => setConflictHandler(null);
  }, []);

  const handleModeSwitch = useCallback(async (newMode: "locked" | "unlocked") => {
    const wasUnlocked = mode === "unlocked";
    setMode(newMode);
    
    if (wasUnlocked && newMode === "locked") {
      try {
        suppressConflict(2000);
        await apiRequest("POST", "/api/sync");
        queryClient.invalidateQueries({ queryKey: ["/api/families"] });
      } catch {
        // sync failed silently - data is already saved server-side
      }
    }
  }, [mode, queryClient]);

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

  const handleSync = async () => {
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
    
    let csvContent = "data:text/csv;charset=utf-8,Family,Status,First Name,Last Name,Type,Age Bracket\n";
    
    families.forEach(family => {
      family.people.forEach(person => {
        const row = [
          family.name || "Unknown",
          family.status || "newcomer",
          person.firstName || "",
          person.lastName || "",
          person.type,
          person.ageBracket || ""
        ].join(",");
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
    <div className="min-h-screen bg-background pb-20">
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
                size="sm" 
                className="text-[10px] px-2 font-bold rounded-full border border-primary/20 bg-primary/5 text-primary"
                onClick={() => {
                  localStorage.removeItem("service_session");
                  setSession(null);
                }}
                data-testid="button-session-info"
              >
                {session?.date.split('-').slice(1).join('/')} @ {session?.time}
              </Button>
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
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-md mx-auto px-4 py-6 space-y-6">
        <AnimatePresence>
          {filteredFamilies?.map((family) => (
            <motion.div
              key={family.id}
              layout="position"
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
                          // Automatically update last name for all members
                          family.people.forEach(person => {
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
                  {family.people.sort((a, b) => {
                    // Stable sorting to prevent jumping during ID swap
                    const idA = typeof a.id === 'number' && a.id < 1 ? -1 : 1;
                    const idB = typeof b.id === 'number' && b.id < 1 ? -1 : 1;
                    if (idA !== idB) return idA - idB;
                    
                    const timeA = new Date(a.createdAt || 0).getTime();
                    const timeB = new Date(b.createdAt || 0).getTime();
                    return timeA - timeB || (typeof a.id === 'number' && typeof b.id === 'number' ? a.id - b.id : 0);
                  }).map((person) => (
                    <PersonTile
                      key={person.id}
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
      </main>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-40">
        <Button
          size="icon"
          className="h-14 w-14 rounded-full shadow-xl bg-secondary text-secondary-foreground"
          onClick={handleSync}
          disabled={isPushing}
          data-testid="button-sync-pco"
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

      {/* Conflict Warning Dialog */}
      <Dialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Editing Clash Detected
            </DialogTitle>
            <DialogDescription>
              Another team member has just synced their changes. The most recent edits have been retained. Your view will now refresh with the latest data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              onClick={() => setShowConflictDialog(false)}
              data-testid="button-dismiss-conflict"
            >
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
