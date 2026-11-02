export type VaultConnection = "connecting" | "live" | "offline";

/** A healthy stream pushes invalidations already, so only degraded mode refetches on focus. */
export function shouldRefetchOnFocus(connection: VaultConnection): boolean {
  return connection !== "live";
}
