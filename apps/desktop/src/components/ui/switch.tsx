// Stock shadcn (radix-nova) look and API over the animate-ui switch primitive (desktop-app/35):
// the thumb moves by a Motion layout animation at `motion.durations.fast` (reduced by the root
// MotionConfig), so the CSS transform transition is dropped.
import * as React from "react"
import { cn } from "cn"

import {
  Switch as SwitchRoot,
  SwitchThumb as SwitchThumbPrimitive,
} from "@/components/animate-ui/primitives/radix/switch"
import { TRANSITION_FAST } from "@/components/animate-ui/motion-tokens"

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchRoot> & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchRoot
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full border border-transparent transition-colors outline-none group-has-[:focus-visible]/field-label:border-transparent group-has-[:focus-visible]/field-label:ring-0 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=default]:h-[18.4px] data-[size=default]:w-[32px] data-[size=sm]:h-[14px] data-[size=sm]:w-[24px] dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:bg-primary data-unchecked:bg-input dark:data-unchecked:bg-input/80 data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchThumbPrimitive
        transition={TRANSITION_FAST}
        className="pointer-events-none block rounded-full bg-background ring-0 group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 group-data-[size=default]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=sm]/switch:data-checked:translate-x-[calc(100%-2px)] dark:data-checked:bg-primary-foreground group-data-[size=default]/switch:data-unchecked:translate-x-0 group-data-[size=sm]/switch:data-unchecked:translate-x-0 dark:data-unchecked:bg-foreground"
      />
    </SwitchRoot>
  )
}

export { Switch }
