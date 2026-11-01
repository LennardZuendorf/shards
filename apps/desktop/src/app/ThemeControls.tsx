import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { startThemeSync, useThemeCycle } from "./theme";

export function ThemeSync() {
  useEffect(startThemeSync, []);
  return null;
}

export function ThemeToggle() {
  const { mode: m, next, cycle } = useThemeCycle();
  const Icon = m === "system" ? MonitorIcon : m === "light" ? SunIcon : MoonIcon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" onClick={cycle} aria-label={`Theme: ${m}. Switch to ${next}`}>
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        Theme: {m} <span className="opacity-60">→ {next}</span>
      </TooltipContent>
    </Tooltip>
  );
}
