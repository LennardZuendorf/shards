"use client"

// Stock shadcn (radix-nova) look and API over the animate-ui dialog primitive (desktop-app/35).
// Motion comes from the primitive; the tw-animate enter/exit classes are dropped so CSS and
// Motion never animate the same layer.
import * as React from "react"
import { cn } from "@/lib/utils"
import { XIcon } from "lucide-react"

import {
  Dialog as DialogRoot,
  DialogClose as DialogClosePrimitive,
  DialogContent as DialogContentPrimitive,
  DialogDescription as DialogDescriptionPrimitive,
  DialogOverlay as DialogOverlayPrimitive,
  DialogPortal as DialogPortalPrimitive,
  DialogTitle as DialogTitlePrimitive,
  DialogTrigger as DialogTriggerPrimitive,
  type DialogContentProps as DialogContentPrimitiveProps,
  type DialogOverlayProps as DialogOverlayPrimitiveProps,
} from "@/components/animate-ui/primitives/radix/dialog"
import { TRANSITION_BASE } from "@/components/animate-ui/motion-tokens"
import { Button } from "@/components/ui/button"

function Dialog(props: React.ComponentProps<typeof DialogRoot>) {
  return <DialogRoot {...props} />
}

function DialogTrigger(props: React.ComponentProps<typeof DialogTriggerPrimitive>) {
  return <DialogTriggerPrimitive {...props} />
}

function DialogPortal(props: React.ComponentProps<typeof DialogPortalPrimitive>) {
  return <DialogPortalPrimitive {...props} />
}

function DialogClose(props: React.ComponentProps<typeof DialogClosePrimitive>) {
  return <DialogClosePrimitive {...props} />
}

function DialogOverlay({ className, transition = TRANSITION_BASE, ...props }: DialogOverlayPrimitiveProps) {
  return (
    <DialogOverlayPrimitive
      className={cn(
        "fixed inset-0 isolate z-50 bg-(--scrim) supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      transition={transition}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  transition = TRANSITION_BASE,
  ...props
}: DialogContentPrimitiveProps & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogContentPrimitive
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 outline-none sm:max-w-sm",
          className
        )}
        transition={transition}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogClosePrimitive data-slot="dialog-close" asChild>
            <Button variant="ghost" className="absolute top-2 right-2" size="icon-sm">
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </DialogClosePrimitive>
        )}
      </DialogContentPrimitive>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("flex flex-col gap-2", className)} {...props} />
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogClosePrimitive asChild>
          <Button variant="outline">Close</Button>
        </DialogClosePrimitive>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogTitlePrimitive>) {
  return (
    <DialogTitlePrimitive className={cn("font-heading text-base leading-none font-medium", className)} {...props} />
  )
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogDescriptionPrimitive>) {
  return (
    <DialogDescriptionPrimitive
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
