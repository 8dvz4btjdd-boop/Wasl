import "server-only";
import { z } from "zod";
import type { AITask } from "@/lib/ai/task";

// Stub: the shape is fixed so the assist task drops in later as one file. Not registered yet.
export type AssistInput = Record<string, never>;
export const AssistSchema = z.object({});
export type AssistOutput = z.infer<typeof AssistSchema>;

export const assistTask: AITask<AssistInput, AssistOutput> | null = null;
