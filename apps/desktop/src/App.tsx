import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "@/lib/query";
import { AppShell } from "@/app/AppShell";
import { ThemeSync } from "@/app/theme";

export default function App() {
  return (
    <>
      <ThemeSync />
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={400}>
          <AppShell />
          <Toaster position="bottom-left" closeButton={false} visibleToasts={4} offset={16} />
        </TooltipProvider>
      </QueryClientProvider>
    </>
  );
}
