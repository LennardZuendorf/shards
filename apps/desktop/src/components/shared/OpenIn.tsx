/** "Open in" (R41): split button, menu items and the ⌘⇧O shortcut for one vault file. */
import { ChevronDownIcon, CopyIcon, ExternalLinkIcon, FolderOpenIcon, GemIcon } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { OpenTarget } from "@/lib/open";
import { cn } from "@/lib/utils";
import { copyPath, openLabel, openWith, useOpenTargets } from "./open-in";

const ICON: Record<OpenTarget, ComponentType<{ className?: string }>> = {
  obsidian: GemIcon,
  default: ExternalLinkIcon,
  reveal: FolderOpenIcon,
};

/** Split button: the main part opens the default target, the chevron lists every target. */
export function OpenInButton({ absPath, className, compact }: { absPath: string; className?: string; compact?: boolean }) {
  const { available, primary } = useOpenTargets();
  const PrimaryIcon = primary ? ICON[primary] : CopyIcon;
  return (
    <div className={cn("inline-flex items-center", className)} data-slot="button-group">
      <Button
        size="sm"
        variant="outline"
        className="rounded-r-none border-r-0"
        title={primary ? `${openLabel(primary)} (⌘⇧O)` : "Copy path"}
        onClick={() => (primary ? void openWith(absPath, primary) : copyPath(absPath))}
      >
        <PrimaryIcon className="size-3.5" />
        {!compact && (primary ? openLabel(primary) : "Copy path")}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="rounded-l-none px-1.5" aria-label="More open options">
            <ChevronDownIcon className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <OpenInItems absPath={absPath} available={available} Item={DropdownMenuItem} Sep={DropdownMenuSeparator} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

type ItemKit = ComponentType<{ onSelect?: (e: Event) => void; className?: string; children?: ReactNode }>;

function OpenInItems({ absPath, available, Item, Sep }: { absPath: string; available: OpenTarget[]; Item: ItemKit; Sep: ComponentType }) {
  return (
    <>
      {available.map((t) => {
        const Icon = ICON[t];
        return (
          <Item key={t} onSelect={() => void openWith(absPath, t)} className="gap-2">
            <Icon className="size-4" /> {openLabel(t)}
          </Item>
        );
      })}
      {available.length > 0 && <Sep />}
      <Item onSelect={() => copyPath(absPath)} className="gap-2">
        <CopyIcon className="size-4" /> Copy path
      </Item>
    </>
  );
}
