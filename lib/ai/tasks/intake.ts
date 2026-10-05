import "server-only";
import { z } from "zod";
import type { AITask } from "@/lib/ai/task";

// Stub: the shape is fixed so the intake task drops in later as one file. Not registered yet.
export type IntakeInput = Record<string, never>;
export const IntakeSchema = z.object({});
export type IntakeOutput = z.infer<typeof IntakeSchema>;

export const intakeTask: AITask<IntakeInput, IntakeOutput> | null = null;
