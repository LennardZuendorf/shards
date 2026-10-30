/**
 * The task "more" menu, rendered either as a DropdownMenu (⋯ button) or a ContextMenu (right
 * click) from one item list.
 */
import {
  ArrowRightLeftIcon,
  BanIcon,
  CopyIcon,
  ExternalLinkIcon,
  FlagIcon,
  HandIcon,
  LinkIcon,
  PencilIcon,
  PanelRightOpenIcon,
  Trash2Icon,
  UndoDotIcon,
  UserRoundIcon,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { toast } from "sonner";
import {
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { openTask } from "@/app/detail";
import { moveDueToDay } from "@/lib/dates";
import { formatKeys } from "@/lib/hotkeys";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { TaskActions } from "./actions";
import { MemberPickerContent, PriorityItems, ProjectPickerContent, quickDates } from "./pickers";
import { startEditing } from "./selection";
import { openLabel, openTaskWith, useOpenTargets } from "@/components/shared/open-in";

interface Kit {
  Item: ComponentType<{ onSelect?: (e: Event) => void; className?: string; children?: ReactNode; variant?: "default" | "destructive" }>;
  Sep: ComponentType;
  Label: ComponentType<{ className?: string; children?: ReactNode }>;
  Sub: ComponentType<{ children?: ReactNode }>;
  SubTrigger: ComponentType<{ className?: string; children?: ReactNode }>;
  SubContent: ComponentType<{ className?: string; children?: ReactNode }>;
  Shortcut: ComponentType<{ children?: ReactNode }>;
}

const DROPDOWN: Kit = {
  Item: DropdownMenuItem as Kit["Item"],
  Sep: DropdownMenuSeparator,
  Label: DropdownMenuLabel,
  Sub: DropdownMenuSub,
  SubTrigger: DropdownMenuSubTrigger,
  SubContent: DropdownMenuSubContent,
  Shortcut: DropdownMenuShortcut,
};

const CONTEXT: Kit = {
  Item: ContextMenuItem as Kit["Item"],
  Sep: ContextMenuSeparator,
  Label: ContextMenuLabel,
  Sub: ContextMenuSub,
  SubTrigger: ContextMenuSubTrigger,
  SubContent: ContextMenuSubContent,
  Shortcut: ContextMenuShortcut,
};

const keys = (k: string) => formatKeys(k).join("");

export function TaskMenuItems({ task, actions, kind }: { task: Task; actions: TaskActions; kind: "dropdown" | "context" }) {
  const K = kind === "dropdown" ? DROPDOWN : CONTEXT;
  const done = task.status === "done" || task.status === "cancelled";
  const claimedByMe = !!task.claimed_by && (!actions.me || task.claimed_by === actions.me);
  const { primary: openTarget } = useOpenTargets();
  return (
    <>
      <K.Item onSelect={() => openTask(task.id)} className="gap-2">
        <PanelRightOpenIcon /> Open details <K.Shortcut>↵</K.Shortcut>
      </K.Item>
      <K.Item onSelect={() => startEditing(task.id)} className="gap-2">
        <PencilIcon /> Rename <K.Shortcut>R</K.Shortcut>
      </K.Item>
      <K.Sep />
      <K.Label className="pb-0 text-xs text-muted-foreground">Due date</K.Label>
      <div className="flex items-center gap-0.5 px-1.5 py-1">
        {quickDates().map((q) => (
          <K.Item
            key={q.label}
            onSelect={() => actions.schedule(task, q.date ? moveDueToDay(task.due, q.date) : null)}
            className="size-8 justify-center p-0"
          >
            <span title={q.label} className="contents">
              <q.icon className={cn("size-4!", q.tone)} />
            </span>
          </K.Item>
        ))}
      </div>
      <K.Label className="pb-0 text-xs text-muted-foreground">Priority</K.Label>
      <div className="flex items-center gap-0.5 px-1.5 py-1">
        {(["urgent", "high", "normal", "low"] as const).map((p, i) => (
          <K.Item key={p} onSelect={() => actions.setPriority(task, p)} className={cn("size-8 justify-center p-0", task.priority === p && "bg-accent")}>
            <span title={`P${i + 1}`} className="contents">
              <FlagIcon
                className={cn(
                  "size-4!",
                  p === "urgent" ? "text-priority-urgent" : p === "high" ? "text-priority-high" : p === "normal" ? "text-priority-normal" : "text-muted-foreground",
                )}
                fill={p === "low" ? "none" : "currentColor"}
              />
            </span>
          </K.Item>
        ))}
      </div>
      <K.Sep />
      <K.Sub>
        <K.SubTrigger className="gap-2">
          <ArrowRightLeftIcon className="size-4 text-muted-foreground" /> Move to…
        </K.SubTrigger>
        <K.SubContent className="p-0">
          <ProjectPickerContent
            project={task.project}
            section={task.section}
            onPick={(project, section, label) => actions.moveTo(task, project, section, label)}
          />
        </K.SubContent>
      </K.Sub>
      <K.Sub>
        <K.SubTrigger className="gap-2">
          <UserRoundIcon className="size-4 text-muted-foreground" /> Assign to…
        </K.SubTrigger>
        <K.SubContent className="p-0">
          <MemberPickerContent value={task.owner} onPick={(id) => actions.setOwner(task, id)} />
        </K.SubContent>
      </K.Sub>
      <K.Sub>
        <K.SubTrigger className="gap-2">
          <FlagIcon className="size-4 text-muted-foreground" /> Priority
        </K.SubTrigger>
        <K.SubContent>
          <PriorityItems value={task.priority} onPick={(p) => actions.setPriority(task, p)} Item={K.Item as typeof DropdownMenuItem} />
        </K.SubContent>
      </K.Sub>
      {!done &&
        (task.status === "claimed" ? (
          <K.Item onSelect={() => actions.release(task)} className="gap-2">
            <UndoDotIcon /> {claimedByMe ? "Release" : `Release from ${task.claimed_by}`}
          </K.Item>
        ) : (
          <K.Item onSelect={() => actions.claim(task)} className="gap-2">
            <HandIcon /> Claim as me
          </K.Item>
        ))}
      <K.Item onSelect={() => void actions.duplicate(task)} className="gap-2">
        <CopyIcon /> Duplicate
      </K.Item>
      <K.Item
        onSelect={() => {
          void navigator.clipboard?.writeText(task.id).then(
            () => toast.success(`Copied ${task.id}`),
            () => toast.error("Clipboard unavailable"),
          );
        }}
        className="gap-2"
      >
        <LinkIcon /> Copy task id
      </K.Item>
      {openTarget && (
        <K.Item onSelect={() => void openTaskWith(task.id, openTarget)} className="gap-2">
          <ExternalLinkIcon /> {openLabel(openTarget)}
        </K.Item>
      )}
      <K.Sep />
      {!done && (
        <K.Item onSelect={() => actions.cancel(task)} className="gap-2">
          <BanIcon /> Cancel task
        </K.Item>
      )}
      <K.Item variant="destructive" onSelect={() => actions.remove(task)} className="gap-2">
        <Trash2Icon /> Delete <K.Shortcut>{keys("mod+backspace")}</K.Shortcut>
      </K.Item>
    </>
  );
}
