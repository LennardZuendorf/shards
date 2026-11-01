import claude from "@/assets/agents/claude-code.webp";
import flights from "@/assets/agents/flights-agent.webp";
import ops from "@/assets/agents/ops-agent.webp";
import { hashString } from "./color";

const ART: Readonly<Record<string, string>> = { "claude-code": claude, "flights-agent": flights, "ops-agent": ops };
const SHAPES = ["diamond", "square", "ring", "triangle"] as const;
export function agentArt(id: string): string | null { return Object.hasOwn(ART, id) ? ART[id] : null; }
export function projectShape(id: string) { return SHAPES[hashString(id) % SHAPES.length]; }
