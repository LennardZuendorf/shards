/** Inline tag editor: chips with remove, a borderless input that adds on Enter/comma. */
import { PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function TagChip({ name, onRemove, className }: { name: string; onRemove?: () => void; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 max-w-44 items-center gap-1 rounded-md bg-secondary px-1.5 text-micro font-medium text-muted-foreground",
        className,
      )}
    >
      <span className="truncate">#{name}</span>
      {onRemove && (
        <button type="button" aria-label={`Remove ${name}`} className="-mr-0.5 rounded-sm opacity-60 hover:opacity-100" onClick={onRemove}>
          <XIcon className="size-3" />
        </button>
      )}
    </span>
  );
}

const norm = (s: string) => s.trim().replace(/^#/, "").replace(/\s+/g, "-").toLowerCase();

export function TagEditor({
  value,
  onChange,
  placeholder = "Add tag",
  suggestions = [],
  disabled,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const add = (raw: string) => {
    const tags = raw.split(",").map(norm).filter(Boolean);
    const next = [...value];
    for (const t of tags) if (!next.includes(t)) next.push(t);
    if (next.length !== value.length) onChange(next);
    setDraft("");
  };
  const listId = `tags-${suggestions.length}`;
  return (
    <div className="flex min-h-7 flex-wrap items-center gap-1">
      {value.map((t) => (
        <TagChip key={t} name={t} onRemove={disabled ? undefined : () => onChange(value.filter((x) => x !== t))} />
      ))}
      {!disabled &&
        (editing ? (
          <>
            <input
              autoFocus
              list={suggestions.length ? listId : undefined}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                if (draft.trim()) add(draft);
                setEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  add(draft);
                } else if (e.key === "Escape") {
                  e.stopPropagation();
                  setDraft("");
                  setEditing(false);
                } else if (e.key === "Backspace" && !draft && value.length) {
                  onChange(value.slice(0, -1));
                }
              }}
              placeholder={placeholder}
              className="h-6 w-28 rounded-md border border-input bg-transparent px-1.5 text-xs outline-none focus:border-ring"
            />
            {suggestions.length > 0 && (
              <datalist id={listId}>
                {suggestions.filter((s) => !value.includes(s)).slice(0, 50).map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex h-5 items-center gap-0.5 rounded-md px-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <PlusIcon className="size-3" />
            {value.length ? "" : placeholder}
          </button>
        ))}
    </div>
  );
}
