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
    
    onSave(person.id, {
      firstName: firstName || null,
      lastName: lastName || null,
      ageBracket: ageBracket || null,
      status,
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
            <Select value={ageBracket} onValueChange={setAgeBracket}>
              <SelectTrigger>
                <SelectValue placeholder="Select age bracket" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0-2">Nursery (0-2)</SelectItem>
                <SelectItem value="3-5">Pre-K (3-5)</SelectItem>
                <SelectItem value="K-5">Elementary (K-5)</SelectItem>
                <SelectItem value="6-8">Middle School (6-8)</SelectItem>
                <SelectItem value="9-12">High School (9-12)</SelectItem>
                <SelectItem value="Adult">Adult</SelectItem>
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
