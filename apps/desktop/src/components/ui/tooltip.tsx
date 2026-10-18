"use client"

// Stock shadcn (radix-nova) look and API over the animate-ui tooltip primitive (desktop-app/35):
// an opacity + scale entrance at design.md `motion.durations.fast`; tw-animate classes dropped.
import * as React from "react"
import { cn } from "cn"
import { Tooltip as TooltipPrimitive } from "radix-ui"

import {
  Tooltip as TooltipRoot,
  TooltipContent as TooltipContentPrimitive,
  TooltipPortal as TooltipPortalPrimitive,
  TooltipProvider as TooltipProviderPrimitive,
  TooltipTrigger as TooltipTriggerPrimitive,
  type TooltipContentProps as TooltipContentPrimitiveProps,
} from "@/components/animate-ui/primitives/radix/tooltip"
import { TRANSITION_FAST } from "@/components/animate-ui/motion-tokens"

function TooltipProvider({ delayDuration = 0, ...props }: React.ComponentProps<typeof TooltipProviderPrimitive>) {
  return <TooltipProviderPrimitive delayDuration={delayDuration} {...props} />
}

function Tooltip(props: React.ComponentProps<typeof TooltipRoot>) {
  return <TooltipRoot {...props} />
}

function TooltipTrigger(props: React.ComponentProps<typeof TooltipTriggerPrimitive>) {
  return <TooltipTriggerPrimitive {...props} />
}

function TooltipContent({
  className,
  sideOffset = 0,
  transition = TRANSITION_FAST,
  children,
  ...props
}: TooltipContentPrimitiveProps) {
  return (
    <TooltipPortalPrimitive>
      <TooltipContentPrimitive
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 inline-flex w-fit max-w-xs origin-(--radix-tooltip-content-transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pr-1.5 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm",
          className
        )}
        transition={transition}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" />
      </TooltipContentPrimitive>
    </TooltipPortalPrimitive>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
