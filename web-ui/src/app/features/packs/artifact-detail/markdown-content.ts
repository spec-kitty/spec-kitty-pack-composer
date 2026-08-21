import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import DOMPurify from 'dompurify';
import { Marked } from 'marked';
import type { RendererObject, Tokens } from 'marked';
import {
  hlmBlockquote,
  hlmCode,
  hlmH1,
  hlmH2,
  hlmH3,
  hlmH4,
  hlmP,
  hlmUl,
} from '@spartan-ng/helm/typography';

import type { MarkdownContentView } from '../models';

/**
 * FR-013/NFR-004 — shared Details renderer for Template and Glossary
 * artifacts (byte-identical `{ raw: string }` content shape). Parses via
 * `marked` with a custom renderer that emits `@spartan-ng/helm/typography`'s
 * plain class-string constants directly into the generated HTML (since
 * `[innerHTML]` bypasses Angular's directive matching — see markdown-content
 * WP prompt's "critical, non-obvious technical detail" section), then
 * sanitizes with `dompurify` before binding.
 */

/** Spartan's typography lib exports no ordered-list primitive; derive one from `hlmUl`. */
const hlmOl = hlmUl.replace('list-disc', 'list-decimal');

/** Spartan only exports heading classes up to h4; depth > 4 falls back to hlmH4. */
const HEADING_CLASSES: Record<number, string> = {
  1: hlmH1,
  2: hlmH2,
  3: hlmH3,
  4: hlmH4,
};

/** No spartan table-typography primitive exists; hand-written minimal utility classes. */
const TABLE_CLASSES = {
  table: 'my-6 w-full overflow-y-auto border-collapse text-sm',
  th: 'border-border bg-muted/40 border px-4 py-2 text-left font-semibold',
  td: 'border-border border px-4 py-2 align-top',
};

/** Block-level fenced code — reuses the `<pre>` treatment from AgentRawTab/PackRawTab. */
const CODE_BLOCK_CLASS =
  'border-border bg-muted/40 overflow-auto rounded-lg border p-3 text-xs leading-relaxed';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const markdownRendererObject: RendererObject = {
  heading({ tokens, depth }: Tokens.Heading): string {
    const tag = Math.min(depth, 6);
    const cls = HEADING_CLASSES[depth] ?? hlmH4;
    return `<h${tag} class="${cls}">${this.parser.parseInline(tokens)}</h${tag}>\n`;
  },
  paragraph({ tokens }: Tokens.Paragraph): string {
    return `<p class="${hlmP}">${this.parser.parseInline(tokens)}</p>\n`;
  },
  blockquote({ tokens }: Tokens.Blockquote): string {
    return `<blockquote class="${hlmBlockquote}">\n${this.parser.parse(tokens)}</blockquote>\n`;
  },
  list(token: Tokens.List): string {
    const tag = token.ordered ? 'ol' : 'ul';
    const cls = token.ordered ? hlmOl : hlmUl;
    const startAttr =
      token.ordered && token.start !== 1 && token.start !== '' ? ` start="${token.start}"` : '';
    const body = token.items.map((item) => this.listitem(item)).join('');
    return `<${tag} class="${cls}"${startAttr}>\n${body}</${tag}>\n`;
  },
  code({ text, lang, escaped }: Tokens.Code): string {
    const language = (lang || '').match(/\S*/)?.[0];
    const body = escaped ? text : escapeHtml(text);
    const langClass = language ? ` language-${escapeHtml(language)}` : '';
    return `<pre class="${CODE_BLOCK_CLASS}"><code class="font-mono${langClass}">${body}</code></pre>\n`;
  },
  codespan({ text }: Tokens.Codespan): string {
    return `<code class="${hlmCode}">${escapeHtml(text)}</code>`;
  },
  table(token: Tokens.Table): string {
    const headerCells = token.header.map((cell) => this.tablecell(cell)).join('');
    const bodyRows = token.rows
      .map((row) => this.tablerow({ text: row.map((cell) => this.tablecell(cell)).join('') }))
      .join('');
    return (
      `<table class="${TABLE_CLASSES.table}">\n<thead>\n` +
      this.tablerow({ text: headerCells }) +
      `</thead>\n<tbody>\n${bodyRows}</tbody>\n</table>\n`
    );
  },
  tablerow({ text }: { text: string }): string {
    return `<tr>\n${text}</tr>\n`;
  },
  tablecell(token: Tokens.TableCell): string {
    const tag = token.header ? 'th' : 'td';
    const cls = token.header ? TABLE_CLASSES.th : TABLE_CLASSES.td;
    const alignAttr = token.align ? ` align="${token.align}"` : '';
    return `<${tag} class="${cls}"${alignAttr}>${this.parser.parseInline(token.tokens)}</${tag}>\n`;
  },
};

/**
 * A fresh `Marked` instance (not the global `marked` singleton) so this
 * module's renderer overrides never leak into any other consumer of the
 * `marked` package elsewhere in the app.
 */
const markdownRenderer = new Marked().use({ renderer: markdownRendererObject });

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'blockquote',
    'ul',
    'ol',
    'li',
    'code',
    'pre',
    'a',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'strong',
    'em',
    'br',
    'hr',
    'del',
  ],
  ALLOWED_ATTR: ['class', 'href', 'title', 'start', 'align'],
};

/** Parses+sanitizes raw markdown text; never throws (FR-013, NFR-004). */
export function renderMarkdown(raw: string): string {
  let html: string;
  try {
    html = markdownRenderer.parse(raw, { async: false });
  } catch {
    html = `<p class="${hlmP}">${escapeHtml(raw)}</p>`;
  }
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}

/**
 * Extracts the shared Template/Glossary Details view (FR-013). `content.raw`
 * (full raw file text) is the only source key — see data-model.md's
 * Template/Glossary table. `null` when absent/empty, same "no data, no
 * section" rule as every other type; defensive against non-object `content`.
 */
export function getMarkdownContent(content: unknown): MarkdownContentView {
  const record =
    content && typeof content === 'object' ? (content as Record<string, unknown>) : undefined;
  const raw = record?.['raw'];
  if (typeof raw !== 'string' || !raw.trim()) {
    return { sanitizedHtml: null };
  }
  return { sanitizedHtml: renderMarkdown(raw) };
}

/**
 * Shared Details content renderer for Template and Glossary artifacts.
 * Renders `content.raw` as sanitized, styled Markdown; omits its host
 * section entirely (renders nothing) when there is no raw text.
 */
@Component({
  selector: 'app-markdown-content',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (view().sanitizedHtml; as html) {
      <div [innerHTML]="html" class="max-w-none"></div>
    }
  `,
})
export class MarkdownContent {
  readonly content = input<unknown>(null);
  protected readonly view = computed(() => getMarkdownContent(this.content()));
}
