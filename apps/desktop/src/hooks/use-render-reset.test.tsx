import { useState } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useRenderReset } from "./use-render-reset";

function Form({ open, initial }: { open: boolean; initial: string }) {
  const [title, setTitle] = useState("stale");
  useRenderReset([open, initial], () => {
    if (open) setTitle(initial);
  });
  return <span>{title}</span>;
}

describe("useRenderReset", () => {
  it("runs on the first render, like the effect it replaces", () => {
    expect(renderToString(<Form open initial="fresh" />)).toContain("fresh");
  });

  it("leaves state alone when the reset is a no-op", () => {
    expect(renderToString(<Form open={false} initial="fresh" />)).toContain("stale");
  });
});
