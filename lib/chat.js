const __aiextRoot = typeof window !== 'undefined' ? window : globalThis;
__aiextRoot.__aiext = __aiextRoot.__aiext || {};
__aiextRoot.__aiext.chat = {
  buildLanguageInstruction(uiLang) {
    const lang = uiLang || 'en';
    return lang.startsWith('zh')
      ? 'Please respond in the same Chinese variant (Traditional or Simplified) as the user\'s input.'
      : `Please respond in ${lang} unless the user writes in another language.`;
  },

  buildChatMessages({ context, pendingImages, conversationHistory, uiLang }) {
    const ctx = context || {};
    const allImages = [
      ...(Array.isArray(ctx.images) ? ctx.images : []),
      ...(Array.isArray(pendingImages) ? pendingImages : []),
    ];
    const langInstruction = this.buildLanguageInstruction(uiLang);
    const textPart = `You are an AI assistant. ${ctx.text ? `The user selected the following text as context:\n"${ctx.text}"\n` : ''}${allImages.length > 0 ? `The user also provided ${allImages.length} image(s) as context.` : ''} ${langInstruction} Please answer the user's question based on this context. If the question is unrelated to the selection, you may answer directly.`;

    const messages = [{ role: 'system', content: textPart }];

    if (allImages.length > 0) {
      const imgContent = [{ type: 'text', text: 'Here are the images provided by the user as context:' }];
      allImages.forEach(img => {
        imgContent.push({ type: 'image_url', image_url: { url: img } });
      });
      messages.push({ role: 'user', content: imgContent });
      messages.push({
        role: 'assistant',
        content: 'Got it, I have reviewed the image context. Please go ahead and ask your question.',
      });
    }

    return messages.concat(Array.isArray(conversationHistory) ? conversationHistory : []);
  },

  messagesHaveImages(messages) {
    return Array.isArray(messages) && messages.some(m =>
      Array.isArray(m.content) && m.content.some(p => p && p.type === 'image_url')
    );
  },

  stripImagesFromMessages(messages) {
    return (Array.isArray(messages) ? messages : []).map(m => {
      if (!Array.isArray(m.content)) return m;
      const textOnly = m.content.filter(p => p && p.type !== 'image_url');
      if (textOnly.length === 1 && textOnly[0].type === 'text') {
        return { role: m.role, content: textOnly[0].text };
      }
      return { role: m.role, content: textOnly };
    });
  },

  parseModelIds(data) {
    const items = Array.isArray(data && data.data)
      ? data.data
      : (Array.isArray(data && data.models) ? data.models : []);
    return items
      .map(m => m && (m.id || m.name))
      .filter(Boolean)
      .sort();
  },

  // Index of the nearest user message at or before `index` (-1 if none).
  // Used by message-regenerate to find the prompt to resend.
  lastUserIndexBefore(history, index) {
    if (!Array.isArray(history)) return -1;
    const end = Math.min(
      typeof index === 'number' ? index : history.length - 1,
      history.length - 1
    );
    for (let i = end; i >= 0; i--) {
      if (history[i] && history[i].role === 'user') return i;
    }
    return -1;
  },

  normalizeQuickPrompts(prompts) {
    return (Array.isArray(prompts) ? prompts : [])
      .filter(p => typeof p === 'string')
      .map(p => p.trim())
      .filter(Boolean);
  },

  // Display title for a persisted record: explicit title first, otherwise
  // the first user message. Used by the conversation manager and export.
  deriveTitle(record, maxLen) {
    const limit = typeof maxLen === 'number' && maxLen > 0 ? maxLen : 60;
    if (record && typeof record.title === 'string' && record.title.trim()) {
      return record.title.trim().slice(0, limit);
    }
    const history = record && Array.isArray(record.conversationHistory) ? record.conversationHistory : [];
    const first = history.find(m => m && m.role === 'user');
    let text = '';
    if (first) {
      if (typeof first.content === 'string') text = first.content;
      else if (Array.isArray(first.content)) {
        text = first.content.filter(p => p && p.type === 'text').map(p => p.text).join(' ');
      }
    }
    text = String(text || '').trim().replace(/\s+/g, ' ');
    return text ? text.slice(0, limit) : '';
  },

  // Renders a persisted record as Markdown for export/clipboard.
  buildConversationMarkdown(record) {
    const lines = [];
    lines.push('# ' + (this.deriveTitle(record, 80) || 'Conversation'));
    const meta = [];
    if (record && record.hostname) meta.push(`Host: ${record.hostname}`);
    if (record && record.url) meta.push(`URL: ${record.url}`);
    if (record && record.model) meta.push(`Model: ${record.model}`);
    if (record && record.createdAt) meta.push(`Created: ${new Date(record.createdAt).toISOString()}`);
    if (meta.length > 0) lines.push('', ...meta.map(m => `- ${m}`));
    const history = record && Array.isArray(record.conversationHistory) ? record.conversationHistory : [];
    for (const m of history) {
      if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
      lines.push('', `## ${m.role === 'user' ? 'User' : 'Assistant'}`, '');
      if (typeof m.content === 'string') lines.push(m.content);
      else if (Array.isArray(m.content)) {
        for (const p of m.content) {
          if (p && p.type === 'text' && p.text) lines.push(p.text);
          else if (p && p.type === 'image_url') lines.push('[image]');
        }
      }
    }
    return lines.join('\n') + '\n';
  },

  // Normalizes a persisted dialog record into a list entry shared by the
  // popup manager and the content-script listClosedDialogs handler.
  // Returns null for falsy input. Open records map with closedAt 0.
  buildClosedListItem(r) {
    if (!r) return null;
    const history = Array.isArray(r.conversationHistory) ? r.conversationHistory : [];
    const last = history.length > 0 ? history[history.length - 1] : null;
    let preview = '';
    if (last && last.content) {
      if (typeof last.content === 'string') preview = last.content;
      else if (Array.isArray(last.content)) {
        preview = last.content.filter(p => p && p.type === 'text').map(p => p.text).join(' ');
      }
    }
    return {
      id: r.id,
      hostname: r.hostname || '',
      url: r.url || '',
      closedAt: r.closedAt || 0,
      lastActive: r.lastActive || 0,
      messageCount: history.length,
      preview: preview.slice(0, 120),
      model: r.model || ''
    };
  },

  createOpenDrawerMessage(options) {
    const msg = { action: 'openDrawer' };
    if (options && typeof options.srcUrl === 'string' && options.srcUrl) {
      msg.srcUrl = options.srcUrl;
    }
    if (options && typeof options.initialText === 'string' && options.initialText) {
      msg.initialText = options.initialText;
    }
    return msg;
  },

  clampDrawerWidth(width, viewportWidth) {
    const minWidth = Math.min(300, Math.max(240, Math.floor(Number(viewportWidth) * 0.92)));
    const maxWidth = Math.max(minWidth, Math.floor(Number(viewportWidth) * 0.92));
    const requested = Number(width);
    if (!Number.isFinite(requested)) return minWidth;
    return Math.max(minWidth, Math.min(requested, maxWidth));
  },

  createDrawerWidthStyle(width, viewportWidth) {
    return {
      property: 'width',
      value: `${this.clampDrawerWidth(width, viewportWidth)}px`,
      priority: 'important',
    };
  },
};
