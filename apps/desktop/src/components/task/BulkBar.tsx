/** The bottom action bar while several tasks are selected (Shift/⌘-click, Shift+J/K). Esc clears. */
import { CalendarIcon, CheckIcon, FlagIcon, HashIcon, TagIcon, Trash2Icon, UserIcon, XIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Kbd } from "@/components/shared/Kbd";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useBulkActions } from "./bulk";
import { LabelPickerContent, MemberPickerContent, PriorityItems, ProjectPickerContent, ScheduleContent } from "./pickers";
import { clearMulti, useMultiCount } from "./selection";

function Pop({ icon, label, children }: { icon: ReactNode; label: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5" aria-label={label} title={label}>
          {icon}
          <span className="hidden @3xl/view:inline">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="center" className="w-auto p-0">
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
}

export function BulkBar() {
  const count = useMultiCount();
  const bulk = useBulkActions();
  if (count < 2) return null;
  return (
    <div
      role="toolbar"
      aria-label={`${count} tasks selected`}
      data-bulk-bar=""
      className="sticky bottom-4 z-40 mx-auto mt-2 flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border bg-popover px-2 py-1.5 whitespace-nowrap text-popover-foreground shadow-elevation-3"
    >
      <span className="px-2 text-small font-medium tabular-nums">{count} selected</span>
      <Pop icon={<CalendarIcon />} label="Schedule">
        {(close) => <ScheduleContent due={null} onPick={(d) => (bulk.schedule(d), close())} onDone={close} />}
      </Pop>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5" aria-label="Priority" title="Priority">
            <FlagIcon />
            <span className="hidden @3xl/view:inline">Priority</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" className="w-44">
          <PriorityItems value={null} onPick={bulk.setPriority} />
        </DropdownMenuContent>
      </DropdownMenu>
      <Pop icon={<HashIcon />} label="Move">
        {(close) => <ProjectPickerContent project={undefined} onPick={(p, s) => (bulk.moveTo(p, s), close())} />}
      </Pop>
      <Pop icon={<TagIcon />} label="Label">
        {(close) => <LabelPickerContent value={[]} onChange={(ls) => (ls[0] && bulk.addLabel(ls[0]), close())} />}
      </Pop>
      <Pop icon={<UserIcon />} label="Assign">
        {(close) => <MemberPickerContent value={null} onPick={(id) => (bulk.assign(id), close())} />}
      </Pop>
      <Button variant="ghost" size="sm" className="gap-1.5" onClick={bulk.complete} aria-label="Complete" title="Complete">
        <CheckIcon />
        <span className="hidden @3xl/view:inline">Complete</span>
      </Button>
      <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={bulk.remove} aria-label="Delete" title="Delete">
        <Trash2Icon />
        <span className="hidden @3xl/view:inline">Delete</span>
      </Button>
      <span className="mx-1 h-5 w-px bg-border" />
      <Button variant="ghost" size="icon-sm" onClick={clearMulti} aria-label="Clear selection" title="Clear selection (Esc)">
        <XIcon />
      </Button>
      <Kbd keys="escape" className="mr-1 hidden @3xl/view:inline-flex" />
    </div>
  );
}
