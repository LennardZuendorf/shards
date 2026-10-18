/**
 * Registers the task detail renderer (lazy) with the shell's detail pane. Import for its side
 * effect from anything that can open a task: `import "@/components/task/register"`.
 * Task views import it; the shell should too so `?open=task:…` deep links work on every route.
 */
import { lazy } from "react";
import { registerDetailRenderer } from "@/app/detail";

const TaskDetail = lazy(async () => ({ default: (await import("./TaskDetail")).TaskDetail }));

registerDetailRenderer("task", TaskDetail);
