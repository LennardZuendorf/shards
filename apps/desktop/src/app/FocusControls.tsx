import { MaximizeIcon, MinimizeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/shared/Kbd";
import { focusModeStore } from "./focus-mode";

export function FocusToggle() {
  const active = focusModeStore.use();
  const eligible = focusModeStore.useEligible();
  if (!eligible) return null;
  const Icon = active ? MinimizeIcon : MaximizeIcon;
  return <Button variant="ghost" size="sm" onPointerDown={event => event.preventDefault()} onClick={focusModeStore.toggle} aria-pressed={active} title={active ? "Exit Focus mode" : "Enter Focus mode"}>
    <Icon /><span className="sr-only sm:not-sr-only">{active ? "Quiet" : "Focus"}</span><Kbd keys={"mod+\\"} className="hidden lg:inline-flex" />
  </Button>;
}
