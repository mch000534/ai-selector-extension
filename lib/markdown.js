window.__aiext = window.__aiext || {};

window.__aiext.markdown = {
  renderMarkdown(text) {
    if (!text) return '';
    const { escapeHtml } = window.__aiext.utils;
    let html = escapeHtml(text);
    // Stash code spans/blocks into placeholders so inline transforms never
    // touch their content (fixes ** inside code being mangled) and so <br>
    // conversion skips <pre> interiors.
    const slots = [];
    const stash = (tag) => { slots.push(tag); return `\u0000${slots.length - 1}\u0000`; };

    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (m, _l, code) =>
      stash(`<pre><code>${code}</code></pre>`));
    html = html.replace(/`([^`]+)`/g, (m, c) => stash(`<code>${c}</code>`));

    // Link URLs restricted to http(s)/mailto to prevent javascript: schemes
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    html = html.replace(/^###\s+(.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^##\s+(.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^#\s+(.+)$/gm, '<h3>$1</h3>');

    // '>' was escaped to '&gt;' by escapeHtml
    html = html.replace(/^&gt;\s?(.+)$/gm, '<blockquote>$1</blockquote>');

    // Bold then italic; the [^*] boundary avoids matching inside **bold**
    html = html.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');

    html = html.replace(/\n/g, '<br>');
    html = html.replace(/\u0000(\d+)\u0000/g, (m, i) => slots[Number(i)]);
    return html;
  },
};
