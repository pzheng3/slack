"use client";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Image from "next/image";
import { useCallback, useMemo, useState } from "react";

interface ScheduleDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback to close the dialog */
  onOpenChange: (open: boolean) => void;
  /** Called with the selected date/time when the user confirms */
  onSchedule: (sendAt: Date) => void;
  /**
   * When true, renders the dialog at z-[200] so it appears above other
   * fixed overlays like the NewMessageDialog (z-[100]).
   */
  highZ?: boolean;
}

/**
 * Rounds a date up to the next 5-minute mark.
 * e.g. 14:03 → 14:05, 14:07 → 14:10
 */
function roundToNext5Min(date: Date): Date {
  const d = new Date(date);
  const mins = d.getMinutes();
  const remainder = mins % 5;
  if (remainder !== 0) {
    d.setMinutes(mins + (5 - remainder));
  }
  d.setSeconds(0, 0);
  return d;
}

/**
 * Formats a Date to the local "YYYY-MM-DD" string for date inputs.
 */
function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Formats a Date to the local "HH:MM" string for time inputs.
 */
function toLocalTimeStr(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Returns a human-friendly label for a quick-schedule shortcut.
 * e.g. "Today at 3:30 PM" or "Tomorrow at 9:00 AM"
 */
function formatShortcutLabel(date: Date): string {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const timeStr = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (isToday) return `Today at ${timeStr}`;
  if (isTomorrow) return `Tomorrow at ${timeStr}`;
  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  }) + ` at ${timeStr}`;
}

/** Preset quick-schedule option */
interface QuickOption {
  label: string;
  sublabel: string;
  date: Date;
}

/**
 * Builds the list of quick-schedule shortcuts relative to the current time.
 */
function buildQuickOptions(): QuickOption[] {
  const now = new Date();
  const options: QuickOption[] = [];

  // In 30 minutes
  const in30 = new Date(now.getTime() + 30 * 60 * 1000);
  options.push({
    label: "In 30 minutes",
    sublabel: formatShortcutLabel(in30),
    date: roundToNext5Min(in30),
  });

  // In 1 hour
  const in1h = new Date(now.getTime() + 60 * 60 * 1000);
  options.push({
    label: "In 1 hour",
    sublabel: formatShortcutLabel(in1h),
    date: roundToNext5Min(in1h),
  });

  // Tomorrow morning (9 AM)
  const tomorrowMorning = new Date(now);
  tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
  tomorrowMorning.setHours(9, 0, 0, 0);
  options.push({
    label: "Tomorrow morning",
    sublabel: formatShortcutLabel(tomorrowMorning),
    date: tomorrowMorning,
  });

  return options;
}

/**
 * Dialog for scheduling a message to be sent at a future time.
 * Provides quick shortcuts (30 min, 1 hour, tomorrow, etc.) and a
 * custom date/time picker for precise scheduling.
 */
export function ScheduleDialog({
  open,
  onOpenChange,
  onSchedule,
  highZ = false,
}: ScheduleDialogProps) {
  const [showCustom, setShowCustom] = useState(false);

  // Default custom picker to 1 hour from now, rounded to 5-min
  const defaultCustom = useMemo(() => roundToNext5Min(new Date(Date.now() + 60 * 60 * 1000)), []);
  const [customDate, setCustomDate] = useState(toLocalDateStr(defaultCustom));
  const [customTime, setCustomTime] = useState(toLocalTimeStr(defaultCustom));

  const quickOptions = useMemo(() => buildQuickOptions(), []);

  /** Reset state when dialog opens */
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        setShowCustom(false);
        const def = roundToNext5Min(new Date(Date.now() + 60 * 60 * 1000));
        setCustomDate(toLocalDateStr(def));
        setCustomTime(toLocalTimeStr(def));
      }
      onOpenChange(next);
    },
    [onOpenChange]
  );

  /** Handle selecting a quick option */
  const handleQuickSelect = useCallback(
    (date: Date) => {
      onSchedule(date);
      onOpenChange(false);
    },
    [onSchedule, onOpenChange]
  );

  /** Parse custom date/time and check validity */
  const customDateTime = useMemo(() => {
    if (!customDate || !customTime) return null;
    const [year, month, day] = customDate.split("-").map(Number);
    const [hours, minutes] = customTime.split(":").map(Number);
    const d = new Date(year, month - 1, day, hours, minutes, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }, [customDate, customTime]);

  const isCustomValid = customDateTime !== null && customDateTime > new Date();

  /** Handle confirming custom schedule */
  const handleCustomConfirm = useCallback(() => {
    if (customDateTime && isCustomValid) {
      onSchedule(customDateTime);
      onOpenChange(false);
    }
  }, [customDateTime, isCustomValid, onSchedule, onOpenChange]);

  const todayStr = toLocalDateStr(new Date());

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={`sm:max-w-[400px] gap-0 p-0 overflow-hidden ${highZ ? "z-[200]" : ""}`}
        overlayClassName={highZ ? "z-[200]" : undefined}
        showCloseButton={false}
      >
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-[18px] font-bold text-[var(--color-slack-text)]">
            Schedule message
          </DialogTitle>
        </DialogHeader>

        {/* Quick options */}
        <div className="flex flex-col">
          {quickOptions.map((opt) => (
            <button
              key={opt.label}
              onClick={() => handleQuickSelect(opt.date)}
              className="flex items-center gap-3 px-5 py-2.5 text-left hover:bg-[#f8f8f8] transition-colors"
            >
              <Image
                src="/icons/clock.svg"
                alt=""
                width={18}
                height={18}
                className="shrink-0 opacity-60"
                onError={(e) => {
                  // Fallback if clock icon doesn't exist
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <div className="flex flex-col min-w-0">
                <span className="text-[15px] font-medium text-[var(--color-slack-text)]">
                  {opt.label}
                </span>
                <span className="text-[13px] text-[rgba(29,28,29,0.5)]">
                  {opt.sublabel}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="my-1 h-px bg-[rgba(29,28,29,0.13)]" />

        {/* Custom date/time toggle */}
        {!showCustom ? (
          <button
            onClick={() => setShowCustom(true)}
            className="flex items-center gap-3 px-5 py-2.5 pb-4 text-left hover:bg-[#f8f8f8] transition-colors"
          >
            <Image
              src="/icons/settings.svg"
              alt=""
              width={18}
              height={18}
              className="shrink-0 opacity-60"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <span className="text-[15px] font-medium text-[var(--color-slack-text)]">
              Custom time
            </span>
          </button>
        ) : (
          <div className="px-5 py-3 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-1 flex-1">
                <label
                  htmlFor="schedule-date"
                  className="text-[13px] font-medium text-[rgba(29,28,29,0.7)]"
                >
                  Date
                </label>
                <input
                  id="schedule-date"
                  type="date"
                  value={customDate}
                  min={todayStr}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="rounded-[8px] border border-[rgba(29,28,29,0.3)] bg-white px-3 py-[7px] text-[14px] text-[var(--color-slack-text)] outline-none focus:border-[rgba(29,28,29,0.5)] focus:shadow-[0_0_0_3px_rgba(18,100,163,0.2)]"
                />
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <label
                  htmlFor="schedule-time"
                  className="text-[13px] font-medium text-[rgba(29,28,29,0.7)]"
                >
                  Time
                </label>
                <input
                  id="schedule-time"
                  type="time"
                  value={customTime}
                  onChange={(e) => setCustomTime(e.target.value)}
                  className="rounded-[8px] border border-[rgba(29,28,29,0.3)] bg-white px-3 py-[7px] text-[14px] text-[var(--color-slack-text)] outline-none focus:border-[rgba(29,28,29,0.5)] focus:shadow-[0_0_0_3px_rgba(18,100,163,0.2)]"
                />
              </div>
            </div>
            {customDateTime && !isCustomValid && (
              <p className="text-[13px] text-red-500">
                Please select a time in the future
              </p>
            )}
          </div>
        )}

        {/* Footer with Schedule / Cancel buttons (only visible in custom mode) */}
        {showCustom && (
          <DialogFooter className="flex-row justify-end gap-2 px-5 pb-4 pt-1">
            <button
              onClick={() => setShowCustom(false)}
              className="rounded-[8px] border border-[rgba(29,28,29,0.3)] bg-white px-4 py-[7px] text-[14px] font-medium text-[var(--color-slack-text)] hover:bg-[#f8f8f8] transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleCustomConfirm}
              disabled={!isCustomValid}
              className="rounded-[8px] bg-[rgba(29,28,29,0.08)] px-4 py-[7px] text-[14px] font-medium text-[var(--color-slack-text)] transition-colors enabled:bg-[var(--color-slack-send-active)] enabled:text-white enabled:hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Schedule
            </button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
