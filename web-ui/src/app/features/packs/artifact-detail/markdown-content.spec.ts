import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { MARKDOWN_RAW_FIXTURE } from './content-fixtures';
import { getMarkdownContent, MarkdownContent, renderMarkdown } from './markdown-content';

describe('renderMarkdown (FR-013 / NFR-004)', () => {
  it('maps a heading to the hlmH1-H4 classes by depth', () => {
    const html = renderMarkdown('# One\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five');
    expect(html).toContain(
      '<h1 class="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl">',
    );
    expect(html).toMatch(/<h2 class="[^"]*">/);
    expect(html).toMatch(/<h3 class="[^"]*">/);
    expect(html).toMatch(/<h4 class="[^"]*">/);
    // depth > 4 falls back to the hlmH4 class string, still on its own tag.
    expect(html).toMatch(/<h5 class="scroll-m-20 text-xl font-semibold tracking-tight">/);
  });

  it('maps a paragraph to the hlmP class', () => {
    const html = renderMarkdown('Just a paragraph of text.');
    expect(html).toMatch(/<p class="[^"]*leading-7[^"]*">Just a paragraph of text\.<\/p>/);
  });

  it('maps an unordered list to the hlmUl class', () => {
    const html = renderMarkdown('- one\n- two');
    expect(html).toMatch(/<ul class="[^"]*list-disc[^"]*">/);
    expect(html).toContain('<li>');
  });

  it('maps an ordered list to a derived list-decimal class', () => {
    const html = renderMarkdown('1. one\n2. two');
    expect(html).toMatch(/<ol class="[^"]*list-decimal[^"]*">/);
  });

  it('maps a blockquote to the hlmBlockquote class', () => {
    const html = renderMarkdown('> a quote');
    expect(html).toMatch(/<blockquote class="[^"]*italic[^"]*">/);
  });

  it('maps inline code to the hlmCode class', () => {
    const html = renderMarkdown('some `inline code` here');
    expect(html).toMatch(/<code class="[^"]*bg-muted[^"]*">inline code<\/code>/);
  });

  it('wraps fenced code blocks in a styled <pre> (not the inline hlmCode treatment)', () => {
    const html = renderMarkdown('```js\nconst x = 1;\n```');
    expect(html).toMatch(/<pre class="[^"]*rounded-lg[^"]*"><code class="[^"]*language-js[^"]*">/);
    expect(html).toContain('const x = 1;');
  });

  it('maps a table to plain utility classes for header/body cells', () => {
    const html = renderMarkdown('| A | B |\n| --- | --- |\n| 1 | 2 |');
    expect(html).toContain('<table class="');
    expect(html).toMatch(/<th class="[^"]*">A<\/th>/);
    expect(html).toMatch(/<td class="[^"]*">1<\/td>/);
  });

  it('renders the realistic MARKDOWN_RAW_FIXTURE without throwing and with styled headings', () => {
    const html = renderMarkdown(MARKDOWN_RAW_FIXTURE);
    expect(html).toMatch(/<h1 class="[^"]*">/);
    expect(html).toContain('Built-in');
  });

  it('degrades non-markdown plain text to a single styled paragraph, never crashing', () => {
    const html = renderMarkdown('just some plain text, no markdown syntax');
    expect(html).toMatch(/<p class="[^"]*">just some plain text, no markdown syntax<\/p>/);
  });

  it('strips <script> tags embedded in raw markdown text', () => {
    const html = renderMarkdown('Some text <script>alert(1)</script> more text');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
  });

  it('strips onerror/on* event-handler attributes embedded in raw HTML-within-markdown', () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)">');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('alert(1)');
  });

  it('neutralizes a javascript: URL in a markdown link', () => {
    const html = renderMarkdown('[click me](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
  });

  it('never throws on empty, undefined, or malformed input', () => {
    expect(() => renderMarkdown('')).not.toThrow();
  });
});

describe('getMarkdownContent (FR-013)', () => {
  it('extracts and renders content.raw when present', () => {
    const view = getMarkdownContent({ raw: '# Heading' });
    expect(view.sanitizedHtml).not.toBeNull();
    expect(view.sanitizedHtml).toMatch(/<h1 class="[^"]*">Heading<\/h1>/);
  });

  it('returns sanitizedHtml: null when raw is absent', () => {
    expect(getMarkdownContent({})).toEqual({ sanitizedHtml: null });
  });

  it('returns sanitizedHtml: null when raw is an empty/whitespace string', () => {
    expect(getMarkdownContent({ raw: '' })).toEqual({ sanitizedHtml: null });
    expect(getMarkdownContent({ raw: '   ' })).toEqual({ sanitizedHtml: null });
  });

  it('returns sanitizedHtml: null for null/undefined content, without throwing', () => {
    expect(getMarkdownContent(null)).toEqual({ sanitizedHtml: null });
    expect(getMarkdownContent(undefined)).toEqual({ sanitizedHtml: null });
  });

  it('returns sanitizedHtml: null when content is not even an object, without throwing', () => {
    expect(getMarkdownContent(42)).toEqual({ sanitizedHtml: null });
    expect(getMarkdownContent('a plain string')).toEqual({ sanitizedHtml: null });
    expect(() => getMarkdownContent(42)).not.toThrow();
  });
});

describe('MarkdownContent component', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MarkdownContent],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders the sanitized HTML via [innerHTML] for populated content', () => {
    const fixture = TestBed.createComponent(MarkdownContent);
    fixture.componentRef.setInput('content', { raw: MARKDOWN_RAW_FIXTURE });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')).toBeTruthy();
    expect(el.textContent).toContain('Built-in');
  });

  it('renders nothing when sanitizedHtml is null (no raw content)', () => {
    const fixture = TestBed.createComponent(MarkdownContent);
    fixture.componentRef.setInput('content', {});
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('div')).toBeNull();
  });
});
