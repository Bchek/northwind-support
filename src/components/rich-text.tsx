import { Fragment } from "react";

// Minimal renderer for the agent's replies: paragraphs, "-"/"•" bullet lists, and **bold**.
// Deliberately not a full markdown parser — the prompt asks for short plain replies, and
// rendering model output as raw HTML would be an injection risk.
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((seg, i) =>
    seg.startsWith("**") && seg.endsWith("**") ? <b key={i}>{seg.slice(2, -2)}</b> : <Fragment key={i}>{seg}</Fragment>,
  );
}

export function RichText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.every((l) => /^[-•*]\s/.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-4">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^[-•*]\s/, ""))}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}</p>;
      })}
    </div>
  );
}
