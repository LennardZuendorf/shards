/**
 * Waiting on me (R39): the one question an owner has when agents work for him — what needs me
 * right now. Every open task whose agent asked for input or reported a failure, plus every task
 * blocked by one of the operator's own open tasks, across all projects, longest wait first.
 *
 * Tasks inside an archived project never reach the queue (R35): an archived project is out of
 * play, so nothing in it can be waiting on anyone.
 *
 * A Needs input or Error row answers inline: the box appends the operator's signed comment and
 * clears the labels the agent raised, in one action. The stamp is the operator's own, which is
 * exactly what stops it from counting as a wait (R39), so the row leaves on the next read.
 * A Blocked row has no label to clear — its action opens the blocker it waits on.
 *
 * The queue only reads: `shards_task_list` for membership and order, `shards_task_get` for the
 * body, where the stamped question and its exact time live.
 */
import { useQueries } from "@tanstack/react-query";
import { HourglassIcon, SendIcon } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useDetail } from "@/app/detail";
import { EmptyState } from "@/components/shared/EmptyState";
import { archivedProjectIds } from "@/components/task/group-specs";
import { errorText } from "@/components/task/patch";
import { TaskListSkeleton, TaskQueryError, TaskView } from "@/components/task/TaskView";
import { taskAppend, taskGet, taskUpdate } from "@/lib/api";
import { tagSpec } from "@/lib/api/util";
import { relativeTime } from "@/lib/dates";
import { useMe, useMemberMap, useProjects, useTasks } from "@/lib/hooks";
import { useNow } from "@/lib/now";
import { invalidateSpaces, qk } from "@/lib/query";
import { ERROR_LABELS, NEEDS_INPUT_LABELS, waitingOnMe, type WaitKind, type WaitingTask } from "@/lib/status";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<WaitKind, string> = {
  "needs-input": "Needs input",
  error: "Error",
  blocked: "Blocked",
};

const KIND_CLASS: Record<WaitKind, string> = {
  "needs-input": "text-status-awaiting bg-status-awaiting/10",
  error: "text-due-overdue bg-due-overdue/10",
  blocked: "text-muted-foreground bg-muted",
};

/** The answer box: one comment plus the labels the agent raised, gone in one action. */
function AnswerBox({ row }: { row: WaitingTask }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const raised = row.task.tags.filter((t) => NEEDS_INPUT_LABELS.includes(t) || ERROR_LABELS.includes(t));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const answer = text.trim();
    if (!answer || sending) return;
    setSending(true);
    try {
      await taskAppend(row.task.id, answer, { section: "Comments", timestamp: true });
      await taskUpdate(row.task.id, { tags: tagSpec.remove(raised) });
      setText("");
      invalidateSpaces(["tasks"]);
    } catch (e) {
      toast.error(`Couldn’t answer: ${errorText(e)}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label={`Answer ${row.task.title}`}
        placeholder="Answer and send it back"
        className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <button
        type="submit"
        disabled={!text.trim() || sending}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <SendIcon className="size-3.5" />
        Answer &amp; resume
      </button>
    </form>
  );
}

interface WaitingRowProps {
  row: WaitingTask;
  now: Date;
  project: string | null;
  agent: string | null;
  onOpen: (id: string) => void;
  onOpenBlocker: (task: Task) => void;
}

function WaitingRow({ row, now, project, agent, onOpen, onOpenBlocker }: WaitingRowProps) {
  const waiting = relativeTime(row.since, now);
  return (
    <li data-task-row={row.task.id} className="flex flex-col gap-2 py-3">
      <div className="flex items-start gap-2.5">
        <button type="button" onClick={() => onOpen(row.task.id)} className="min-w-0 flex-1 text-left">
          <span className="block text-[14px] leading-5 font-medium break-words hover:underline">{row.task.title}</span>
        </button>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
            KIND_CLASS[row.kind],
          )}
        >
          {KIND_LABEL[row.kind]}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
        {project ? <span className="truncate">{project}</span> : <span>No project</span>}
        <span aria-hidden="true">·</span>
        <span>{agent ?? "unknown"}</span>
        {waiting ? (
          <>
            <span aria-hidden="true">·</span>
            <span>waiting {waiting}</span>
          </>
        ) : null}
      </div>
      {row.blocker ? (
        <p className="text-[13px] text-muted-foreground">
          Blocked by{" "}
          <button
            type="button"
            onClick={() => onOpenBlocker(row.blocker as Task)}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            {row.blocker.title}
          </button>{" "}
          (you)
        </p>
      ) : row.message ? (
        <p className="border-l-2 border-border pl-2 text-[13px] leading-5 whitespace-pre-line text-muted-foreground">
          {row.message}
        </p>
      ) : null}
      {row.kind === "blocked" ? null : <AnswerBox row={row} />}
    </li>
  );
}

export function WaitingView() {
  const active = useTasks();
  const projects = useProjects();
  const me = useMe();
  const members = useMemberMap();
  const now = useNow();
  const { openTask } = useDetail();

  const archived = useMemo(() => archivedProjectIds(projects.data), [projects.data]);
  // Membership and a first order come from the list payload; the wait start and the agent's
  // question live in the body, so each queued row asks for one `shards_task_get`.
  const queued = useMemo(() => waitingOnMe(active.data ?? [], me, { archived }), [active.data, me, archived]);
  const ids = useMemo(() => queued.map((r) => r.task.id), [queued]);
  const details = useQueries({
    queries: ids.map((id) => ({ queryKey: qk.tasks.detail(id), queryFn: () => taskGet(id) })),
  });
  const idsKey = ids.join("|");
  const loadedKey = details.map((q) => q.data?.body_sha256 ?? "").join("|");
  const bodies = useMemo(() => {
    const map = new Map<string, string | null | undefined>();
    ids.forEach((id, i) => map.set(id, details[i]?.data?.body));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, loadedKey]);
  const rows = useMemo(
    () => waitingOnMe(active.data ?? [], me, { archived, bodies }),
    [active.data, me, archived, bodies],
  );

  const projectTitle = (id: string | null) =>
    id ? (projects.data?.find((p) => p.id === id)?.title ?? null) : null;
  const agentName = (id: string | null) => (id ? (members.get(id)?.name ?? id) : null);

  const error = active.error && !active.data ? active.error : null;

  return (
    <TaskView
      title="Waiting on me"
      subtitle={
        active.data ? (
          <span>
            {rows.length ? `${rows.length} waiting · longest first` : "Nothing is waiting on you"}
          </span>
        ) : null
      }
    >
      {active.isLoading ? (
        <TaskListSkeleton groups={1} rows={3} />
      ) : error ? (
        <TaskQueryError error={error} onRetry={() => void active.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={HourglassIcon}
          tone="muted"
          title="Nothing is waiting on you"
          description="Tasks whose agent asked a question, hit an error, or sit behind one of your own tasks appear here — across every project, longest wait first."
        />
      ) : (
        <ul className="divide-y divide-border/60">
          {rows.map((row) => (
            <WaitingRow
              key={row.task.id}
              row={row}
              now={now}
              project={projectTitle(row.task.project)}
              agent={agentName(row.agent)}
              onOpen={openTask}
              onOpenBlocker={(blocker) => openTask(blocker.id)}
            />
          ))}
        </ul>
      )}
    </TaskView>
  );
}
