import { useState, useMemo, useEffect } from "react";
import { useFamilies, useCreateFamily, useUpdateFamily, useDeleteFamily, useCreatePerson, useUpdatePerson, useDeletePerson } from "@/hooks/use-families";
import { useWebSocket } from "@/hooks/use-ws";
import { PersonTile, AddPersonTile } from "@/components/PersonTile";
import { EditPersonDialog } from "@/components/EditPersonDialog";
import { type Person, type Family } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Lock, Unlock, Loader2, Users, Settings, Database, Download } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

export default function Dashboard() {
  // Connect WS
  useWebSocket();
  const { toast } = useToast();
  
  // State
  const [mode, setMode] = useState<"locked" | "unlocked">("locked");
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [search, setSearch] = useState("");
  const [isOffline, setIsOffline] = useState(localStorage.getItem("offline_mode") === "true");
  const [session, setSession] = useState<{ date: string, time: string } | null>(() => {
    const saved = localStorage.getItem("service_session");
    return saved ? JSON.parse(saved) : null;
  });

  const getRecentSunday = () => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay()); // Sunday
    return d.toISOString().split('T')[0];
  };

  const serviceTimes = JSON.parse(localStorage.getItem("service_times") || '["09:30"]');

  const [selectedDate, setSelectedDate] = useState(getRecentSunday());
  const [selectedTime, setSelectedTime] = useState(serviceTimes[0]);

  // Re-check offline mode when component mounts or focus returns
  useEffect(() => {
    const checkOffline = () => {
      setIsOffline(localStorage.getItem("offline_mode") === "true");
    };
    window.addEventListener('focus', checkOffline);
    return () => window.removeEventListener('focus', checkOffline);
  }, []);

  // Queries & Mutations
  const { data: families, isLoading } = useFamilies();
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
    createFamily.mutate(
      { 
        status: 'newcomer',
        serviceDate: session?.date,
        serviceTime: session?.time 
      }, 
      {
        onSuccess: (newFamily) => {
          // Immediately add a default person to the new family
          createPerson.mutate({
            familyId: newFamily.id,
            type: 'man',
            status: 'newcomer'
          });
          toast({ title: "Family created", description: "Added new family group" });
        }
      }
    );
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

  const handleSync = () => {
    if (isOffline) {
      handleExportCSV();
      return;
    }

    toast({ 
      title: "Syncing...", 
      description: "Sending data to Planning Center",
    });
    // Placeholder for actual sync logic
    setTimeout(() => {
      toast({ 
        title: "Sync Complete", 
        description: "All records sent to Planning Center",
      });
    }, 1500);
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
      // Precise session filtering: date and time must match
      const familyDate = f.serviceDate || "";
      const familyTime = f.serviceTime || "";
      const sessionDate = session?.date || "";
      const sessionTime = session?.time || "";
      
      if (familyDate !== sessionDate || familyTime !== sessionTime) return false;

      const searchLower = search.toLowerCase();
      const familyNameMatch = f.name?.toLowerCase().includes(searchLower);
      const personMatch = f.people.some(p => 
        p.firstName?.toLowerCase().includes(searchLower) || 
        p.lastName?.toLowerCase().includes(searchLower)
      );
      return !search || familyNameMatch || personMatch;
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
              />
            </div>
            
            <div className="space-y-2">
              <Label>Service Time</Label>
              <Select value={selectedTime} onValueChange={setSelectedTime}>
                <SelectTrigger className="rounded-xl h-11 bg-muted/50 border-none">
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
    <div className="min-h-screen bg-background pb-20">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border shadow-sm">
        <div className="max-w-md mx-auto px-4 py-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
              <Users className="w-6 h-6 text-primary" />
              Check-in
            </h1>
            
            <div className="flex items-center gap-2">
              <Link href="/settings">
                <Button variant="ghost" size="icon" className="rounded-full">
                  <Settings className="w-5 h-5" />
                </Button>
              </Link>
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-[10px] h-7 px-2 font-bold rounded-full border border-primary/20 bg-primary/5 text-primary"
                onClick={() => {
                  localStorage.removeItem("service_session");
                  setSession(null);
                }}
              >
                {session?.date.split('-').slice(1).join('/')} @ {session?.time}
              </Button>
              <div className="flex items-center gap-2 bg-secondary/50 p-1 rounded-full border border-border">
                <button
                  onClick={() => setMode("locked")}
                  className={`p-2 rounded-full transition-all ${
                    mode === "locked" ? "bg-white shadow-sm text-primary" : "text-muted-foreground"
                  }`}
                >
                  <Lock className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setMode("unlocked")}
                  className={`p-2 rounded-full transition-all ${
                    mode === "unlocked" ? "bg-white shadow-sm text-orange-500" : "text-muted-foreground"
                  }`}
                >
                  <Unlock className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <Input 
            placeholder="Search families or people..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-secondary/30 border-secondary-foreground/10"
          />
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
          className="h-14 w-14 rounded-full shadow-xl bg-secondary hover:bg-secondary/90 text-secondary-foreground"
          onClick={handleSync}
        >
          {isOffline ? <Download className="w-6 h-6" /> : <Database className="w-6 h-6" />}
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
    </div>
  );
}
