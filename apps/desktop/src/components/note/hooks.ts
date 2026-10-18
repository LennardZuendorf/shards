/** Note data hooks for the read-only notes browser. */
import { useQuery } from "@tanstack/react-query";
import { search } from "@/lib/api";
import { qk } from "@/lib/query";

/** Body-text search over the notes space (for the list filter). */
export function useNoteSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: qk.search({ query: q, spaces: ["notes"] }),
    queryFn: () => search({ query: q, spaces: ["notes"], limit: 50 }),
    enabled: q.length >= 2,
    placeholderData: (prev) => prev,
  });
}
