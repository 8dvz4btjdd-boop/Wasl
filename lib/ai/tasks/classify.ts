import "server-only";
import { z } from "zod";
import type { AITask } from "@/lib/ai/task";

// Stub: the shape is fixed so the classify task drops in later as one file. Not registered yet.
export type ClassifyInput = Record<string, never>;
export const ClassifySchema = z.object({});
export type ClassifyOutput = z.infer<typeof ClassifySchema>;

export const classifyTask: AITask<ClassifyInput, ClassifyOutput> | null = null;
