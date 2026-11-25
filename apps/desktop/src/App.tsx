import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { startLocaleSync } from "@/lib/locale";
import { queryClient } from "@/lib/query";
import { AppShell } from "@/app/AppShell";
import { ThemeSync } from "@/app/ThemeControls";

/** R38: one listener for the locale overrides; date formatters read the store and subscribe themselves. */
function LocaleSync() {
  useEffect(startLocaleSync, []);
  return null;
}

export default function App() {
  return (
    <>
      <LocaleSync />
      <ThemeSync />
      {/* Motion honours the OS "Reduce motion" setting for transforms and layout (R37); the
          animate-ui files branch on useReducedMotion() for blur, 3D and shared-layout slides. */}
      <MotionConfig reducedMotion="user">
        <QueryClientProvider client={queryClient}>
          <TooltipProvider delayDuration={400}>
            <AppShell />
            <Toaster position="bottom-left" closeButton={false} visibleToasts={4} offset={16} />
          </TooltipProvider>
        </QueryClientProvider>
      </MotionConfig>
    </>
  );
}
