import { useState, useEffect } from "react";
import { type PcoCheckin } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

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
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState<string>("M");
  const [child, setChild] = useState(false);
  const [ageBracket, setAgeBracket] = useState("");
  const [membershipStatus, setMembershipStatus] = useState("");

  useEffect(() => {
    if (checkin) {
      setFirstName(checkin.firstName || "");
      setLastName(checkin.lastName || "");
      setGender(checkin.gender || "M");
      setChild(checkin.child || false);
      setAgeBracket(checkin.ageBracket || "");
      setMembershipStatus(checkin.membershipStatus || MEMBERSHIP_CLEAR);
    }
  }, [checkin]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkin) return;

    const resolvedStatus = membershipStatus === MEMBERSHIP_CLEAR ? null : membershipStatus || null;

    onSave(checkin.id, {
      firstName: firstName || null,
      lastName: lastName || null,
      gender,
      child,
      ageBracket: ageBracket || null,
      membershipStatus: resolvedStatus,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Check-in Person</DialogTitle>
        </DialogHeader>

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

          <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
            <div className="space-y-0.5">
              <Label>Gender</Label>
              <div className="text-xs text-muted-foreground">
                {gender === "M" ? "Male" : "Female"}
              </div>
            </div>
            <Switch
              checked={gender === "F"}
              onCheckedChange={(checked) => setGender(checked ? "F" : "M")}
              data-testid="switch-checkin-gender"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
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
      </DialogContent>
    </Dialog>
  );
}
