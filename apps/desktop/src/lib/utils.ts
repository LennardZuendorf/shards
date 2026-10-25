import { createCn } from "cn/config";

// The merger must know the custom `--text-*` size tokens, or it reads `text-micro` as a colour
// and drops it whenever the same call also sets a text colour.
export const cn = createCn({
  extend: { classGroups: { "font-size": [{ text: ["micro", "small", "body", "heading", "title", "display", "avatar"] }] } },
});
