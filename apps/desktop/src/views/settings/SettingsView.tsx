/** Settings: vault & host info, identity, members, appearance, keyboard reference, about. */
import {
  BotIcon,
  BrainIcon,
  CheckIcon,
  CopyIcon,
  FileTextIcon,
  FolderIcon,
  InfoIcon,
  KeyboardIcon,
  ListChecksIcon,
  MonitorIcon,
  MoonIcon,
  NotebookPenIcon,
  PaletteIcon,
  PaperclipIcon,
  ServerIcon,
  SunIcon,
  UserIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { toast } from "sonner";
import { STONES } from "@/lib/appearance";
import { useTheme, type ThemeMode } from "@/app/theme";
import { collectMembers } from "@/components/agent/agent-utils";
import { useAllMemories } from "@/components/memory/hooks";
import { useScratchList } from "@/components/scratch/hooks";
import { Avatar } from "@/components/shared/Avatar";
import { Kbd } from "@/components/shared/Kbd";
import { ShardsLogo } from "@/components/shared/ShardsLogo";
import { Skeleton } from "@/components/ui/skeleton";
import { useHotkeyList } from "@/lib/hotkeys";
import { useHostStatus, useMe, useMembers, useNoteFiles, useNotes, useTasks } from "@/lib/hooks";
import { useConnection } from "@/lib/query";
import { runtime } from "@/lib/transport";
import type { SpaceName } from "@/lib/types";
import { cn } from "@/lib/utils";
import { availableTargets, pickDefault, setOpenPreference, useOpenPreference, type DefaultOpenTarget } from "@/lib/open";
import { PageHeader } from "@/components/shared/PageHeader";
import { PAGE_WIDTH } from "@/components/shared/page-width";

const SECTIONS: [string, string, LucideIcon][] = [
  ["vault", "Vault", FolderIcon],
  ["identity", "Identity", UserIcon],
  ["members", "Members", UsersIcon],
  ["appearance", "Appearance", PaletteIcon],
  ["keyboard", "Keyboard", KeyboardIcon],
  ["about", "About", InfoIcon],
];

const SPACE_META: Record<SpaceName, { label: string; icon: LucideIcon }> = {
  tasks: { label: "Tasks", icon: ListChecksIcon },
  notes: { label: "Notes", icon: FileTextIcon },
  memories: { label: "Memories", icon: BrainIcon },
  scratch: { label: "Scratch", icon: NotebookPenIcon },
  assets: { label: "Assets", icon: PaperclipIcon },
};

/** Shortcuts views register only while mounted; this reference lists them all. */
const REFERENCE: { group: string; items: [string, string][] }[] = [
  {
    group: "General",
    items: [
      ["mod+k", "Command menu"],
      ["q", "Add task"],
      ["/", "Search"],
      ["mod+z", "Undo last action"],
      ["mod+b|[", "Toggle sidebar"],
      ["shift+?", "All shortcuts"],
      ["escape", "Close detail / go back"],
    ],
  },
  {
    group: "Navigation",
    items: [
      ["g i", "Inbox"],
      ["g t", "Today"],
      ["g u", "Upcoming"],
      ["g a", "Agents"],
      ["g m", "Memories"],
      ["g s", "Scratchpads"],
      ["g n", "Notes"],
      ["g ,", "Settings"],
    ],
  },
  {
    group: "Tasks",
    items: [
      ["j|k", "Next / previous task"],
      ["enter", "Open details"],
      ["e|x", "Complete"],
      ["1|2|3|4", "Set priority"],
      ["t", "Due today"],
      ["shift+t", "Due tomorrow"],
      ["r", "Rename"],
      ["mod+backspace", "Delete (with undo)"],
    ],
  },
  {
    group: "Memories",
    items: [
      ["j|k", "Next / previous"],
      ["n", "New memory"],
      ["f", "Filter"],
      ["r", "Recall playground"],
      ["e", "Edit details"],
      ["shift+s", "Supersede"],
      ["mod+backspace", "Forget"],
    ],
  },
  {
    group: "Scratchpads",
    items: [
      ["j|k", "Next / previous"],
      ["n", "New scratchpad"],
      ["e", "Edit"],
      ["v", "Rendered / raw"],
      ["a", "Leave a note"],
    ],
  },
  {
    group: "Notes",
    items: [
      ["j|k", "Next / previous"],
      ["f", "Filter notes"],
      ["mod+shift+o", "Open in Obsidian / default app"],
    ],
  },
];

/** R41: the default "Open in" target. Obsidian is offered only for an Obsidian vault. */
function OpenInChoice({ obsidianVault }: { obsidianVault: string | null }) {
  const pref = useOpenPreference();
  const desktop = runtime() === "tauri";
  const effective = pickDefault(availableTargets({ obsidian: !!obsidianVault, desktop }), pref);
  const options: [DefaultOpenTarget, string, boolean][] = [
    ["obsidian", "Obsidian", !!obsidianVault],
    ["default", "Default app", desktop],
  ];
  return (
    <span className="flex flex-wrap items-center gap-2 font-sans">
      <span className="inline-flex rounded-lg border p-0.5">
        {options.map(([t, label, enabled]) => (
          <button
            key={t}
            type="button"
            disabled={!enabled}
            aria-pressed={effective === t}
            onClick={() => setOpenPreference(t)}
            className={cn(
              "rounded-md px-2.5 py-1 text-[12.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              effective === t ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {label}
          </button>
        ))}
      </span>
      <span className="text-xs text-muted-foreground">
        {obsidianVault ? `Obsidian vault: ${obsidianVault}` : "No .obsidian folder in or above the vault"}
        {!desktop && " · the default app needs the desktop app"}
      </span>
    </span>
  );
}

function copy(text: string) {
  void navigator.clipboard?.writeText(text).then(() => toast.success("Copied"));
}

function Section({ id, title, icon: Icon, description, children }: { id: string; title: string; icon: LucideIcon; description?: string; children: ReactNode }) {
  return (
    <section id={`settings-${id}`} className="scroll-mt-6">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      </div>
      {description && <p className="-mt-2 mb-3 text-[13px] text-muted-foreground">{description}</p>}
      <div className="@container overflow-hidden rounded-xl border bg-card">{children}</div>
    </section>
  );
}

function Row({ label, children, mono, copyValue }: { label: string; children: ReactNode; mono?: boolean; copyValue?: string | null }) {
  return (
    <div className="flex min-h-11 items-center gap-3 border-b px-4 py-2 last:border-b-0 @lg:gap-4">
      <div className="w-24 shrink-0 text-[13px] text-muted-foreground @lg:w-36">{label}</div>
      {/* Paths truncate (full value in the tooltip and the copy button); prose wraps. */}
      <div
        className={cn("min-w-0 flex-1 text-[13px]", mono ? "truncate font-mono text-[12.5px]" : "break-words")}
        title={typeof children === "string" ? children : (copyValue ?? undefined)}
      >
        {children}
      </div>
      {copyValue && (
        <button type="button" aria-label={`Copy ${label}`} onClick={() => copy(copyValue)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <CopyIcon className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function SettingsView() {
  const status = useHostStatus();
  const me = useMe();
  const conn = useConnection();
  const members = useMembers();
  const open = useTasks();
  const notes = useNotes();
  // The notes tile counts every Markdown file the notes browser lists, not only Shards notes.
  const noteFiles = useNoteFiles();
  const memories = useAllMemories();
  const scratch = useScratchList();
  const { theme, setTheme, stone, setStone } = useTheme();
  const registered = useHotkeyList();
  const s = status.data;

  const allMembers = useMemo(
    () => collectMembers({ members: members.data ?? [], me, open: open.data ?? [], done: [], memories: memories.data, scratch: scratch.data }),
    [members.data, me, open.data, memories.data, scratch.data],
  );

  // Without host_status, derive what we can from the lists.
  const counts: Partial<Record<SpaceName, number | undefined>> = {
    ...(s?.counts ?? {
      tasks: open.data?.length,
      notes: notes.data?.length,
      memories: memories.data?.length,
      scratch: scratch.data?.length,
    }),
    ...(noteFiles.data ? { notes: noteFiles.data.length } : {}),
  };

  const extra = registered.filter((h) => !REFERENCE.some((g) => g.items.some(([k]) => k.split("|").includes(h.keys))));

  return (
    <div className={PAGE_WIDTH.wide}>
    <PageHeader title="Settings" subtitle={<span>Vault, identity, members, appearance and shortcuts</span>} />
    <div className="flex w-full gap-10">
      <nav aria-label="Settings sections" className="sticky top-8 hidden h-fit w-40 shrink-0 space-y-0.5 min-[1200px]:block">
        {SECTIONS.map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Icon className="size-3.5" /> {label}
          </button>
        ))}
      </nav>

      <div className="min-w-0 flex-1 space-y-10">
        <Section id="vault" title="Vault" icon={FolderIcon} description="Shards reads and writes this Markdown folder. Nothing else is the source of truth.">
          {status.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : (
            <>
              <Row label="Vault folder" mono copyValue={s?.vault}>
                {s?.vault ?? <span className="font-sans text-muted-foreground">Not reported by this host</span>}
              </Row>
              <Row label="Config file" mono copyValue={s?.config_path}>
                {s?.config_path ?? <span className="font-sans text-muted-foreground">{s ? "Defaults (no file)" : "Not reported by this host"}</span>}
              </Row>
              <Row label="Runtime">
                <span className="inline-flex items-center gap-2">
                  {runtime() === "tauri" ? <MonitorIcon className="size-3.5" /> : <ServerIcon className="size-3.5" />}
                  {runtime() === "tauri" ? "Desktop app (Tauri)" : "Browser · shards-host over HTTP"}
                </span>
              </Row>
              <Row label="Live updates">
                <span className="inline-flex items-center gap-2">
                  <span className={cn("size-2 rounded-full", conn === "live" ? "bg-success" : conn === "connecting" ? "bg-warning" : "bg-destructive")} />
                  {conn === "live" ? "Connected — changes from agents appear instantly" : conn === "connecting" ? "Connecting…" : "Offline"}
                </span>
              </Row>
              <Row label="Open Markdown in">
                <OpenInChoice obsidianVault={s?.obsidian_vault ?? null} />
              </Row>
              <Row label="Version">{s?.version ? `shards ${s.version}` : <span className="text-muted-foreground">Unknown (host_status not available)</span>}</Row>
            </>
          )}
          <div className="grid grid-cols-2 gap-px border-t bg-border @md:grid-cols-3 @3xl:grid-cols-5">
            {(Object.keys(SPACE_META) as SpaceName[]).map((sp) => {
              const M = SPACE_META[sp];
              const root = s?.spaces?.[sp];
              const disabled = s ? root === null : false;
              return (
                <div key={sp} className="min-w-0 bg-card px-4 py-3 last:col-span-2 @3xl:last:col-span-1" title={root ?? undefined}>
                  <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <M.icon className="size-3.5 shrink-0" /> <span className="truncate">{M.label}</span>
                  </div>
                  <div className={cn("mt-1 text-lg font-semibold tabular-nums", disabled && "text-muted-foreground")}>{disabled ? "Off" : (counts[sp] ?? "–")}</div>
                  {root && <div className="truncate font-mono text-xs text-muted-foreground">{root.split("/").slice(-2).join("/")}</div>}
                </div>
              );
            })}
          </div>
        </Section>

        <Section id="identity" title="Identity" icon={UserIcon} description="Who you act as. Set by [core].me in the config; agents use SHARDS_AGENT.">
          <div className="flex items-center gap-3 px-4 py-4">
            <Avatar
              id={me ?? "you"}
              kind="human"
              name={allMembers.find((m) => m.id === me)?.name ?? me ?? "You"}
              color={allMembers.find((m) => m.id === me)?.color}
              size="lg"
            />
            <div>
              <div className="text-[14px] font-semibold">{allMembers.find((m) => m.id === me)?.name ?? me ?? "Unknown"}</div>
              <div className="text-xs text-muted-foreground">
                {me ? (
                  <>
                    <span className="font-mono">{me}</span> · human · writes you make use this id as the acting identity
                  </>
                ) : (
                  "This host does not report an identity yet (host_status). Writes use the vault’s configured default."
                )}
              </div>
            </div>
          </div>
        </Section>

        <Section id="members" title="Members" icon={UsersIcon} description="Humans and agents seen in this vault. Configure names and kinds with [[members]] in the config.">
          {members.isLoading ? (
            <div className="p-4">
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : allMembers.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-muted-foreground">Nobody yet.</p>
          ) : (
            <ul>
              {allMembers.map((m) => (
                <li key={m.id} className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0">
                  <Avatar id={m.id} kind={m.kind} name={m.name} color={m.color} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">
                      {m.name}
                      {m.id === me && <span className="ml-2 rounded-md bg-secondary px-1.5 text-xs font-semibold text-muted-foreground">You</span>}
                    </div>
                    {m.name !== m.id && <div className="truncate font-mono text-xs text-muted-foreground">{m.id}</div>}
                  </div>
                  <span
                    className={cn(
                      "inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-xs font-medium",
                      m.kind === "agent" ? "bg-identity-agent/12 text-identity-agent" : "bg-identity-human/12 text-identity-human",
                    )}
                  >
                    {m.kind === "agent" ? <BotIcon className="size-3" /> : <UserIcon className="size-3" />}
                    {m.kind}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="appearance" title="Appearance" icon={PaletteIcon}>
          <div className="flex flex-wrap gap-2 px-4 pt-4" role="group" aria-label="Stone theme">
            {STONES.map(value => <button key={value} type="button" aria-pressed={stone === value} onClick={() => setStone(value)} className={cn("rounded-[10px] border border-input px-3 py-1.5 text-sm capitalize outline-none focus-visible:ring-2 focus-visible:ring-ring", stone === value ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent")}>
              {value}
            </button>)}
          </div>
          <div className="grid grid-cols-3 gap-3 p-4">
            {(
              [
                ["system", "System", MonitorIcon],
                ["light", "Light", SunIcon],
                ["dark", "Dark", MoonIcon],
              ] as [ThemeMode, string, LucideIcon][]
            ).map(([mode, label, Icon]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setTheme(mode)}
                aria-pressed={theme === mode}
                className={cn(
                  "group relative overflow-hidden rounded-xl border text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring",
                  theme === mode ? "border-ring ring-1 ring-ring" : "hover:border-foreground/20",
                )}
              >
                <ThemePreview mode={mode} />
                <div className="flex items-center gap-2 border-t px-3 py-2 text-[13px]">
                  <Icon className="size-3.5 text-muted-foreground" /> {label}
                  {theme === mode && <CheckIcon className="ml-auto size-3.5 text-foreground" />}
                </div>
              </button>
            ))}
          </div>
        </Section>

        <Section id="keyboard" title="Keyboard" icon={KeyboardIcon} description="Shards is built to be driven from the keyboard. Press ? anywhere for the shortcuts of the current view.">
          <div className="grid gap-x-8 gap-y-5 p-4 sm:grid-cols-2">
            {[...REFERENCE, ...(extra.length ? [{ group: "This view", items: extra.map((h) => [h.keys, h.description ?? ""] as [string, string]) }] : [])].map((g) => (
              <div key={g.group}>
                <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g.group}</h3>
                <ul className="space-y-1">
                  {g.items.map(([k, d]) => (
                    <li key={`${g.group}-${k}`} className="flex items-center justify-between gap-3 text-[13px]">
                      <span className="text-foreground/90">{d}</span>
                      {/* "a|b" lists alternative keys. */}
                      <span className="flex shrink-0 items-center gap-1">
                        {k.split("|").map((alt, i) => (
                          <span key={alt} className="flex items-center gap-1">
                            {i > 0 && <span className="text-xs text-muted-foreground">/</span>}
                            <Kbd keys={alt} />
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <Section id="about" title="About" icon={InfoIcon}>
          <div className="flex items-center gap-4 px-4 py-5">
            <ShardsLogo className="size-12" />
            <div>
              <div className="text-[15px] font-semibold tracking-tight">Shards{s?.version ? ` ${s.version}` : ""}</div>
              <div className="text-[13px] text-muted-foreground">The multiplayer task manager for humans and agents — backed by Markdown you own.</div>
              <div className="mt-1 text-xs text-muted-foreground">Local-first · MIT core · your vault, your files.</div>
            </div>
          </div>
        </Section>
      </div>
    </div>
    </div>
  );
}

/** Mini mock of the app in each palette (fixed colors, independent of the active theme). */
function ThemePreview({ mode }: { mode: ThemeMode }) {
  const half = (dark: boolean) => (
    <div className={cn("flex h-full flex-1 gap-1.5 bg-background p-2", dark && "dark")}>
      <div className="w-1/4 space-y-1 rounded-sm bg-sidebar p-1">
        <div className="h-1.5 w-3/4 rounded-full bg-primary" />
        <div className="h-1 w-full rounded-full bg-foreground/15" />
        <div className="h-1 w-2/3 rounded-full bg-foreground/15" />
      </div>
      <div className="flex-1 space-y-1.5 pt-0.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-1">
            <span className={cn("size-1.5 rounded-full border", i === 0 ? "border-priority-urgent" : "border-foreground/30")} />
            <span className={cn("h-1 rounded-full bg-foreground/20", ["w-[70%]", "w-[55%]", "w-[40%]"][i])} />
          </div>
        ))}
      </div>
    </div>
  );
  return <div className="flex h-20">{mode === "system" ? (
        <>
          {half(false)}
          {half(true)}
        </>
      ) : (
        half(mode === "dark")
      )}</div>;
}
