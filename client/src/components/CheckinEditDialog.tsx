import { useState, useEffect } from "react";
import { type PcoCheckin } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CheckinEditDialogProps {
  checkin: PcoCheckin | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: number, updates: Record<string, any>) => void;
  isSaving: boolean;
}

const AGE_BRACKETS = [
  "0-3", "4-7", "8-11", "12-17", "18-24", "25-29",
  "30-39", "40-49", "50-59", "60-69", "70-79", "80-89", "90-99",
];

const currentYear = new Date().getFullYear();

const MEMBERSHIP_CLEAR = "__clear__";

const MEMBERSHIP_OPTIONS = [
  { value: MEMBERSHIP_CLEAR, label: "Not set" },
  { value: `${currentYear} Newcomer`, label: `${currentYear} Newcomer` },
  { value: `${currentYear} Visitor`, label: `${currentYear} Visitor` },
  { value: `${currentYear} New Regular`, label: `${currentYear} New Regular` },
  { value: `${currentYear - 1} Newcomer`, label: `${currentYear - 1} Newcomer` },
  { value: `${currentYear - 1} Visitor`, label: `${currentYear - 1} Visitor` },
  { value: `${currentYear - 1} New Regular`, label: `${currentYear - 1} New Regular` },
];

export function CheckinEditDialog({ checkin, isOpen, onClose, onSave, isSaving }: CheckinEditDialogProps) {
  const { toast } = useToast();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState<string>("M");
  const [child, setChild] = useState(false);
  const [ageBracket, setAgeBracket] = useState("");
  const [membershipStatus, setMembershipStatus] = useState("");
  const [isLoadingPerson, setIsLoadingPerson] = useState(false);
  const [pcoFetched, setPcoFetched] = useState(false);

  useEffect(() => {
    if (!checkin || !isOpen) return;

    setFirstName(checkin.firstName || "");
    setLastName(checkin.lastName || "");
    setGender(checkin.gender || "");
    setChild(checkin.child || false);
    setAgeBracket(checkin.ageBracket || "");
    setMembershipStatus(checkin.membershipStatus || MEMBERSHIP_CLEAR);
    setPcoFetched(false);

    if (checkin.pcoPersonId) {
      setIsLoadingPerson(true);
      fetch(`/api/pco/person/${checkin.pcoPersonId}`, { credentials: "include" })
        .then(res => {
          if (!res.ok) throw new Error("Failed to fetch");
          return res.json();
        })
        .then((person: { firstName: string | null; lastName: string | null; gender: string | null; child: boolean | null; ageBracket: string | null; membershipStatus: string | null }) => {
          if (person.firstName) setFirstName(person.firstName);
          if (person.lastName) setLastName(person.lastName);
          if (person.gender) setGender(person.gender);
          if (person.child !== null) setChild(person.child);
          if (person.ageBracket) setAgeBracket(person.ageBracket);
          if (person.membershipStatus) setMembershipStatus(person.membershipStatus);
          else setMembershipStatus(MEMBERSHIP_CLEAR);
          setPcoFetched(true);
        })
        .catch(() => {
          toast({ title: "Notice", description: "Could not load full details from PCO. Showing cached data.", variant: "destructive" });
        })
        .finally(() => setIsLoadingPerson(false));
    }
  }, [checkin, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkin) return;

    const resolvedStatus = membershipStatus === MEMBERSHIP_CLEAR ? null : membershipStatus || null;

    const updates: Record<string, any> = {
      firstName: firstName || null,
      lastName: lastName || null,
      child,
      ageBracket: ageBracket || null,
      membershipStatus: resolvedStatus,
    };
    if (gender) {
      updates.gender = gender;
    }
    onSave(checkin.id, updates);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Check-in Person</DialogTitle>
        </DialogHeader>

        {isLoadingPerson ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading from Planning Center...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="ci-firstName">First Name</Label>
              <Input
                id="ci-firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="e.g. John"
                data-testid="input-checkin-firstname"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ci-lastName">Last Name</Label>
              <Input
                id="ci-lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="e.g. Doe"
                data-testid="input-checkin-lastname"
              />
            </div>

            <div className="flex items-center justify-between gap-2 rounded-lg border p-3 shadow-sm">
              <div className="space-y-0.5">
                <Label>Gender</Label>
                <div className="text-xs text-muted-foreground">
                  {gender === "F" ? "Female" : gender === "M" ? "Male" : "Not set"}
                </div>
              </div>
              <Switch
                checked={gender === "F"}
                onCheckedChange={(checked) => setGender(checked ? "F" : "M")}
                data-testid="switch-checkin-gender"
              />
            </div>

            <div className="flex items-center justify-between gap-2 rounded-lg border p-3 shadow-sm">
              <div className="space-y-0.5">
                <Label>Adult / Child</Label>
                <div className="text-xs text-muted-foreground">
                  {child ? "Child" : "Adult"}
                </div>
              </div>
              <Switch
                checked={child}
                onCheckedChange={setChild}
                data-testid="switch-checkin-child"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ci-ageBracket">Age Bracket</Label>
              <Select value={ageBracket} onValueChange={setAgeBracket}>
                <SelectTrigger data-testid="select-checkin-age">
                  <SelectValue placeholder="Select age bracket" />
                </SelectTrigger>
                <SelectContent>
                  {AGE_BRACKETS.map((ab) => (
                    <SelectItem key={ab} value={ab}>{ab}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ci-membership">Membership Status</Label>
              <Select value={membershipStatus} onValueChange={setMembershipStatus}>
                <SelectTrigger data-testid="select-checkin-membership">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {MEMBERSHIP_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={onClose} data-testid="button-checkin-cancel">
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving} data-testid="button-checkin-save">
                {isSaving ? "Saving..." : "Save & Push to PCO"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
