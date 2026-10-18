import type { AnchorHTMLAttributes } from "react";
import { href } from "@/lib/router";

/** Anchor for the hash router (keeps ⌘-click / middle-click native): `<Link to={paths.today()}>`. */
export function Link({ to, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a href={href(to)} {...rest} />;
}
