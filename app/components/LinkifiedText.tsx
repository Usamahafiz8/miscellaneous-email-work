// Plain-text email bodies often carry the only pointer to a candidate's actual
// CV (a Drive/Dropbox link pasted in the message) instead of a real attachment —
// rendering them as inert text meant there was no way to click through to it.
const URL_REGEX = /(https?:\/\/[^\s<>"')\]]+)/g;

export default function LinkifiedText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(URL_REGEX);
  return (
    <pre className={className}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 hover:text-indigo-800 underline break-all"
          >
            {part}
          </a>
        ) : (
          part
        )
      )}
    </pre>
  );
}
