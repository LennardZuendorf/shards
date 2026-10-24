"use client"

// Stock shadcn (radix-nova) look and API over the animate-ui sheet primitive (desktop-app/35).
// The primitive slides the panel (design.md `motion.durations.slow`) and positions it; the
// tw-animate slide classes and the CSS transform transition are dropped so they never fight it.
import * as React from "react"
import { cn } from "cn"
import { XIcon } from "lucide-react"

import {
  Sheet as SheetRoot,
  SheetClose as SheetClosePrimitive,
  SheetContent as SheetContentPrimitive,
  SheetDescription as SheetDescriptionPrimitive,
  SheetOverlay as SheetOverlayPrimitive,
  SheetPortal as SheetPortalPrimitive,
  SheetTitle as SheetTitlePrimitive,
  SheetTrigger as SheetTriggerPrimitive,
  type SheetContentProps as SheetContentPrimitiveProps,
  type SheetOverlayProps as SheetOverlayPrimitiveProps,
} from "@/components/animate-ui/primitives/radix/sheet"
import { TRANSITION_BASE, TRANSITION_SLOW } from "@/components/animate-ui/motion-tokens"
import { Button } from "@/components/ui/button"

function Sheet(props: React.ComponentProps<typeof SheetRoot>) {
  return <SheetRoot {...props} />
}

function SheetTrigger(props: React.ComponentProps<typeof SheetTriggerPrimitive>) {
  return <SheetTriggerPrimitive {...props} />
}

function SheetClose(props: React.ComponentProps<typeof SheetClosePrimitive>) {
  return <SheetClosePrimitive {...props} />
}

function SheetOverlay({ className, transition = TRANSITION_BASE, ...props }: SheetOverlayPrimitiveProps) {
  return (
    <SheetOverlayPrimitive
      className={cn("fixed inset-0 z-50 bg-(--scrim) supports-backdrop-filter:backdrop-blur-xs", className)}
      transition={transition}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  transition = TRANSITION_SLOW,
  ...props
}: SheetContentPrimitiveProps & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  return (
    <SheetPortalPrimitive>
      <SheetOverlay />
      <SheetContentPrimitive
        side={side}
        className={cn(
          "z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-elevation-3 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=top]:h-auto data-[side=top]:border-b data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm",
          className
        )}
        transition={transition}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetClosePrimitive data-slot="sheet-close" asChild>
            <Button variant="ghost" className="absolute top-3 right-3" size="icon-sm">
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </SheetClosePrimitive>
        )}
      </SheetContentPrimitive>
    </SheetPortalPrimitive>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("flex flex-col gap-0.5 p-4", className)} {...props} />
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-footer" className={cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetTitlePrimitive>) {
  return (
    <SheetTitlePrimitive className={cn("font-heading text-base font-medium text-foreground", className)} {...props} />
  )
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetDescriptionPrimitive>) {
  return <SheetDescriptionPrimitive className={cn("text-sm text-muted-foreground", className)} {...props} />
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
