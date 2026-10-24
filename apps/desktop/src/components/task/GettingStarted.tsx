/**
 * First-run onboarding for an empty vault (no tasks in any state, no projects): three steps in
 * the Inbox — add a task, create a project, connect an agent over MCP.
 */
import { BotIcon, CheckIcon, CopyIcon, FolderPlusIcon, ListPlusIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ShardsLogo } from "@/components/shared/ShardsLogo";
import { Button } from "@/components/ui/button";
import { openQuickAdd } from "@/app/quickadd-store";
import { AddProjectDialog } from "./AddProjectDialog";
import { MCP_SNIPPET, QUICK_ADD_EXAMPLE } from "./onboarding";

function Step({ n, icon, title, children }: { n: number; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4 rounded-xl border bg-card p-4">
      <div className="flex flex-col items-center gap-2">
        <span className="grid size-7 place-items-center rounded-full bg-secondary text-small font-semibold text-foreground">{n}</span>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-2 text-body font-semibold">
          <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>
          {title}
        </div>
        {children}
      </div>
    </li>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to the clipboard");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn’t copy — select the text and copy it by hand");
    }
  };
  return (
    <Button size="icon-sm" variant="ghost" aria-label="Copy command" onClick={() => void copy()}>
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  );
}

export function GettingStarted() {
  const [addProject, setAddProject] = useState(false);
  return (
    <section aria-labelledby="getting-started" className="mx-auto max-w-xl py-8">
      <div className="mb-6 flex items-center gap-3">
        <ShardsLogo className="size-9" />
        <div>
          <h2 id="getting-started" className="text-lg font-semibold tracking-tight">
            Getting started
          </h2>
          <p className="text-sm text-muted-foreground">Your vault is empty. Three steps and you and your agents are working from one list.</p>
        </div>
      </div>
      <ol className="space-y-3">
        <Step n={1} icon={<ListPlusIcon />} title="Add your first task">
          <p className="text-small text-muted-foreground">
            Press <kbd className="rounded border bg-muted px-1 font-mono text-micro">Q</kbd> anywhere. Quick add understands dates, priorities and labels:
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md bg-muted px-2 py-1 font-mono text-micro">{QUICK_ADD_EXAMPLE}</code>
            <Button size="sm" onClick={() => openQuickAdd({ text: QUICK_ADD_EXAMPLE })}>
              Try it
            </Button>
          </div>
        </Step>
        <Step n={2} icon={<FolderPlusIcon />} title="Create a project">
          <p className="text-small text-muted-foreground">Group tasks by goal or area, with sections and a board. A project is a Markdown note in your vault.</p>
          <Button size="sm" variant="outline" onClick={() => setAddProject(true)}>
            New project
          </Button>
        </Step>
        <Step n={3} icon={<BotIcon />} title="Connect an agent">
          <p className="text-small text-muted-foreground">Give Claude Code the same tasks, notes and memories over MCP. Run this in a terminal:</p>
          <div className="flex items-center gap-1 rounded-md border bg-muted/60 py-0.5 pr-0.5 pl-2">
            <code className="min-w-0 flex-1 truncate font-mono text-micro select-all">{MCP_SNIPPET}</code>
            <CopyButton text={MCP_SNIPPET} />
          </div>
        </Step>
      </ol>
      <AddProjectDialog open={addProject} onOpenChange={setAddProject} />
    </section>
  );
}
