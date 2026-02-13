import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TourStep {
  targetSelector: string;
  title: string;
  description: string;
  position?: "top" | "bottom" | "left" | "right";
}

interface GuidedTourProps {
  steps: TourStep[];
  isOpen: boolean;
  onClose: () => void;
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function GuidedTour({ steps, isOpen, onClose }: GuidedTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<SpotlightRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const step = steps[currentStep];

  const updateTargetRect = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(step.targetSelector);
    if (el) {
      const rect = el.getBoundingClientRect();
      const padding = 6;
      setTargetRect({
        top: rect.top - padding,
        left: rect.left - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      });
    } else {
      setTargetRect(null);
    }
  }, [step]);

  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(0);
      return;
    }
    updateTargetRect();
    const interval = setInterval(updateTargetRect, 300);
    window.addEventListener("resize", updateTargetRect);
    window.addEventListener("scroll", updateTargetRect, true);
    return () => {
      clearInterval(interval);
      window.removeEventListener("resize", updateTargetRect);
      window.removeEventListener("scroll", updateTargetRect, true);
    };
  }, [isOpen, currentStep, updateTargetRect]);

  if (!isOpen || !step) return null;

  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;

  const getTooltipPosition = (): { top?: string; bottom?: string; left?: string; right?: string; transform?: string } => {
    if (!targetRect) return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

    const pos = step.position || "bottom";
    const gap = 12;

    switch (pos) {
      case "top":
        return {
          bottom: `${window.innerHeight - targetRect.top + gap}px`,
          left: `${Math.max(16, Math.min(targetRect.left + targetRect.width / 2 - 140, window.innerWidth - 296))}px`,
        };
      case "bottom":
        return {
          top: `${targetRect.top + targetRect.height + gap}px`,
          left: `${Math.max(16, Math.min(targetRect.left + targetRect.width / 2 - 140, window.innerWidth - 296))}px`,
        };
      case "left":
        return {
          top: `${Math.max(16, Math.min(targetRect.top, window.innerHeight - 200))}px`,
          right: `${window.innerWidth - targetRect.left + gap}px`,
        };
      case "right":
        return {
          top: `${Math.max(16, Math.min(targetRect.top, window.innerHeight - 200))}px`,
          left: `${targetRect.left + targetRect.width + gap}px`,
        };
      default:
        return {
          top: `${targetRect.top + targetRect.height + gap}px`,
          left: `${Math.max(16, Math.min(targetRect.left + targetRect.width / 2 - 140, window.innerWidth - 296))}px`,
        };
    }
  };

  return (
    <div className="fixed inset-0 z-[9999]" data-testid="guided-tour-overlay">
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
        <defs>
          <mask id="tour-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left}
                y={targetRect.top}
                width={targetRect.width}
                height={targetRect.height}
                rx="8"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.6)"
          mask="url(#tour-spotlight-mask)"
          style={{ pointerEvents: "auto" }}
          onClick={(e) => e.stopPropagation()}
        />
      </svg>

      {targetRect && (
        <div
          className="absolute rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-transparent"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
            pointerEvents: "none",
          }}
        />
      )}

      <div
        ref={tooltipRef}
        className="absolute z-10 bg-card border border-border rounded-xl shadow-2xl p-4 w-[280px] space-y-3"
        style={{
          ...getTooltipPosition(),
          pointerEvents: "auto",
        }}
        data-testid="tour-tooltip"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">
              Step {currentStep + 1} of {steps.length}
            </p>
            <h3 className="font-bold text-sm text-foreground">{step.title}</h3>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="rounded-full h-7 w-7 shrink-0"
            data-testid="button-tour-close"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">{step.description}</p>

        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-colors",
                  i === currentStep ? "bg-primary" : "bg-muted-foreground/30"
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-1">
            {!isFirst && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentStep((s) => s - 1)}
                className="h-7 px-2 text-xs"
                data-testid="button-tour-back"
              >
                <ChevronLeft className="w-3 h-3 mr-0.5" />
                Back
              </Button>
            )}
            {isLast ? (
              <Button
                size="sm"
                onClick={onClose}
                className="h-7 px-3 text-xs"
                data-testid="button-tour-done"
              >
                Got it!
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => setCurrentStep((s) => s + 1)}
                className="h-7 px-3 text-xs"
                data-testid="button-tour-next"
              >
                Next
                <ChevronRight className="w-3 h-3 ml-0.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const dashboardTourSteps: TourStep[] = [
  {
    targetSelector: '[data-testid="button-session-info"]',
    title: "Service Date & Time",
    description: "This shows the current Sunday and service time. Tap it to go back and pick a different date or time.",
    position: "bottom",
  },
  {
    targetSelector: '[data-testid="button-prev-sunday"]',
    title: "Navigate Sundays",
    description: "Use the left and right arrows to quickly jump between Sundays. You can also swipe left or right on the screen when in locked mode.",
    position: "bottom",
  },
  {
    targetSelector: '[data-testid="button-sync"]',
    title: "Sync Data",
    description: "Tap the refresh button to sync your data with the server. If someone else has made changes, you'll be asked to choose which version to keep.",
    position: "bottom",
  },
  {
    targetSelector: '[data-testid="input-search"]',
    title: "Search People",
    description: "Search for anyone across all service dates. Results show the person's name, family, and when they were first seen.",
    position: "bottom",
  },
  {
    targetSelector: '[data-testid="button-mode-locked"]',
    title: "Locked Mode",
    description: "In locked mode, tap a person tile to edit their name and details. This is for filling in information after the initial capture.",
    position: "bottom",
  },
  {
    targetSelector: '[data-testid="button-mode-unlocked"]',
    title: "Unlocked Mode",
    description: "In unlocked mode, you can add/remove families and people, toggle person types (man/woman/boy/girl) by tapping tiles, and rearrange the structure. Use this for fast initial capture.",
    position: "bottom",
  },
  {
    targetSelector: '[data-testid="button-add-family"]',
    title: "Add a Family",
    description: "Tap this button to create a new family card. Each card represents a family group with one or more people.",
    position: "top",
  },
  {
    targetSelector: '[data-testid="button-settings"]',
    title: "Settings",
    description: "Manage your church settings, service times, team members, and Planning Center integration here.",
    position: "bottom",
  },
];
