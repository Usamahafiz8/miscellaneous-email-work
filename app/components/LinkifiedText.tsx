// Plain-text email bodies often carry the only pointer to a candidate's actual
// CV (a Drive/Dropbox link pasted in the message) instead of a real attachment —
// rendering them as inert text meant there was no way to click through to it.
// Also catches bare "www." domains (no scheme) and email addresses, which are
// just as common in pasted plain-text signatures/bodies as full http(s) links.
const URL_REGEX = /(https?:\/\/[^\s<>"')\]]+|www\.[^\s<>"')\]]+|[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,})/g;

function hrefFor(match: string): string {
  if (/^https?:\/\//i.test(match)) return match;
  if (/^www\./i.test(match)) return `https://${match}`;
  return `mailto:${match}`;
}

export default function LinkifiedText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(URL_REGEX);
  return (
    <pre className={className}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={hrefFor(part)}
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
