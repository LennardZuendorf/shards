/**
 * The nav lists the shell actually renders from (kept out of the .tsx modules so a test can
 * assert them; those files may only export components). One order, from `ui-contract.ts`.
 */
import { shellRoutes } from "@/lib/nav";
import type { RouteName } from "@/lib/router";
import { NAV_SECTIONS } from "@/lib/ui-contract";

/** `g` chord order (AppShell). `/` binds Search, so it is left out. */
export const GO_ROUTES: RouteName[] = shellRoutes().filter((n) => n !== "search");

/** Command palette "Go to" order. */
export const PALETTE_ROUTES: RouteName[] = shellRoutes();

/** Sidebar: search on top, the sections in order, settings in the footer. */
export const SIDEBAR_TOP: RouteName[] = ["search"];
export const SIDEBAR_SECTIONS = NAV_SECTIONS;
export const SIDEBAR_FOOTER: RouteName[] = ["settings"];
