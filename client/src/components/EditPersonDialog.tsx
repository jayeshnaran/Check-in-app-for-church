import { useState, useEffect } from "react";
import { type Person, type UpdatePersonRequest } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface EditPersonDialogProps {
  person: Person | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: number, updates: UpdatePersonRequest) => void;
  isSaving: boolean;
}

export function EditPersonDialog({ person, isOpen, onClose, onSave, isSaving }: EditPersonDialogProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [ageBracket, setAgeBracket] = useState("");
  const [status, setStatus] = useState<"newcomer" | "visitor">("newcomer");

  useEffect(() => {
    if (person) {
      setFirstName(person.firstName || "");
      setLastName(person.lastName || "");
      setAgeBracket(person.ageBracket || "");
      setStatus((person.status as any) || "newcomer");
    }
  }, [person]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!person) return;
    
    const childBrackets = ["0-3", "4-7", "8-11", "12-17"];
    const isChildBracket = childBrackets.includes(ageBracket);
    let newType = person.type;

    if (isChildBracket) {
      if (person.type === "man") newType = "boy";
      if (person.type === "woman") newType = "girl";
    } else {
      if (person.type === "boy") newType = "man";
      if (person.type === "girl") newType = "woman";
    }
    
    onSave(person.id, {
      firstName: firstName || null,
      lastName: lastName || null,
      ageBracket: ageBracket || null,
      status,
      type: newType,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Person Details</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name</Label>
            <Input 
              id="firstName" 
              value={firstName} 
              onChange={(e) => setFirstName(e.target.value)} 
              placeholder="e.g. John"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name</Label>
            <Input 
              id="lastName" 
              value={lastName} 
              onChange={(e) => setLastName(e.target.value)} 
              placeholder="e.g. Doe"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="ageBracket">Age Bracket</Label>
            <Select value={ageBracket} onValueChange={(val) => {
              setAgeBracket(val);
              // Auto-switch person type based on age
              const childBrackets = ["0-3", "4-7", "8-11", "12-17"];
              const isChildBracket = childBrackets.includes(val);
              // We'll pass this hint to the onSave or handle it in the person type selection
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Select age bracket" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0-3">0-3</SelectItem>
                <SelectItem value="4-7">4-7</SelectItem>
                <SelectItem value="8-11">8-11</SelectItem>
                <SelectItem value="12-17">12-17</SelectItem>
                <SelectItem value="18-24">18-24</SelectItem>
                <SelectItem value="25-29">25-29</SelectItem>
                <SelectItem value="30-39">30-39</SelectItem>
                <SelectItem value="40-49">40-49</SelectItem>
                <SelectItem value="50-59">50-59</SelectItem>
                <SelectItem value="60-69">60-69</SelectItem>
                <SelectItem value="70-79">70-79</SelectItem>
                <SelectItem value="80-89">80-89</SelectItem>
                <SelectItem value="90-99">90-99</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
            <div className="space-y-0.5">
              <Label htmlFor="status">Visitor Status</Label>
              <div className="text-xs text-muted-foreground">
                {status === 'newcomer' ? 'Newcomer (Green dot)' : 'Visitor'}
              </div>
            </div>
            <Switch 
              id="status" 
              checked={status === 'visitor'} 
              onCheckedChange={(checked) => setStatus(checked ? 'visitor' : 'newcomer')} 
            />
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
