import { cn } from '@/lib/utils';

interface FormattedTextProps {
  content: string | null | undefined;
  className?: string;
}

/**
 * @description 格式化文本组件 - 支持高亮 (**text**) 和自动换行
 */
export function FormattedText({ content, className }: FormattedTextProps) {
  if (!content) return null;

  // 1. Normalize newlines
  let text = content.replace(/\\n/g, '\n');

  // 2. Insert newlines before numbered lists if missing
  text = text.replace(/(?:\s+|^)(\d+\.)/g, '\n$1');

  // 3. Insert newlines before common parts of speech if missing
  text = text.replace(/(?:\s+|^)((?:n|v|adj|adv|prep|conj|vi|vt|pron)\.)/g, '\n$1');

  // 4. Split and render
  return (
    <div className={cn("whitespace-pre-wrap", className)}>
      {text.split('\n')
        .filter(line => line.trim())
        .map((line, i) => {
          const parts = line.split(/(\*\*.*?\*\*)/g);
          
          return (
            <div key={i} className="mb-1 last:mb-0">
              {parts.map((part, index) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                  return (
                    <span key={index} className="text-yellow-400 font-bold mx-0.5">
                      {part.slice(2, -2)}
                    </span>
                  );
                }
                return <span key={index}>{part}</span>;
              })}
            </div>
          );
        })}
    </div>
  );
}
