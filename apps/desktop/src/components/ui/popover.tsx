"use client"

import * as React from "react"
import { cn } from "cn"

// Stock shadcn (radix-nova) look and API over the animate-ui popover primitive (desktop-app/35):
// an opacity + scale entrance at design.md `motion.durations.base`; tw-animate classes dropped.
import {
  Popover as PopoverRoot,
  PopoverAnchor as PopoverAnchorPrimitive,
  PopoverContent as PopoverContentPrimitive,
  PopoverPortal as PopoverPortalPrimitive,
  PopoverTrigger as PopoverTriggerPrimitive,
  type PopoverContentProps as PopoverContentPrimitiveProps,
} from "@/components/animate-ui/primitives/radix/popover"
import { TRANSITION_BASE } from "@/components/animate-ui/motion-tokens"

function Popover(props: React.ComponentProps<typeof PopoverRoot>) {
  return <PopoverRoot {...props} />
}

function PopoverTrigger(props: React.ComponentProps<typeof PopoverTriggerPrimitive>) {
  return <PopoverTriggerPrimitive {...props} />
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  transition = TRANSITION_BASE,
  ...props
}: PopoverContentPrimitiveProps) {
  return (
    <PopoverPortalPrimitive>
      <PopoverContentPrimitive
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 flex w-72 origin-(--radix-popover-content-transform-origin) flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden",
          className
        )}
        transition={transition}
        {...props}
      />
    </PopoverPortalPrimitive>
  )
}

function PopoverAnchor(props: React.ComponentProps<typeof PopoverAnchorPrimitive>) {
  return <PopoverAnchorPrimitive {...props} />
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-0.5 text-sm", className)}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <div
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
}
