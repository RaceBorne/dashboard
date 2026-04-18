import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MessageResponseProps {
  children: string;
  className?: string;
}

/**
 * MessageResponse — universal renderer for AI-generated text in the dashboard.
 * Use this for every AI output: briefings, reply suggestions, social drafts,
 * SEO recommendations. Never render raw `{text}` in JSX or you will get ugly
 * `**bold**`, `## headings`, and `---` separators in the UI.
 *
 * Lightweight stand-in for the @ai-elements/message MessageResponse — wraps
 * react-markdown with our prose-evari styles.
 */
export function MessageResponse({ children, className }: MessageResponseProps) {
  return (
    <div className={cn('prose-evari', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
