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
    switch (person.type) {
      case "man": return <User className="w-8 h-8" />;
      case "woman": return <User className="w-8 h-8 text-pink-500" />;
      case "boy": return <Baby className="w-8 h-8 text-blue-400" />;
      case "girl": return <Baby className="w-8 h-8 text-pink-400" />;
      default: return <User className="w-8 h-8 text-gray-400" />;
    }
  };

  const getLabel = () => {
    const label = person.firstName || person.type;
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  const handleClick = (e: React.MouseEvent) => {
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
        <div className="absolute top-1.5 left-1.5 flex gap-1">
          <span className="px-1 py-0.5 text-[6px] font-bold bg-primary/10 text-primary rounded-full leading-none uppercase flex items-center justify-center min-w-[12px] h-3">
            {person.ageBracket || "?"}
          </span>
        </div>

        <div className="p-3 rounded-full bg-secondary/50 group-hover:bg-background transition-colors">
          {getIcon()}
        </div>
        
        <div className="flex flex-col items-center text-center px-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {getLabel()}
          </span>
        </div>
        
        {person.status === 'newcomer' ? (
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-green-500 border border-white shadow-sm" />
        ) : (
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-orange-500 border border-white shadow-sm" />
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

export function AddPersonTile({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onClick(e);
  };

  return (
    <motion.button
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={handleClick}
      className="w-full aspect-square rounded-2xl flex flex-col items-center justify-center gap-2 border-2 border-dashed border-muted-foreground/20 hover:border-primary/50 hover:bg-primary/5 transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-primary/20"
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
