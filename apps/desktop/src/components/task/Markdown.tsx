/** Markdown renderer for task descriptions and comments (GFM, no raw HTML). */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { EntityIdLink } from "@/components/shared/EntityIdLink";
import { SafeImage, SafeLink } from "@/components/shared/safe-markdown";
import { idTargetFromHref, remarkEntityIds } from "@/components/note/wikilinks";
import { cn } from "@/lib/utils";

const MD =
  "text-[13.5px] leading-[1.6] text-foreground/90 break-words " +
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 " +
  "[&_p]:my-2 [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:mb-1.5 [&_h2]:text-[14.5px] [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-[13.5px] [&_h3]:font-semibold " +
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_li>p]:my-0 " +
  "[&_li:has(>input)]:-ml-5 [&_li:has(>input)]:list-none [&_input]:mr-1.5 [&_input]:align-[-2px] [&_input]:accent-primary " +
  "[&_a]:text-foreground [&_a]:underline [&_a]:decoration-foreground/40 [&_a]:underline-offset-2 hover:[&_a]:decoration-foreground [&_img]:max-w-full [&_img]:rounded-lg " +
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-[12px] " +
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 " +
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground " +
  "[&_hr]:my-4 [&_table]:my-2 [&_table]:w-full [&_table]:text-xs [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:px-2 [&_td]:py-1";

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn(MD, className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkEntityIds]}
        components={{
          a: ({ node: _node, ...props }) => {
            const bare = idTargetFromHref(props.href);
            if (bare) return <EntityIdLink id={bare}>{props.children}</EntityIdLink>;
            return <SafeLink {...props} onClick={(e) => e.stopPropagation()} />;
          },
          img: SafeImage,
        }}
      >
        {children.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a: string, b?: string) => `**${b ?? a}**`)}
      </ReactMarkdown>
    </div>
  );
}
