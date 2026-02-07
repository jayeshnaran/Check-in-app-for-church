import { type Person } from "@shared/schema";
import { cn } from "@/lib/utils";
import { User, Users, Baby, UserMinus } from "lucide-react";
import { motion } from "framer-motion";

interface PersonTileProps {
  person: Person;
  mode: "locked" | "unlocked";
  onToggleType?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function PersonTile({ person, mode, onToggleType, onEdit, onDelete }: PersonTileProps) {
  const getIcon = () => {
    if (person.firstName) return null;
    switch (person.type) {
      case "man": return <User className="w-8 h-8" />;
      case "woman": return <User className="w-8 h-8 text-pink-500" />;
      case "boy": return <Baby className="w-8 h-8 text-blue-400" />;
      case "girl": return <Baby className="w-8 h-8 text-pink-400" />;
      default: return <User className="w-8 h-8 text-gray-400" />;
    }
  };

  const getLabel = () => {
    if (person.firstName) return null;
    switch (person.type) {
      case "man": return "Man";
      case "woman": return "Woman";
      case "boy": return "Boy";
      case "girl": return "Girl";
      default: return "Unknown";
    }
  };

  const getInitials = () => {
    if (!person.firstName) return null;
    const firstInitial = person.firstName.charAt(0).toUpperCase();
    const lastInitial = person.lastName ? person.lastName.charAt(0).toUpperCase() : "";
    return firstInitial + lastInitial;
  };

  const handleClick = () => {
    if (mode === "unlocked") {
      onToggleType?.();
    } else {
      onEdit?.();
    }
  };

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="relative group"
    >
      <button
        onClick={handleClick}
        className={cn(
          "w-full aspect-square rounded-2xl flex flex-col items-center justify-center gap-2 transition-all duration-200 border-2",
          "hover:scale-[1.02] active:scale-[0.98]",
          mode === "unlocked" 
            ? "bg-white border-dashed border-primary/30 hover:border-primary hover:bg-primary/5" 
            : "bg-white border-transparent shadow-md hover:shadow-lg border-b-4 border-b-border hover:border-b-primary/50"
        )}
      >
        {person.firstName ? (
          <div className="flex items-center justify-center">
            <span className="text-3xl font-black text-primary tracking-tighter">
              {getInitials()}
            </span>
          </div>
        ) : (
          getIcon() && (
            <div className="p-3 rounded-full bg-secondary/50 group-hover:bg-background transition-colors">
              {getIcon()}
            </div>
          )
        )}
        
        <div className="flex flex-col items-center text-center px-1">
          {getLabel() && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {getLabel()}
            </span>
          )}
          {mode === "locked" && person.ageBracket && (
            <span className="mt-1 px-1.5 py-0.5 text-[9px] font-medium bg-secondary text-secondary-foreground rounded-md">
              {person.ageBracket}
            </span>
          )}
        </div>
        
        {person.status === 'newcomer' ? (
          <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white shadow-sm" />
        ) : (
          <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-orange-500 border-2 border-white shadow-sm" />
        )}
      </button>

      {mode === "unlocked" && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.();
          }}
          className="absolute -top-2 -right-2 p-1.5 bg-destructive text-destructive-foreground rounded-full shadow-sm hover:bg-destructive/90 transition-colors opacity-0 group-hover:opacity-100 scale-75 hover:scale-100"
        >
          <UserMinus className="w-4 h-4" />
        </button>
      )}
    </motion.div>
  );
}

export function AddPersonTile({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={onClick}
      className="w-full aspect-square rounded-2xl flex flex-col items-center justify-center gap-2 border-2 border-dashed border-muted-foreground/20 hover:border-primary/50 hover:bg-primary/5 transition-all duration-200 group"
    >
      <div className="p-3 rounded-full bg-transparent group-hover:bg-background transition-colors">
        <Users className="w-8 h-8 text-muted-foreground/40 group-hover:text-primary/60" />
      </div>
      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60 group-hover:text-primary/60">
        Add Person
      </span>
    </motion.button>
  );
}
