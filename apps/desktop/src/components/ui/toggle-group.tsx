// Stock shadcn (radix-nova) look and API over the animate-ui toggle-group primitive
// (desktop-app/35). A single-select group draws its "on" fill as the animate-ui Highlight pill,
// which slides between items at `motion.durations.base`; under reduced motion the pill fades
// in place (the highlight primitive drops `layoutId`). The item's own "on" fill is cleared so the
// pill is the only fill; its border and text still mark the state without motion.
import * as React from "react"
import { type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

import {
  ToggleGroup as ToggleGroupRoot,
  ToggleGroupHighlight,
  ToggleGroupHighlightItem,
  ToggleGroupItem as ToggleGroupItemPrimitive,
} from "@/components/animate-ui/primitives/radix/toggle-group"
import { TRANSITION_BASE } from "@/components/animate-ui/motion-tokens"
import { toggleVariants } from "@/components/ui/toggle"

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & {
    spacing?: number
    orientation?: "horizontal" | "vertical"
    single?: boolean
  }
>({
  size: "default",
  variant: "default",
  spacing: 2,
  orientation: "horizontal",
  single: false,
})

function ToggleGroup({
  className,
  variant,
  size,
  spacing = 2,
  orientation = "horizontal",
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupRoot> &
  VariantProps<typeof toggleVariants> & {
    spacing?: number
    orientation?: "horizontal" | "vertical"
  }) {
  const single = props.type === "single"
  return (
    <ToggleGroupRoot
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      data-orientation={orientation}
      style={{ "--gap": spacing } as React.CSSProperties}
      className={cn(
        "group/toggle-group flex w-fit flex-row items-center gap-[--spacing(var(--gap))] rounded-lg data-[size=sm]:rounded-md data-vertical:flex-col data-vertical:items-stretch",
        className
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size, spacing, orientation, single }}>
        {single ? (
          <ToggleGroupHighlight
            transition={TRANSITION_BASE}
            className={cn(
              "rounded-lg",
              size === "sm" && "rounded-md",
              variant === "outline" ? "bg-accent" : "bg-muted"
            )}
          >
            {children}
          </ToggleGroupHighlight>
        ) : (
          children
        )}
      </ToggleGroupContext.Provider>
    </ToggleGroupRoot>
  )
}

function ToggleGroupItem({
  className,
  children,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof ToggleGroupItemPrimitive> & VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext)

  const item = (
    <ToggleGroupItemPrimitive
      data-variant={context.variant || variant}
      data-size={context.size || size}
      data-spacing={context.spacing}
      className={cn(
        "shrink-0 group-data-[spacing=0]/toggle-group:rounded-none group-data-[spacing=0]/toggle-group:px-2 focus:z-10 focus-visible:z-10 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-end]:pr-1.5 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-start]:pl-1.5 group-data-horizontal/toggle-group:data-[spacing=0]:first:rounded-l-lg group-data-vertical/toggle-group:data-[spacing=0]:first:rounded-t-lg group-data-horizontal/toggle-group:data-[spacing=0]:last:rounded-r-lg group-data-vertical/toggle-group:data-[spacing=0]:last:rounded-b-lg group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:border-l-0 group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:border-t-0 group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-l group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-t",
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        context.single && "data-[state=on]:bg-transparent! dark:data-[state=on]:bg-transparent!",
        className
      )}
      {...props}
    >
      {children}
    </ToggleGroupItemPrimitive>
  )

  if (!context.single) return item
  return <ToggleGroupHighlightItem value={props.value}>{item}</ToggleGroupHighlightItem>
}

export { ToggleGroup, ToggleGroupItem }
