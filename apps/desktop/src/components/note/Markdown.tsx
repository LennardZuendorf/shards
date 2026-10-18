/**
 * Rendered Markdown for notes, memories and scratchpads: GFM, clickable wikilinks
 * (`[[id]]`, `[[Title]]`, `[[x|alias]]`) and optionally interactive task checkboxes.
 */
import { CheckIcon } from "lucide-react";
import { memo, useMemo, type ComponentProps, type MouseEvent } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { openTask } from "@/app/detail";
import { useNoteFiles, useNotes, useTasks } from "@/lib/hooks";
import { navigate, paths } from "@/lib/router";
import { SafeImage, SafeLink } from "@/components/shared/safe-markdown";
import { cn } from "@/lib/utils";
import { EntityIdLink } from "@/components/shared/EntityIdLink";
import { FILE_ENTITY_PREFIX, fileEntities, fileRoute, idTargetFromHref, remarkEntityIds, remarkWikilinks, resolveWikilink, wikiTargetFromHref, type WikiResolved } from "./wikilinks";

const PROSE = cn(
  "text-[14px] leading-relaxed text-foreground/90 break-words",
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_p]:my-2.5 [&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:text-foreground",
  "[&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground",
  "[&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-[14px] [&_h3]:font-semibold [&_h3]:text-foreground",
  "[&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:text-[13px] [&_h4]:font-semibold [&_h4]:uppercase [&_h4]:tracking-wide [&_h4]:text-muted-foreground",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_li]:pl-0.5",
  // A list mixing bullets and checkboxes keeps its bullets; only task items drop the marker
  // and pull their checkbox into the marker column. Loose lists get tight paragraph spacing.
  "[&_li>p]:my-0.5",
  "[&_li.task-list-item]:-ml-5 [&_li.task-list-item]:flex [&_li.task-list-item]:list-none [&_li.task-list-item]:items-start [&_li.task-list-item]:gap-2",
  "[&_li.task-list-item>p]:my-0 [&_li.task-list-item>p]:flex [&_li.task-list-item>p]:items-start [&_li.task-list-item>p]:gap-2",
  "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-[12.5px]",
  "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:bg-muted/50 [&_pre]:p-3 [&_pre]:text-[12.5px] [&_pre]:leading-relaxed [&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_hr]:my-4 [&_hr]:border-border",
  "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[13px] [&_th]:border-b [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium [&_td]:border-b [&_td]:px-2 [&_td]:py-1.5",
  "[&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:decoration-foreground/40 [&_a]:underline-offset-2 hover:[&_a]:decoration-foreground",
  "[&_strong]:font-semibold [&_strong]:text-foreground [&_img]:max-w-full [&_img]:rounded-lg",
);

export interface MarkdownProps {
  children: string;
  className?: string;
  /** Called with the 0-based body line of a clicked task checkbox. Omit for read-only. */
  onToggleTask?: (line: number) => void;
}

function wikiRoute(r: WikiResolved): string | null {
  if (r.kind === "file") return fileRoute(r.id.slice(FILE_ENTITY_PREFIX.length));
  if (r.kind === "note") return paths.notes(r.id);
  if (r.kind === "memory") return paths.memories(r.id);
  return null;
}

function goTo(r: WikiResolved) {
  const route = wikiRoute(r);
  if (route) navigate(route);
  else openTask(r.id);
}

/** Markdown renderer with wikilink resolution against notes and open tasks. */
export const Markdown = memo(function Markdown({ children, className, onToggleTask }: MarkdownProps) {
  const notes = useNotes();
  const tasks = useTasks();
  const files = useNoteFiles();
  const entities = useMemo(
    () => [
      ...(notes.data ?? []).map((n) => ({ id: n.id, title: n.title, type: "note" })),
      ...(tasks.data ?? []).map((t) => ({ id: t.id, title: t.title, type: "task" })),
      ...fileEntities(files.data ?? []),
    ],
    [notes.data, tasks.data, files.data],
  );

  const components = useMemo<Components>(
    () => ({
      a: ({ href, children: kids, node: _node, ...rest }) => {
        const bare = idTargetFromHref(href);
        if (bare) return <EntityIdLink id={bare}>{kids}</EntityIdLink>;
        const target = wikiTargetFromHref(href);
        if (target === null) {
          return (
            <SafeLink href={href} {...rest}>
              {kids}
            </SafeLink>
          );
        }
        const r = resolveWikilink(target, entities);
        if (!r) {
          return (
            <span className="cursor-help rounded-sm border-b border-dashed border-muted-foreground/50 text-muted-foreground" title={`No note named “${target}”`}>
              {kids}
            </span>
          );
        }
        return (
          <a
            href={wikiRoute(r) ? `#${wikiRoute(r)}` : href}
            title={r.kind === "file" ? r.id.slice(FILE_ENTITY_PREFIX.length) : r.title ? `${r.title} · ${r.id}` : r.id}
            className="rounded-sm px-0.5 underline decoration-foreground/40 underline-offset-2 hover:bg-accent hover:decoration-foreground"
            onClick={(e: MouseEvent) => {
              if (e.metaKey || e.ctrlKey) return;
              e.preventDefault();
              goTo(r);
            }}
          >
            {/* `[[n-1F4W]]` without an alias reads better as the note's title. */}
            {r.title && (Array.isArray(kids) ? kids.join("") : String(kids)) === target ? r.title : kids}
          </a>
        );
      },
      img: SafeImage,
      input: ({ type, checked, node: _node }) => {
        if (type !== "checkbox") return null;
        return (
          <span
            role="checkbox"
            aria-checked={!!checked}
            data-task-checkbox=""
            tabIndex={onToggleTask ? 0 : -1}
            className={cn(
              "mt-[3px] inline-grid size-4 shrink-0 place-items-center rounded-[5px] border-[1.5px] transition-colors",
              checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/45",
              onToggleTask && "cursor-pointer hover:border-primary",
            )}
          >
            {checked && <CheckIcon className="size-3" strokeWidth={3} />}
          </span>
        );
      },
      li: ({ node, className: liCls, children: kids, ...rest }: ComponentProps<"li"> & { node?: { position?: { start: { line: number } } } }) => {
        const line = node?.position?.start.line;
        const isTask = typeof liCls === "string" && liCls.includes("task-list-item");
        return (
          <li
            className={liCls}
            {...rest}
            onClick={
              isTask && onToggleTask && line
                ? (e) => {
                    if ((e.target as HTMLElement).closest("[data-task-checkbox]")) onToggleTask(line - 1);
                  }
                : undefined
            }
            onKeyDown={
              isTask && onToggleTask && line
                ? (e) => {
                    if ((e.key === " " || e.key === "Enter") && (e.target as HTMLElement).closest("[data-task-checkbox]")) {
                      e.preventDefault();
                      onToggleTask(line - 1);
                    }
                  }
                : undefined
            }
          >
            {kids}
          </li>
        );
      },
    }),
    [entities, onToggleTask],
  );

  return (
    <div className={cn(PROSE, className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkWikilinks, remarkEntityIds]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
});
