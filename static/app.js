/* ===== STATE ===== */
const state = {
  showThinking: true,
  autoTitle: true,
  systemPrompt: '',
  temperature: 1.0,
  compact: false,
  history: [],
  chats: [],
  activeChatId: null,
  isStreaming: false,
  abortController: null,
  pendingFiles: [],       // [{mime_type, data, name, isImage, url}]
  totalTokens: 0,
  thinkingTokens: 0,
  searchMatches: [],
  searchIndex: 0,
  contextTarget: null,    // {msgIndex, role}
};

/* ===== DOM REFS ===== */
const $ = id => document.getElementById(id);
const systemPromptEl    = $('systemPrompt');
const thinkingCheck     = $('thinkingCheck');
const darkModeCheck     = $('darkModeCheck');
const autoTitleCheck    = $('autoTitleCheck');
const compactCheck      = $('compactCheck');
const tempSlider        = $('tempSlider');
const tempValue         = $('tempValue');
const messageInput      = $('messageInput');
const sendBtn           = $('sendBtn');
const attachBtn         = $('attachBtn');
const fileInput         = $('fileInput');
const voiceBtn          = $('voiceBtn');
const chatArea          = $('chatArea');
const messagesContainer = $('messagesContainer');
const welcomeScreen     = $('welcomeScreen');
const chatHistoryList   = $('chatHistoryList');
const chatTitle         = $('chatTitle');
const tokenText         = $('tokenText');
const tokenUsage        = $('tokenUsage');
const filePreviewBar    = $('filePreviewBar');
const filePreviewInner  = $('filePreviewInner');
const toast             = $('toast');
const searchBar         = $('searchBar');
const searchInput       = $('searchInput');
const searchCount       = $('searchCount');
const searchHistory     = $('searchHistory');
const contextMenu       = $('contextMenu');
const moreMenu          = $('moreMenu');

/* ===== MARKED CONFIG ===== */
marked.setOptions({ breaks: true, gfm: true });
const renderer = new marked.Renderer();
renderer.code = (code, lang) => {
  const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
  const highlighted = hljs.highlight(typeof code === 'object' ? code.text : code, { language }).value;
  const langLabel = language !== 'plaintext' ? language : '';
  return `<div class="code-block-wrapper">
    <div class="code-header">
      <span class="code-lang">${langLabel}</span>
      <button class="copy-code-btn">Copy</button>
    </div>
    <pre><code class="hljs language-${language}">${highlighted}</code></pre>
  </div>`;
};
marked.use({ renderer });

/* ===== INIT ===== */
async function init() {
  loadFromStorage();
  await loadModels();
  applyDarkMode();
  applyCompact();
  setupEventListeners();
  if (state.chats.length === 0) startNewChat();
  else loadChat(state.activeChatId || state.chats[0].id);
}

/* ===== LOAD MODELS ===== */
async function loadModels() {
  try {
    const res = await fetch('/api/models');
    const data = await res.json();
    modelSelect.innerHTML = '';
    data.models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      opt.dataset.thinking = m.supports_thinking;
      opt.dataset.context = m.context_window || '';
      modelSelect.appendChild(opt);
    });
    modelSelect.value = state.model;
    if (!modelSelect.value) modelSelect.selectedIndex = 0;
    updateModelInfo();
  } catch (e) {
    console.error('Failed to load models', e);
  }
}

function updateModelInfo() {
  const opt = modelSelect.options[modelSelect.selectedIndex];
  const infoEl = $('modelInfo');
  if (!opt || !infoEl) return;
  const ctx = opt.dataset.context;
  const thinking = opt.dataset.thinking === 'true';
  infoEl.innerHTML = `${ctx ? `<span class="badge">${ctx}</span>` : ''}${thinking ? '<span class="badge badge-purple">Thinking</span>' : ''}`;
  const thinkingSection = $('thinkingSection');
  if (thinkingSection) thinkingSection.style.opacity = thinking ? '1' : '0.4';
}

/* ===== STORAGE ===== */
function saveToStorage() {
  try {
    localStorage.setItem('gemini_chats', JSON.stringify(state.chats));
    localStorage.setItem('gemini_active', state.activeChatId);
    localStorage.setItem('gemini_settings', JSON.stringify({
      model: state.model,
      thinkingLevel: state.thinkingLevel,
      useSearch: state.useSearch,
      showThinking: state.showThinking,
      autoTitle: state.autoTitle,
      systemPrompt: state.systemPrompt,
      temperature: state.temperature,
      compact: state.compact,
      darkMode: darkModeCheck.checked,
    }));
  } catch (e) { console.warn('Storage save failed', e); }
}

function loadFromStorage() {
  try {
    const chats = localStorage.getItem('gemini_chats');
    if (chats) state.chats = JSON.parse(chats);
    state.activeChatId = localStorage.getItem('gemini_active');
    const settings = localStorage.getItem('gemini_settings');
    if (settings) {
      const s = JSON.parse(settings);
      state.model        = s.model || 'gemini-2.5-pro-preview-06-05';
      state.thinkingLevel = s.thinkingLevel || 'HIGH';
      state.useSearch    = s.useSearch !== undefined ? s.useSearch : true;
      state.showThinking = s.showThinking !== undefined ? s.showThinking : true;
      state.autoTitle    = s.autoTitle !== undefined ? s.autoTitle : true;
      state.systemPrompt = s.systemPrompt || '';
      state.temperature  = s.temperature !== undefined ? s.temperature : 1.0;
      state.compact      = s.compact || false;
      searchCheck.checked    = state.useSearch;
      thinkingCheck.checked  = state.showThinking;
      autoTitleCheck.checked = state.autoTitle;
      compactCheck.checked   = state.compact;
      darkModeCheck.checked  = s.darkMode || false;
      systemPromptEl.value   = state.systemPrompt;
      tempSlider.value       = state.temperature;
      tempValue.textContent  = state.temperature.toFixed(1);
      document.querySelectorAll('.level-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.level === state.thinkingLevel));
    }
  } catch (e) { console.warn('Storage load failed', e); }
}

/* ===== CHAT MANAGEMENT ===== */
function startNewChat() {
  const id = 'chat_' + Date.now();
  const chat = { id, title: 'New Chat', history: [], createdAt: Date.now() };
  state.chats.unshift(chat);
  state.activeChatId = id;
  state.history = [];
  state.totalTokens = 0;
  state.thinkingTokens = 0;
  tokenUsage.classList.add('hidden');
  messagesContainer.innerHTML = '';
  welcomeScreen.classList.remove('hidden');
  chatTitle.textContent = 'New Chat';
  renderChatHistory();
  saveToStorage();
  messageInput.focus();
}

function loadChat(id) {
  const chat = state.chats.find(c => c.id === id);
  if (!chat) { startNewChat(); return; }
  state.activeChatId = id;
  state.history = chat.history || [];
  state.totalTokens = chat.totalTokens || 0;
  messagesContainer.innerHTML = '';
  chatTitle.textContent = chat.title;
  if (state.history.length === 0) {
    welcomeScreen.classList.remove('hidden');
  } else {
    welcomeScreen.classList.add('hidden');
    state.history.forEach((msg, i) =>
      renderMessage(msg.role, msg.content, msg.files || null, msg.sources || [], msg.thinking || '', i));
    if (state.totalTokens) {
      tokenText.textContent = `Tokens: ${state.totalTokens.toLocaleString()}`;
      tokenUsage.classList.remove('hidden');
    }
  }
  renderChatHistory();
  saveToStorage();
  scrollToBottom();
}

async function saveCurrentChat() {
  const chat = state.chats.find(c => c.id === state.activeChatId);
  if (!chat) return;
  chat.history = state.history;
  chat.totalTokens = state.totalTokens;
  if (state.history.length >= 2 && chat.title === 'New Chat' && state.autoTitle) {
    try {
      const res = await fetch('/api/generate-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: state.history.slice(0, 2).map(m => ({ role: m.role, content: m.content })) }),
      });
      const data = await res.json();
      if (data.title && data.title !== 'New Chat') {
        chat.title = data.title;
        chatTitle.textContent = chat.title;
      }
    } catch (_) {
      const firstMsg = state.history[0].content;
      chat.title = firstMsg.slice(0, 40) + (firstMsg.length > 40 ? '…' : '');
      chatTitle.textContent = chat.title;
    }
  }
  saveToStorage();
  renderChatHistory();
}

/* ===== RENDER CHAT HISTORY ===== */
function renderChatHistory(filter = '') {
  chatHistoryList.innerHTML = '';
  const filtered = filter
    ? state.chats.filter(c => c.title.toLowerCase().includes(filter.toLowerCase()))
    : state.chats;
  if (filtered.length === 0) {
    chatHistoryList.innerHTML = '<div class="history-empty">No chats found</div>';
    return;
  }
  filtered.forEach(chat => {
    const item = document.createElement('div');
    item.className = 'history-item' + (chat.id === state.activeChatId ? ' active' : '');
    item.innerHTML = `
      <span class="history-title">${escapeHtml(chat.title)}</span>
      <button class="history-del-btn" title="Delete chat" data-id="${chat.id}">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>`;
    item.querySelector('.history-title').addEventListener('click', () => loadChat(chat.id));
    item.querySelector('.history-del-btn').addEventListener('click', e => {
      e.stopPropagation();
      deleteChat(chat.id);
    });
    chatHistoryList.appendChild(item);
  });
}

function deleteChat(id) {
  state.chats = state.chats.filter(c => c.id !== id);
  if (state.activeChatId === id) {
    if (state.chats.length > 0) loadChat(state.chats[0].id);
    else startNewChat();
  } else {
    renderChatHistory();
    saveToStorage();
  }
}

/* ===== RENDER MESSAGE ===== */
function renderMessage(role, content, files = null, sources = [], thinking = '', msgIndex = -1) {
  const row = document.createElement('div');
  row.className = `message-row ${role}`;
  row.dataset.index = msgIndex;

  const avatar = document.createElement('div');
  avatar.className = `avatar ${role === 'user' ? 'user-avatar' : 'model-avatar'}`;
  avatar.textContent = role === 'user' ? 'U' : '✦';

  const msgContent = document.createElement('div');
  msgContent.className = 'message-content';

  // Thinking block
  if (role === 'model' && thinking && state.showThinking) {
    msgContent.appendChild(buildThinkingBlock(thinking, false));
  }

  // Attached files
  if (files && files.length > 0) {
    const filesDiv = document.createElement('div');
    filesDiv.className = 'message-files';
    files.forEach(f => {
      if (f.isImage || f.mime_type.startsWith('image/')) {
        const img = document.createElement('img');
        img.className = 'message-image';
        img.src = f.url || `data:${f.mime_type};base64,${f.data}`;
        img.alt = f.name || 'Image';
        img.addEventListener('click', () => openImageLightbox(img.src));
        filesDiv.appendChild(img);
      } else {
        const chip = document.createElement('div');
        chip.className = 'file-chip';
        chip.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
        </svg> ${escapeHtml(f.name || 'file')}`;
        filesDiv.appendChild(chip);
      }
    });
    msgContent.appendChild(filesDiv);
  }

  // Bubble
  const bubble = document.createElement('div');
  bubble.className = `bubble ${role === 'user' ? 'user-bubble' : 'model-bubble'}`;
  if (role === 'model') {
    bubble.innerHTML = renderMarkdown(content);
    addCodeCopyButtons(bubble);
    renderMath(bubble);
  } else {
    bubble.textContent = content;
  }
  msgContent.appendChild(bubble);

  // Sources
  if (sources && sources.length > 0) {
    msgContent.appendChild(buildSourcesBlock(sources));
  }

  // Actions row
  msgContent.appendChild(buildMessageActions(role, content, msgIndex, row));

  row.appendChild(avatar);
  row.appendChild(msgContent);
  messagesContainer.appendChild(row);

  // Right-click context menu
  row.addEventListener('contextmenu', e => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, msgIndex, role);
  });

  return { row, bubble };
}

/* ===== BUILD UI BLOCKS ===== */
function buildThinkingBlock(thinking, streaming = false) {
  const block = document.createElement('div');
  block.className = 'thinking-block' + (streaming ? '' : ' collapsed');
  block.innerHTML = `
    <div class="thinking-header">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
      </svg>
      <span class="thinking-label">${streaming ? 'Thinking...' : 'Thinking process'}</span>
      <svg class="thinking-toggle-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M6 9l6 6 6-6"/>
      </svg>
    </div>
    <div class="thinking-body">${escapeHtml(thinking)}</div>`;
  block.querySelector('.thinking-header').addEventListener('click', () =>
    block.classList.toggle('collapsed'));
  return block;
}

function buildSourcesBlock(sources) {
  const gs = document.createElement('div');
  gs.className = 'grounding-sources';
  gs.innerHTML = `<div class="grounding-title">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
    </svg> Sources
  </div>
  <div class="grounding-list">${sources.map(s =>
    `<a class="grounding-link" href="${s.uri}" target="_blank" rel="noopener noreferrer">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
      </svg>${escapeHtml(s.title || s.uri)}
    </a>`).join('')}
  </div>`;
  return gs;
}

function buildMessageActions(role, content, msgIndex, row) {
  const actions = document.createElement('div');
  actions.className = 'message-actions';

  const copyBtn = makeActionBtn(`<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
  </svg> Copy`, () => { copyToClipboard(content); showToast('Copied!'); });
  actions.appendChild(copyBtn);

  if (role === 'user') {
    const editBtn = makeActionBtn(`<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg> Edit`, () => openEditModal(msgIndex, content));
    actions.appendChild(editBtn);
  }

  if (role === 'model') {
    const regenBtn = makeActionBtn(`<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
    </svg> Regenerate`, () => regenerateFrom(msgIndex));
    actions.appendChild(regenBtn);
  }

  const delBtn = makeActionBtn(`<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
  </svg> Delete`, () => deleteMessage(msgIndex, row));
  delBtn.classList.add('action-btn-danger');
  actions.appendChild(delBtn);

  return actions;
}

function makeActionBtn(html, onClick) {
  const btn = document.createElement('button');
  btn.className = 'action-btn';
  btn.innerHTML = html;
  btn.addEventListener('click', onClick);
  return btn;
}

/* ===== SEND MESSAGE ===== */
async function sendMessage(text, filesToSend = null) {
  const files = filesToSend || [...state.pendingFiles];
  if (!text.trim() && files.length === 0) return;
  if (state.isStreaming) return;

  welcomeScreen.classList.add('hidden');
  state.isStreaming = true;
  state.abortController = new AbortController();
  setSendBtnStop();

  const msgIndex = state.history.length;
  const userMsg = { role: 'user', content: text, files: files.length > 0 ? files : null };
  state.history.push(userMsg);
  renderMessage('user', text, files.length > 0 ? files : null, [], '', msgIndex);
  clearFilePreviews();
  messageInput.value = '';
  autoResizeTextarea();
  scrollToBottom();

  // Typing indicator
  const typingRow = createTypingRow();
  messagesContainer.appendChild(typingRow);
  scrollToBottom();

  let fullText = '', thinkingText = '', sources = [];
  let responseBubble = null, responseRow = null, thinkingBlock = null, thinkingBody = null;

  try {
    const apiFiles = files.map(f => ({ mime_type: f.mime_type, data: f.data, name: f.name }));
    const payload = {
      message: text,
      history: state.history.slice(0, -1).map(m => ({
        role: m.role,
        content: m.content,
        files: m.files ? m.files.map(f => ({ mime_type: f.mime_type, data: f.data, name: f.name })) : null,
      })),
      model: state.model,
      thinking_level: state.thinkingLevel,
      use_search: state.useSearch,
      system_prompt: state.systemPrompt,
      files: apiFiles.length > 0 ? apiFiles : null,
      temperature: state.temperature,
    };

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: state.abortController.signal,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;
        let event;
        try { event = JSON.parse(raw); } catch { continue; }

        if (event.type === 'thinking') {
          thinkingText += event.text;
          if (!responseRow) {
            typingRow.remove();
            ({ row: responseRow, bubble: responseBubble, thinkingBlock, thinkingBody } = createStreamingRow());
          }
          if (thinkingBody) thinkingBody.textContent = thinkingText;
          scrollToBottom();

        } else if (event.type === 'text') {
          fullText += event.text;
          if (!responseRow) {
            typingRow.remove();
            ({ row: responseRow, bubble: responseBubble, thinkingBlock, thinkingBody } = createStreamingRow());
          }
          if (thinkingBlock) {
            thinkingBlock.querySelector('.thinking-label').textContent = 'Thinking process';
            thinkingBlock.classList.add('collapsed');
          }
          responseBubble.innerHTML = renderMarkdown(fullText) + '<span class="streaming-cursor"></span>';
          addCodeCopyButtons(responseBubble);
          scrollToBottom();

        } else if (event.type === 'grounding') {
          sources = event.sources;

        } else if (event.type === 'usage') {
          const u = event.usage;
          if (u.total_tokens) state.totalTokens = u.total_tokens;
          if (u.thinking_tokens) state.thinkingTokens = u.thinking_tokens;
          tokenText.textContent = `Tokens: ${state.totalTokens.toLocaleString()}${state.thinkingTokens ? ` (${state.thinkingTokens.toLocaleString()} thinking)` : ''}`;
          tokenUsage.classList.remove('hidden');

        } else if (event.type === 'error') {
          typingRow.remove();
          showErrorMessage(event.message);
          finishStreaming();
          return;

        } else if (event.type === 'done') {
          break;
        }
      }
    }

    typingRow.remove();
    if (responseBubble) {
      responseBubble.innerHTML = renderMarkdown(fullText);
      addCodeCopyButtons(responseBubble);
      renderMath(responseBubble);
      if (sources.length > 0 && responseRow) {
        const mc = responseRow.querySelector('.message-content');
        const actionsEl = mc.querySelector('.message-actions');
        mc.insertBefore(buildSourcesBlock(sources), actionsEl);
      }
    } else if (!fullText) {
      showErrorMessage('No response received. Check your API key and model availability.');
    }

    const modelMsgIndex = state.history.length;
    const modelMsg = { role: 'model', content: fullText, sources, thinking: thinkingText };
    state.history.push(modelMsg);
    // Update action buttons with correct index
    if (responseRow) {
      const actionsEl = responseRow.querySelector('.message-actions');
      if (actionsEl) actionsEl.replaceWith(buildMessageActions('model', fullText, modelMsgIndex, responseRow));
      responseRow.dataset.index = modelMsgIndex;
    }
    await saveCurrentChat();

  } catch (err) {
    typingRow.remove();
    if (err.name !== 'AbortError') showErrorMessage(err.message);
  }

  finishStreaming();
  scrollToBottom();
}

function finishStreaming() {
  state.isStreaming = false;
  state.abortController = null;
  setSendBtnSend();
}

/* ===== STREAMING ROW ===== */
function createTypingRow() {
  const row = document.createElement('div');
  row.className = 'message-row model';
  row.innerHTML = `<div class="avatar model-avatar">✦</div>
    <div class="message-content">
      <div class="bubble model-bubble">
        <div class="typing-indicator">
          <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
        </div>
      </div>
    </div>`;
  return row;
}

function createStreamingRow() {
  const row = document.createElement('div');
  row.className = 'message-row model';
  const avatar = document.createElement('div');
  avatar.className = 'avatar model-avatar';
  avatar.textContent = '✦';
  const msgContent = document.createElement('div');
  msgContent.className = 'message-content';

  let thinkingBlock = null, thinkingBody = null;
  if (state.showThinking) {
    thinkingBlock = buildThinkingBlock('', true);
    thinkingBody = thinkingBlock.querySelector('.thinking-body');
    msgContent.appendChild(thinkingBlock);
  }

  const bubble = document.createElement('div');
  bubble.className = 'bubble model-bubble';
  msgContent.appendChild(bubble);

  const actions = document.createElement('div');
  actions.className = 'message-actions';
  const copyBtn = makeActionBtn(`<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
  </svg> Copy`, () => { copyToClipboard(bubble.innerText); showToast('Copied!'); });
  actions.appendChild(copyBtn);
  msgContent.appendChild(actions);

  row.appendChild(avatar);
  row.appendChild(msgContent);
  messagesContainer.appendChild(row);
  return { row, bubble, thinkingBlock, thinkingBody };
}

/* ===== MESSAGE OPERATIONS ===== */
function deleteMessage(index, row) {
  if (!confirm('Delete this message?')) return;
  state.history.splice(index, 1);
  row.remove();
  // Re-index remaining rows
  document.querySelectorAll('.message-row[data-index]').forEach(r => {
    const i = parseInt(r.dataset.index);
    if (i > index) r.dataset.index = i - 1;
  });
  saveCurrentChat();
}

function openEditModal(index, content) {
  $('editInput').value = content;
  $('editModal').classList.remove('hidden');
  $('editInput').focus();
  $('editConfirmBtn').onclick = () => {
    const newText = $('editInput').value.trim();
    if (!newText) return;
    $('editModal').classList.add('hidden');
    // Truncate history to this point and resend
    state.history = state.history.slice(0, index);
    // Remove all rendered messages from this index onward
    document.querySelectorAll('.message-row').forEach(r => {
      if (parseInt(r.dataset.index) >= index) r.remove();
    });
    sendMessage(newText);
  };
}

function regenerateFrom(index) {
  // Find the user message before this model message
  const userIndex = index - 1;
  if (userIndex < 0 || state.history[userIndex]?.role !== 'user') return;
  const userMsg = state.history[userIndex];
  state.history = state.history.slice(0, userIndex);
  document.querySelectorAll('.message-row').forEach(r => {
    if (parseInt(r.dataset.index) >= userIndex) r.remove();
  });
  sendMessage(userMsg.content, userMsg.files || []);
}

/* ===== ERROR MESSAGE ===== */
function showErrorMessage(msg) {
  const row = document.createElement('div');
  row.className = 'message-row model';
  row.innerHTML = `<div class="avatar model-avatar">✦</div>
    <div class="message-content">
      <div class="bubble model-bubble error-bubble">
        <strong>Error:</strong> ${escapeHtml(msg)}
      </div>
    </div>`;
  messagesContainer.appendChild(row);
  scrollToBottom();
}

/* ===== SEND/STOP BUTTON ===== */
function setSendBtnStop() {
  sendBtn.classList.add('stop-btn');
  sendBtn.title = 'Stop generation';
  sendBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="2"/>
  </svg>`;
}

function setSendBtnSend() {
  sendBtn.classList.remove('stop-btn');
  sendBtn.title = 'Send (Enter)';
  sendBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
    <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/>
  </svg>`;
}

/* ===== FILE HANDLING ===== */
function handleFileSelect(e) {
  const files = Array.from(e.target.files);
  files.forEach(processFile);
  fileInput.value = '';
}

function processFile(file) {
  const reader = new FileReader();
  reader.onload = ev => {
    const dataUrl = ev.target.result;
    const base64 = dataUrl.split(',')[1];
    const isImage = file.type.startsWith('image/');
    const fileObj = { mime_type: file.type, data: base64, name: file.name, isImage, url: dataUrl };
    state.pendingFiles.push(fileObj);
    renderFilePreview(fileObj);
  };
  reader.readAsDataURL(file);
}

function renderFilePreview(fileObj) {
  filePreviewBar.classList.remove('hidden');
  const item = document.createElement('div');
  item.className = 'file-preview-item';
  if (fileObj.isImage) {
    item.innerHTML = `<img src="${fileObj.url}" alt="${escapeHtml(fileObj.name)}" />`;
  } else {
    item.innerHTML = `<div class="file-preview-icon">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
      </svg>
    </div>`;
  }
  item.innerHTML += `<span class="file-preview-name">${escapeHtml(fileObj.name)}</span>
    <button class="file-remove-btn" title="Remove">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M18 6L6 18M6 6l12 12"/>
      </svg>
    </button>`;
  item.querySelector('.file-remove-btn').addEventListener('click', () => {
    const idx = state.pendingFiles.indexOf(fileObj);
    if (idx > -1) state.pendingFiles.splice(idx, 1);
    item.remove();
    if (state.pendingFiles.length === 0) filePreviewBar.classList.add('hidden');
  });
  filePreviewInner.appendChild(item);
}

function clearFilePreviews() {
  state.pendingFiles = [];
  filePreviewInner.innerHTML = '';
  filePreviewBar.classList.add('hidden');
}

/* ===== VOICE INPUT ===== */
let recognition = null;
function setupVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { voiceBtn.style.display = 'none'; return; }
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  let finalTranscript = '';
  recognition.onstart = () => { voiceBtn.classList.add('recording'); finalTranscript = ''; };
  recognition.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    messageInput.value = finalTranscript + interim;
    autoResizeTextarea();
  };
  recognition.onend = () => { voiceBtn.classList.remove('recording'); };
  recognition.onerror = () => { voiceBtn.classList.remove('recording'); showToast('Voice input error'); };
}

/* ===== SEARCH IN CHAT ===== */
function openSearch() {
  searchBar.classList.remove('hidden');
  searchInput.focus();
}
function closeSearch() {
  searchBar.classList.add('hidden');
  clearSearchHighlights();
  state.searchMatches = [];
  state.searchIndex = 0;
  searchCount.textContent = '';
}
function doSearch(query) {
  clearSearchHighlights();
  state.searchMatches = [];
  if (!query.trim()) { searchCount.textContent = ''; return; }
  const bubbles = messagesContainer.querySelectorAll('.bubble');
  bubbles.forEach(bubble => {
    const text = bubble.textContent;
    const regex = new RegExp(escapeRegex(query), 'gi');
    if (regex.test(text)) state.searchMatches.push(bubble);
  });
  state.searchIndex = 0;
  highlightSearch(query);
  searchCount.textContent = state.searchMatches.length > 0
    ? `${state.searchIndex + 1}/${state.searchMatches.length}`
    : 'No results';
}
function highlightSearch(query) {
  state.searchMatches.forEach((el, i) => {
    el.classList.toggle('search-highlight', i === state.searchIndex);
  });
  if (state.searchMatches[state.searchIndex]) {
    state.searchMatches[state.searchIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
function clearSearchHighlights() {
  messagesContainer.querySelectorAll('.search-highlight').forEach(el => el.classList.remove('search-highlight'));
}
function escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/* ===== EXPORT ===== */
function exportChat(format = 'md') {
  const chat = state.chats.find(c => c.id === state.activeChatId);
  if (!chat || chat.history.length === 0) { showToast('Nothing to export'); return; }

  let content, mime, ext;
  if (format === 'json') {
    content = JSON.stringify({ title: chat.title, createdAt: chat.createdAt, messages: chat.history.map(m => ({ role: m.role, content: m.content, sources: m.sources || [] })) }, null, 2);
    mime = 'application/json'; ext = 'json';
  } else if (format === 'txt') {
    content = chat.history.map(m => `[${m.role === 'user' ? 'You' : 'Gemini'}]\n${m.content}`).join('\n\n---\n\n');
    mime = 'text/plain'; ext = 'txt';
  } else {
    content = `# ${chat.title}\n\n`;
    chat.history.forEach(m => {
      content += `## ${m.role === 'user' ? 'You' : 'Gemini'}\n\n${m.content}\n\n`;
      if (m.sources?.length) content += `**Sources:**\n${m.sources.map(s => `- [${s.title}](${s.uri})`).join('\n')}\n\n`;
    });
    mime = 'text/markdown'; ext = 'md';
  }

  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${chat.title.replace(/[^a-z0-9]/gi, '_')}.${ext}`;
  a.click(); URL.revokeObjectURL(url);
  showToast(`Exported as .${ext}`);
}

function copyAllMessages() {
  const chat = state.chats.find(c => c.id === state.activeChatId);
  if (!chat || chat.history.length === 0) { showToast('Nothing to copy'); return; }
  const text = chat.history.map(m => `${m.role === 'user' ? 'You' : 'Gemini'}: ${m.content}`).join('\n\n');
  copyToClipboard(text);
  showToast('All messages copied!');
}

function shareChat() {
  const chat = state.chats.find(c => c.id === state.activeChatId);
  if (!chat || chat.history.length === 0) { showToast('Nothing to share'); return; }
  const text = chat.history.map(m => `${m.role === 'user' ? 'You' : 'Gemini'}: ${m.content}`).join('\n\n');
  if (navigator.share) {
    navigator.share({ title: chat.title, text }).catch(() => {});
  } else {
    copyToClipboard(text);
    showToast('Chat copied to clipboard!');
  }
}

/* ===== RENAME CHAT ===== */
function openRenameModal() {
  const chat = state.chats.find(c => c.id === state.activeChatId);
  if (!chat) return;
  $('renameInput').value = chat.title;
  $('renameModal').classList.remove('hidden');
  $('renameInput').focus();
  $('renameInput').select();
}
function closeRenameModal() { $('renameModal').classList.add('hidden'); }
function confirmRename() {
  const newTitle = $('renameInput').value.trim();
  if (!newTitle) return;
  const chat = state.chats.find(c => c.id === state.activeChatId);
  if (chat) { chat.title = newTitle; chatTitle.textContent = newTitle; saveToStorage(); renderChatHistory(); }
  closeRenameModal();
  showToast('Chat renamed');
}

/* ===== CONTEXT MENU ===== */
function showContextMenu(x, y, msgIndex, role) {
  state.contextTarget = { msgIndex, role };
  const menu = contextMenu;
  menu.classList.remove('hidden');
  const vw = window.innerWidth, vh = window.innerHeight;
  menu.style.left = Math.min(x, vw - 180) + 'px';
  menu.style.top = Math.min(y, vh - 160) + 'px';
}
function hideContextMenu() { contextMenu.classList.add('hidden'); }

/* ===== IMAGE LIGHTBOX ===== */
function openImageLightbox(src) {
  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.innerHTML = `<div class="lightbox-inner">
    <img src="${src}" alt="Full size" />
    <button class="lightbox-close">✕</button>
  </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay || e.target.classList.contains('lightbox-close')) overlay.remove(); });
  document.body.appendChild(overlay);
}

/* ===== HELPERS ===== */
function renderMarkdown(text) {
  return marked.parse(text || '');
}

function renderMath(container) {
  if (window.renderMathInElement) {
    try {
      renderMathInElement(container, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true },
        ],
        throwOnError: false,
      });
    } catch (_) {}
  }
}

function addCodeCopyButtons(container) {
  container.querySelectorAll('.copy-code-btn').forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      const code = btn.closest('.code-block-wrapper')?.querySelector('code')?.innerText || '';
      copyToClipboard(code);
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
    };
  });
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
  });
}

function showToast(msg, duration = 2500) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, duration);
}

function scrollToBottom() { chatArea.scrollTop = chatArea.scrollHeight; }

function autoResizeTextarea() {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
  const len = messageInput.value.length;
  $('charCount').textContent = len > 100 ? len.toLocaleString() : '';
}

function applyDarkMode() { document.body.classList.toggle('dark', darkModeCheck.checked); }
function applyCompact() { document.body.classList.toggle('compact', compactCheck.checked); }

/* ===== EVENT LISTENERS ===== */
function setupEventListeners() {
  // New chat
  $('newChatBtn').addEventListener('click', startNewChat);

  // Sidebar toggle
  $('sidebarToggle').addEventListener('click', () => $('sidebar').classList.toggle('collapsed'));

  // Model select
  modelSelect.addEventListener('change', () => {
    state.model = modelSelect.value;
    updateModelInfo();
    saveToStorage();
  });

  // Thinking level
  document.querySelectorAll('.level-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.level-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.thinkingLevel = btn.dataset.level;
      saveToStorage();
    });
  });

  // Temperature
  tempSlider.addEventListener('input', () => {
    state.temperature = parseFloat(tempSlider.value);
    tempValue.textContent = state.temperature.toFixed(1);
    saveToStorage();
  });

  // Toggles
  searchCheck.addEventListener('change', () => { state.useSearch = searchCheck.checked; saveToStorage(); });
  thinkingCheck.addEventListener('change', () => { state.showThinking = thinkingCheck.checked; saveToStorage(); });
  autoTitleCheck.addEventListener('change', () => { state.autoTitle = autoTitleCheck.checked; saveToStorage(); });
  darkModeCheck.addEventListener('change', () => { applyDarkMode(); saveToStorage(); });
  compactCheck.addEventListener('change', () => { applyCompact(); saveToStorage(); });

  // System prompt
  systemPromptEl.addEventListener('input', () => { state.systemPrompt = systemPromptEl.value; saveToStorage(); });

  // System prompt presets
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.systemPrompt = btn.dataset.preset;
      systemPromptEl.value = state.systemPrompt;
      saveToStorage();
      showToast('Preset applied');
    });
  });

  // History search
  searchHistory.addEventListener('input', () => renderChatHistory(searchHistory.value));

  // Clear all
  $('clearAllBtn').addEventListener('click', () => {
    if (!confirm('Delete all chat history? This cannot be undone.')) return;
    state.chats = []; state.history = [];
    localStorage.removeItem('gemini_chats'); localStorage.removeItem('gemini_active');
    startNewChat(); showToast('All chats cleared');
  });

  // Topbar actions
  $('exportBtn').addEventListener('click', () => exportChat('md'));
  $('shareBtn').addEventListener('click', shareChat);
  $('searchMsgBtn').addEventListener('click', openSearch);

  // More menu
  $('moreBtn').addEventListener('click', e => { e.stopPropagation(); moreMenu.classList.toggle('hidden'); });
  $('copyAllBtn').addEventListener('click', () => { moreMenu.classList.add('hidden'); copyAllMessages(); });
  $('exportJsonBtn').addEventListener('click', () => { moreMenu.classList.add('hidden'); exportChat('json'); });
  $('exportTxtBtn').addEventListener('click', () => { moreMenu.classList.add('hidden'); exportChat('txt'); });
  $('renameChatBtn').addEventListener('click', () => { moreMenu.classList.add('hidden'); openRenameModal(); });
  $('deleteChatBtn').addEventListener('click', () => {
    moreMenu.classList.add('hidden');
    if (!confirm('Delete this chat?')) return;
    deleteChat(state.activeChatId);
  });
  document.addEventListener('click', () => moreMenu.classList.add('hidden'));

  // Search bar
  searchInput.addEventListener('input', () => doSearch(searchInput.value));
  $('searchClose').addEventListener('click', closeSearch);
  $('searchNext').addEventListener('click', () => {
    if (!state.searchMatches.length) return;
    state.searchIndex = (state.searchIndex + 1) % state.searchMatches.length;
    highlightSearch(searchInput.value);
    searchCount.textContent = `${state.searchIndex + 1}/${state.searchMatches.length}`;
  });
  $('searchPrev').addEventListener('click', () => {
    if (!state.searchMatches.length) return;
    state.searchIndex = (state.searchIndex - 1 + state.searchMatches.length) % state.searchMatches.length;
    highlightSearch(searchInput.value);
    searchCount.textContent = `${state.searchIndex + 1}/${state.searchMatches.length}`;
  });
  searchInput.addEventListener('keydown', e => { if (e.key === 'Escape') closeSearch(); });

  // Rename modal
  $('renameClose').addEventListener('click', closeRenameModal);
  $('renameCancelBtn').addEventListener('click', closeRenameModal);
  $('renameConfirmBtn').addEventListener('click', confirmRename);
  $('renameInput').addEventListener('keydown', e => { if (e.key === 'Enter') confirmRename(); });

  // Edit modal
  $('editClose').addEventListener('click', () => $('editModal').classList.add('hidden'));
  $('editCancelBtn').addEventListener('click', () => $('editModal').classList.add('hidden'));

  // Context menu actions
  $('ctxCopy').addEventListener('click', () => {
    if (state.contextTarget !== null) {
      const msg = state.history[state.contextTarget.msgIndex];
      if (msg) { copyToClipboard(msg.content); showToast('Copied!'); }
    }
    hideContextMenu();
  });
  $('ctxEdit').addEventListener('click', () => {
    if (state.contextTarget !== null) {
      const { msgIndex, role } = state.contextTarget;
      if (role === 'user') openEditModal(msgIndex, state.history[msgIndex]?.content || '');
    }
    hideContextMenu();
  });
  $('ctxRegenerate').addEventListener('click', () => {
    if (state.contextTarget !== null) regenerateFrom(state.contextTarget.msgIndex);
    hideContextMenu();
  });
  $('ctxDelete').addEventListener('click', () => {
    if (state.contextTarget !== null) {
      const row = messagesContainer.querySelector(`.message-row[data-index="${state.contextTarget.msgIndex}"]`);
      if (row) deleteMessage(state.contextTarget.msgIndex, row);
    }
    hideContextMenu();
  });
  document.addEventListener('click', hideContextMenu);

  // Send button
  sendBtn.addEventListener('click', () => {
    if (state.isStreaming) {
      state.abortController?.abort();
      finishStreaming();
      return;
    }
    sendMessage(messageInput.value.trim());
  });

  // Enter to send
  messageInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!state.isStreaming) sendMessage(messageInput.value.trim());
    }
  });
  messageInput.addEventListener('input', autoResizeTextarea);

  // File attach
  attachBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileSelect);

  // Voice
  voiceBtn.addEventListener('click', () => {
    if (!recognition) return;
    if (voiceBtn.classList.contains('recording')) recognition.stop();
    else recognition.start();
  });

  // Drag & drop
  $('inputBox').addEventListener('dragover', e => { e.preventDefault(); $('inputBox').classList.add('drag-over'); });
  $('inputBox').addEventListener('dragleave', () => $('inputBox').classList.remove('drag-over'));
  $('inputBox').addEventListener('drop', e => {
    e.preventDefault();
    $('inputBox').classList.remove('drag-over');
    Array.from(e.dataTransfer.files).forEach(processFile);
  });

  // Suggestion cards
  document.querySelectorAll('.suggestion-card').forEach(card => {
    card.addEventListener('click', () => {
      const prompt = card.dataset.prompt;
      messageInput.value = prompt;
      autoResizeTextarea();
      sendMessage(prompt);
    });
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); startNewChat(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); openSearch(); }
    if (e.key === 'Escape') {
      $('renameModal').classList.add('hidden');
      $('editModal').classList.add('hidden');
      closeSearch();
    }
  });
}

/* ===== BOOT ===== */
setupVoiceInput();
init();
