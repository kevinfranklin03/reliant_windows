import React, { useState } from "react";

type Props = { internalNotes: string; setInternalNotes: (v: string) => void; };

/**
 * InternalNotes
 * -------------
 * Small editor for staff-only notes. Has a helper to call the backend
 * summarizer and append an AI-generated summary under a divider.
 *
 * NOTE:
 * - We keep this component self-contained (local loading state).
 * - Setter expects a string, so we build the combined text explicitly.
 */
export default function InternalNotes({ internalNotes, setInternalNotes }: Props) {
  const [loading, setLoading] = useState(false);

  // Call backend to summarize the current notes and append below.
  const onSummarize = async () => {
    const text = (internalNotes || "").trim();
    if (!text) return;

    try {
      setLoading(true);

      // Use the Vite proxy with a relative /api path
      const res = await fetch("/api/notes/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, max_words: 60 }),
      });

      if (!res.ok) {
        // Try to surface a helpful error message from the server
        let msg = `${res.status} ${res.statusText}`;
        try {
          const errJson = await res.json();
          if (errJson?.error) msg = errJson.error;
        } catch {}
        throw new Error(msg);
      }

      const { summary } = await res.json();

      // Build a string and pass it (your setter expects a string, not a function)
      const combined = text + "\n\n---\nAI summary:\n" + String(summary ?? "").trim();
      setInternalNotes(combined);
    } catch (e: any) {
      alert(`Summarize failed: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-2">
      <label>Internal notes (not shown to customer)</label>
      <textarea
        className="field min-h-[120px]"
        placeholder="E.g. Customer said via WhatsApp they want black frames; keen on survey next week..."
        value={internalNotes}
        onChange={(e)=>setInternalNotes(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <button className="btn" onClick={onSummarize} disabled={loading || !internalNotes.trim()}>
          {loading ? "Summarizing..." : "AI Summarize"}
        </button>
        <small className="text-reliant-muted">
          Tip: Use this for lead interest / conversation snippets (website/phone/WhatsApp).
        </small>
      </div>
    </div>
  );
}
