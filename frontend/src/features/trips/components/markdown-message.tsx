import type { ReactNode } from "react"
import Markdown from "react-markdown"
import remarkBreaks from "remark-breaks"

const markdownClass = [
  "min-w-0 space-y-3 break-words",
  "[&_h1]:text-[17px] [&_h1]:font-semibold [&_h1]:leading-snug [&_h1]:tracking-[-0.02em]",
  "[&_h2]:text-[16px] [&_h2]:font-semibold [&_h2]:leading-snug [&_h2]:tracking-[-0.02em]",
  "[&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:leading-snug [&_h3]:tracking-[-0.02em]",
  "[&_h4]:text-[14.5px] [&_h4]:font-semibold [&_h4]:leading-snug [&_h4]:tracking-[-0.02em]",
  "[&_h5]:text-[14.5px] [&_h5]:font-semibold [&_h5]:leading-snug",
  "[&_h6]:text-[14.5px] [&_h6]:font-semibold [&_h6]:leading-snug",
  "[&_strong]:font-semibold",
  "[&_hr]:border-0 [&_hr]:border-t [&_hr]:border-line",
  "[&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_li]:marker:text-mute",
  "[&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:text-mute",
  "[&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-sunk [&_pre]:px-3 [&_pre]:py-2.5 [&_pre]:text-[13px] [&_pre]:leading-relaxed",
  "[&_:not(pre)>code]:rounded-md [&_:not(pre)>code]:bg-hover [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-px [&_:not(pre)>code]:text-[0.92em]",
].join(" ")

function MarkdownLink({ href, children }: { href?: string; children?: ReactNode }) {
  if (!href) return <span>{children}</span>
  return (
    <a href={href} target="_blank" rel="noreferrer" className="break-words text-brand underline decoration-brand/40 underline-offset-2 transition hover:decoration-brand">
      {children}
    </a>
  )
}

function separateRules(text: string) {
  let fence: "`" | "~" | null = null
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      const opened = line.match(/^ {0,3}(`{3,}|~{3,})/)
      if (opened) {
        const marker = opened[1][0] as "`" | "~"
        fence = fence === marker ? null : (fence ?? marker)
        return line
      }
      if (!fence && /^ {0,3}---\s*$/.test(line)) return "\n---\n"
      return line
    })
    .join("\n")
}

export function MarkdownMessage({ text }: { text: string }) {
  return (
    <div className={markdownClass}>
      <Markdown remarkPlugins={[remarkBreaks]} components={{ a: MarkdownLink }}>
        {separateRules(text)}
      </Markdown>
    </div>
  )
}
