# AI routing, first slice (branch feat/ai-routing)

Merge gate: push the branch; merge to main only if every test passes before 20:40.

1. **classify task** (`lib/ai/tasks/classify.ts`, tier fast, model_authored): input is the question text and locale only; output `{ topic, language, depth, confidence }`. Confidence < 0.5 → general. In-process cache by sha256 of the input for one hour.
2. **Start flow:** classify inside `startConversation` before the inserts; on fallback use the chip or general. `route_conversation(conv, topic, depth)` stores both. Log `classified { topic, confidence, source }`.
3. **Asker confirmation:** a compact card with the AI badge ("فهم المرشد الآلي سؤالك: القرآن · بالعربية"), with "صحيح" and "عدّل". Edit opens the chips, re-routes if still waiting, and logs `classification_corrected { from, to }`. Auto-confirms after 8 s; hidden when AI is off or the chip decided.
4. **Explainable match:** `route_conversation` returns `{ daee_id, quality: full | partial | none, reasons }` and stores quality and reasons on the conversation. The asker sees them on assignment. A partial match assigns as today, with the ✗.
5. **Daee intake strip:** before the first reply, "صنّف المرشد الآلي: القرآن · عمق: توضيح" with the badge, or "اختار السائل: القرآن".
6. **Evals:** `evals/classify.yaml`, 20 labeled questions + 3 injections; accuracy reported.
7. **Tests:** journey checks for full and none matches, correction, AI off, and the intake strip; then the gate.
