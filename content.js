(() => {
  // Add logger support if available
  const logger = window.GitLeetSyncLogger || {
    log: (...args) => console.log('[GitLeetSync]', ...args),
    logError: (...args) => console.error('[GitLeetSync ERROR]', ...args),
    logWarn: (...args) => console.warn('[GitLeetSync WARN]', ...args)
  };
  const { log, logError, logWarn } = logger;

  // Catch global unhandled promise rejections to provide friendlier guidance
  window.addEventListener('unhandledrejection', (ev) => {
    try {
      const reason = ev.reason && (ev.reason.message || ev.reason.toString && ev.reason.toString()) || ev.reason;
      console.warn('[GitLeetSync] Unhandled rejection:', reason);
      if (typeof reason === 'string' && reason.toLowerCase().includes('invalidated')) {
        console.log('[GitLeetSync] Extension context invalidated — the service worker may be restarting. Reload extension at chrome://extensions and retry.');
      }
    } catch (e) {}
  });

  const isProblemPage = /leetcode\.com\/(problems|submissions)\/[^/]+/i.test(location.href);
  // Before doing anything else, clear stale LeetCode client cache to avoid broken extractions
  async function clearProblemCodeStore() {
    try {
      if (!window.indexedDB) {
        log('IndexedDB not available; skipping clearProblemCodeStore');
        return;
      }
      const dbName = 'LeetCode-problems';
      const storeName = 'problem_code';
      const openReq = indexedDB.open(dbName);
      openReq.onsuccess = (evt) => {
        try {
          const db = evt.target.result;
          if (db.objectStoreNames && db.objectStoreNames.contains(storeName)) {
            try {
              const tx = db.transaction([storeName], 'readwrite');
              const store = tx.objectStore(storeName);
              const clearReq = store.clear();
              clearReq.onsuccess = () => {
                log('Cleared IndexedDB store:', `${dbName}/${storeName}`);
                db.close();
              };
              clearReq.onerror = (e) => {
                logWarn('Failed to clear store, attempting to delete DB instead:', e && e.target && e.target.error);
                try { db.close(); indexedDB.deleteDatabase(dbName); } catch (ex) {}
              };
            } catch (e) {
              logWarn('Error clearing store, attempting to delete DB:', e);
              try { db.close(); indexedDB.deleteDatabase(dbName); } catch (ex) {}
            }
          } else {
            // store missing; attempt to delete whole DB to be safe
            db.close();
            try { indexedDB.deleteDatabase(dbName); log('Deleted IndexedDB (store missing):', dbName); } catch (e) { /* ignore */ }
          }
        } catch (e) { logWarn('clearProblemCodeStore encountered error:', e); }
      };
      openReq.onerror = () => {
        try { indexedDB.deleteDatabase(dbName); log('Deleted IndexedDB on open error:', dbName); } catch (e) { logWarn('deleteDatabase failed', e); }
      };
    } catch (e) {
      logWarn('clearProblemCodeStore failed:', e);
    }
  }

  // clear caches on every load of matching pages to avoid stale/incorrect code being used
  try { clearProblemCodeStore(); } catch (e) { logWarn('clearProblemCodeStore invocation failed', e); }

  if (!isProblemPage) return;

  // Utility: slug from URL, e.g. /problems/two-sum/
  function getSlugFromUrl() {
    const m = location.pathname.match(/\/problems\/([^/]+)/);
    return m ? m[1] : null;
  }

  function getProblemTitle(){
    // Try several selectors (LeetCode changes DOM often)
    const selCandidates = [
      'div[data-cy="question-title"]',
      '.css-v3d350 h1',      // older / custom
      'h1:not([class*="explanation"])', 
      '.question-title h3',
      'span[data-testid="question-title"]',
      '[class*="question"][class*="title"]'
    ];
    for (const sel of selCandidates){
      const el = document.querySelector(sel);
      if (el && el.innerText && el.innerText.trim().length > 5 && !/explanation|hint|solution/i.test(el.innerText)) {
        return el.innerText.trim();
      }
    }
    // fallback: try to extract from document title or URL
    let title = document.title.replace(' - LeetCode', '').replace('Submissions', '').trim();
    if (!title || title.length < 5) {
      // try to get from URL slug
      const slug = getSlugFromUrl();
      if (slug) {
        title = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }
    }
    return title || 'Unknown Problem';
  }

  function getProblemLink() {
    return location.href.split('?')[0];
  }

  function getLanguageFromPage() {
    // Try finding language selector with all possible attributes
    let sel = document.querySelector('select[class*="language"], select[class*="lang"], select[data-cy*="lang"], select');
    if (sel && sel.value) {
      const lang = sel.value.toLowerCase().trim();
      if (lang && lang !== 'select' && lang.length > 0) {
        console.log('[GitLeetSync] Language from select dropdown:', lang);
        return lang;
      }
    }
    
    // Try data attributes on various elements
    const dataLangElements = document.querySelectorAll('[data-language], [data-lang], [data-testid*="lang"]');
    for (const el of dataLangElements) {
      const lang = el.getAttribute('data-language') || el.getAttribute('data-lang');
      if (lang && lang.length > 2) {
        console.log('[GitLeetSync] Language from data attribute:', lang);
        return lang.toLowerCase();
      }
    }
    
    // Look in aria-label or title attributes
    const allButtonsAndDivs = document.querySelectorAll('button[aria-label], button[title], div[aria-label], span[aria-label]');
    for (const el of allButtonsAndDivs) {
      const label = (el.getAttribute('aria-label') || el.getAttribute('title') || '').toLowerCase();
      if (label && /python|java|c\+\+|javascript|typescript|php|go|rust|swift|kotlin|ruby|scala|groovy|bash|c#|csharp/.test(label)) {
        const match = label.match(/python|java|c\+\+|javascript|typescript|php|go|rust|swift|kotlin|ruby|scala|groovy|bash|c#|csharp/i);
        if (match) {
          console.log('[GitLeetSync] Language from aria-label:', match[0]);
          return match[0].toLowerCase();
        }
      }
    }
    
    // Try to find language in visible text (buttons/dropdowns)
    const allElements = document.querySelectorAll('button, div, span');
    for (const el of allElements) {
      const text = (el.innerText || el.textContent || '').trim();
      // Look for language name at start of text
      const match = text.match(/^(Python|Java|C\+\+|C#|JavaScript|TypeScript|PHP|Go|Rust|Swift|Kotlin|Ruby|Scala|Groovy|Bash)\s*(\d+|\w+)?/i);
      if (match) {
        console.log('[GitLeetSync] Language from element text:', match[1]);
        return match[1].toLowerCase();
      }
    }
    
    console.log('[GitLeetSync] Could not detect language, defaulting to python');
    return 'python';
  }

  function tryGetCodeFromLocalStorage(slug){
    if (!slug) return null;
    const key1 = `code:${slug}`;
    const v1 = localStorage.getItem(key1);
    if (v1) {
      try {
        const parsed = JSON.parse(v1);
        if (typeof parsed === 'string' && parsed.length > 10) return parsed;
        if (parsed && parsed.code) return parsed.code;
        if (parsed && parsed.value) return parsed.value;
      } catch (e){
        // not json -> maybe raw code
        if (v1.length > 10) return v1;
      }
    }
    // also try to look for "editor" keys (fallback)
    for (let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i);
      if (k && k.toLowerCase().includes('code') && k.toLowerCase().includes(slug)) {
        const v = localStorage.getItem(k);
        if (v && v.length > 10) return v;
      }
    }
    return null;
  }

    // Language-aware helper: candidate language terms used in IndexedDB keys
    const languageTermMap = {
      python: ['python3','python','py'],
      javascript: ['javascript','js','node'],
      typescript: ['typescript','ts'],
      java: ['java'],
      cpp: ['cpp','c++','cplusplus'],
      'c++': ['cpp','c++'],
      csharp: ['csharp','c#'],
      go: ['golang','go'],
      php: ['php'],
      ruby: ['ruby'],
      kotlin: ['kotlin'],
      swift: ['swift'],
      rust: ['rust'],
      scala: ['scala']
    };

    // Extract code from LeetCode's IndexedDB cache (most reliable source)
    // Now language-aware: pass slug and optional language to prefer language-specific keys
    async function extractCodeFromIndexedDB(slug, language) {
      try {
        if (!window.indexedDB) return null;
        const dbName = 'LeetCode-problems';
        const storeName = 'problem_code';
        const req = indexedDB.open(dbName);
        const results = [];

        return await new Promise((resolve) => {
          req.onsuccess = function() {
            try {
              const db = req.result;
              if (!db.objectStoreNames.contains(storeName)) {
                resolve(null);
                return;
              }
              const tx = db.transaction([storeName], 'readonly');
              const store = tx.objectStore(storeName);
              const cursorReq = store.openCursor();

              const langTerms = (language && languageTermMap[language.toLowerCase()]) || [];

              cursorReq.onsuccess = function(ev) {
                const cursor = ev.target.result;
                if (cursor) {
                  const key = String(cursor.key || '');
                  const val = cursor.value && (cursor.value.code || cursor.value) || '';
                  // prioritize keys containing slug and language term
                  let score = 0;
                  if (slug && key.toLowerCase().includes(slug.toLowerCase())) score += 10;
                  for (const t of langTerms) if (key.toLowerCase().includes(t)) score += 5;
                  // also boost if stored value seems non-empty and long
                  if (typeof val === 'string' && val.length > 50) score += 1;
                  if (score > 0) results.push({key, val, score});
                  cursor.continue();
                } else {
                  // choose best-scoring candidate
                  if (results.length === 0) return resolve(null);
                  results.sort((a,b) => b.score - a.score);
                  resolve(results[0].val || null);
                }
              };

              cursorReq.onerror = function() { resolve(null); };
            } catch (e) { resolve(null); }
          };
          req.onerror = function() { resolve(null); };
        });
      } catch (e) {
        return null;
      }
    }

    // Generic function-name search across languages in IndexedDB
    // Uses simple regex heuristics per language to find function definitions
    async function extractFunctionFromIndexedDB(functionName, language) {
      if (!functionName) return null;
      try {
        if (!window.indexedDB) return null;
        const dbName = 'LeetCode-problems';
        const storeName = 'problem_code';
        const req = indexedDB.open(dbName);

        const patternsByLang = {
          python: new RegExp('def\\s+' + functionName + '\\s*\\(', 'm'),
          javascript: new RegExp('function\\s+' + functionName + '\\s*\\(|' + functionName + '\\s*[:=]\\s*\\(?', 'm'),
          typescript: new RegExp('function\\s+' + functionName + '\\s*\\(|' + functionName + '\\s*[:=]\\s*\\(?', 'm'),
          java: new RegExp('[a-zA-Z0-9_<>\\[\\]\\s]+\\s+' + functionName + '\\s*\\(', 'm'),
          cpp: new RegExp('[a-zA-Z0-9_\\s:&<>*]+\\s+' + functionName + '\\s*\\(', 'm'),
          php: new RegExp('function\\s+' + functionName + '\\s*\\(', 'm')
        };

        const langKey = language ? language.toLowerCase() : null;
        const pat = (langKey && patternsByLang[langKey]) || null;

        return await new Promise((resolve) => {
          req.onsuccess = function() {
            try {
              const db = req.result;
              if (!db.objectStoreNames.contains(storeName)) return resolve(null);
              const tx = db.transaction([storeName], 'readonly');
              const store = tx.objectStore(storeName);
              const cursorReq = store.openCursor();

              cursorReq.onsuccess = function(ev) {
                const cursor = ev.target.result;
                if (cursor) {
                  const val = cursor.value && (cursor.value.code || cursor.value) || '';
                  if (typeof val === 'string' && val.length > 20) {
                    // if pattern exists for language, use it; otherwise do a generic contains
                    if (pat) {
                      if (pat.test(val)) return resolve(val);
                    } else {
                      // generic heuristics: look for functionName followed by '(' or '=' or ':' for various langs
                      const generic = new RegExp(functionName + '\\s*\\(');
                      if (generic.test(val)) return resolve(val);
                    }
                  }
                  cursor.continue();
                } else {
                  resolve(null);
                }
              };
              cursorReq.onerror = function() { resolve(null); };
            } catch (e) { resolve(null); }
          };
          req.onerror = function() { resolve(null); };
        });
      } catch (e) {
        return null;
      }
    }

    // Helper: sendMessage with retries when the extension context is invalidated
    function sendMessageWithRetries(message, maxAttempts = 4, initialDelay = 1000) {
      return new Promise((resolve, reject) => {
        let attempt = 0;
        let delay = initialDelay;

        const trySend = () => {
          attempt++;
          try {
            chrome.runtime.sendMessage(message, function(response) {
              const err = chrome.runtime.lastError;
              if (err) {
                logError('Communication error:', err.message);
                if (err.message && err.message.toLowerCase().includes('invalidated') && attempt < maxAttempts) {
                  log('Context invalidated — retrying in', delay, 'ms (attempt', attempt, '/', maxAttempts, ')');
                  setTimeout(() => { delay = Math.min(8000, delay * 2); trySend(); }, delay);
                  return;
                }
                return reject(err);
              }
              resolve(response);
            });
          } catch (e) {
            logError('sendMessage threw synchronously:', e && e.message ? e.message : e);
            if (e && e.message && e.message.toLowerCase().includes('invalidated') && attempt < maxAttempts) {
              log('sendMessage threw invalidated — retrying in', delay, 'ms (attempt', attempt, '/', maxAttempts, ')');
              setTimeout(() => { delay = Math.min(8000, delay * 2); trySend(); }, delay);
              return;
            }
            return reject(e);
          }
        };

        trySend();
      });
    }


  // Helper to extract code from all visible line elements (Monaco renders each line separately)
  function extractCodeFromMonacoLines() {
    try {
      // Monaco renders code as individual line elements with class 'view-line'
      const lines = document.querySelectorAll('.view-line');
      if (lines.length > 0) {
        const codeLines = Array.from(lines).map(line => {
          // Use textContent to get actual text without rendering artifacts
          return line.textContent || '';
        });
        const fullCode = codeLines.join('\n');
        if (fullCode.length > 10 && !fullCode.includes('undefined')) {
          console.log('[GitLeetSync] Code extracted from Monaco lines, length:', fullCode.length);
          return fullCode;
        }
      }
    } catch (e) {
      console.warn('[GitLeetSync] Error extracting from Monaco lines:', e);
    }
    return null;
  }

  function tryGetCodeFromEditor() {
    // Try common Monaco API first (most reliable)
    try {
      // If page exposes editor
      if (window.monaco && window.monaco.editor) {
        // find first monaco editor model
        const models = window.monaco.editor.getModels();
        if (models && models.length) {
          const code = models[0].getValue();
          console.log('[GitLeetSync] Code extracted from Monaco editor (getValue), length:', code.length);
          return code;
        }
      }
    } catch(e){
      console.warn('[GitLeetSync] Monaco API error:', e);
    }
    
    // Try extracting from Monaco line elements (rendered view)
    const monacoLines = extractCodeFromMonacoLines();
    if (monacoLines) return monacoLines;
    
    // Try to access Monaco internals if available (alternative approach)
    try {
      const editorElement = document.querySelector('[data-testid="code-editor-wrapper"], .monaco-editor, [class*="editor"]');
      if (editorElement && window.__MONACO_EDITOR_INSTANCE__) {
        const editor = window.__MONACO_EDITOR_INSTANCE__;
        if (editor && editor.getValue) {
          const code = editor.getValue();
          console.log('[GitLeetSync] Code extracted from Monaco instance, length:', code.length);
          return code;
        }
      }
    } catch(e){}
    
    // Fallback: try the textarea / code editor visible on page
    const textareas = document.querySelectorAll('textarea, .CodeMirror, .monaco-scrollable-element, [contenteditable="true"], [role="textbox"]');
    for (const ta of textareas) {
      if (ta.tagName === 'TEXTAREA' && ta.value && ta.value.length > 10) {
        console.log('[GitLeetSync] Code found in textarea, length:', ta.value.length);
        return ta.value;
      }
      if (ta.contentEditable === 'true' && ta.textContent && ta.textContent.length > 10) {
        console.log('[GitLeetSync] Code found in contenteditable, length:', ta.textContent.length);
        return ta.textContent;
      }
      // For Monaco editor divs, use textContent instead of innerText to preserve line breaks
      if (ta.textContent && ta.textContent.length > 10 && (ta.className.includes('monaco') || ta.className.includes('editor'))) {
        console.log('[GitLeetSync] Code found in editor div (textContent), length:', ta.textContent.length);
        return ta.textContent;
      }
    }
    
    // Last resort: check for any pre/code blocks with substantial content
    const codeBlocks = document.querySelectorAll('pre, code, [class*="code"]');
    for (const block of codeBlocks) {
      // Prefer textContent over innerText to avoid rendering-based line breaks
      const text = block.textContent || block.innerText;
      if (text && text.length > 20 && !/submit|button|click/i.test(text)) {
        console.log('[GitLeetSync] Code found in block, length:', text.length);
        return text;
      }
    }
    
    console.error('[GitLeetSync] No code found in any location');
    return null;
  }

  function getProblemDescription() {
    // Extract problem statement from LeetCode page
    try {
      // Strategy 1: Look for the main problem content container
      // LeetCode typically has multiple possible selectors for the description area
      const possibleSelectors = [
        'div[class*="ViewWrapper"]',
        'div[class*="description-panel"]',
        'article',
        'div[role="region"]',
        'div[data-testid*="description"]',
        'div.col-md-6',
        'div.left-panel',
        // Generic: look for divs with substantial content that aren't code editor
        'div[style*="flex"]'
      ];

      let fullText = '';

      // Try each selector
      for (const selector of possibleSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const text = el.innerText || el.textContent || '';
          // Look for elements containing problem description markers
          if (text.includes('Example') && text.includes('Constraints') && text.length > 200) {
            fullText = text;
            break;
          }
        }
        if (fullText) break;
      }

      // Strategy 2: If still not found, scan all major divs
      if (!fullText) {
        const allDivs = document.querySelectorAll('div');
        for (const div of allDivs) {
          const text = div.innerText || div.textContent || '';
          // Must have examples AND constraints, AND substantial length
          if (text.includes('Example') && 
              text.includes('Constraints') && 
              text.includes('Input') &&
              text.length > 500 && 
              text.length < 20000) { // reasonable bounds
            fullText = text;
            break;
          }
        }
      }

      if (!fullText) return '';

      // Now parse: extract from start to "Hint" (stop before hints/follow-up/etc)
      const lines = fullText.split('\n');
      const result = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineLower = line.trim().toLowerCase();

        // Stop markers: hints, follow-up, seen in interview, accepted, topics
        if (lineLower.startsWith('hint') ||
            lineLower.startsWith('follow-up') ||
            lineLower.includes('seen this question') ||
            lineLower.includes('accepted') ||
            lineLower === 'topics' ||
            lineLower === 'companies' ||
            lineLower.startsWith('difficulty:') ||
            lineLower.startsWith('related topics')) {
          break;
        }

        result.push(line);
      }

      // Clean trailing empty lines
      while (result.length > 0 && result[result.length - 1].trim() === '') {
        result.pop();
      }

      const description = result.join('\n').trim();
      
      // Validate we got a reasonable description
      if (description.length > 100) {
        return description;
      }

    } catch (e) {
      logWarn('Error extracting description:', e);
    }

    return '';
  }

  // watch for submission result changes — LeetCode displays a result panel with statuses like "Accepted"
  let lastDetectionTime = 0;
  let lastSubmitButtonClickTime = 0;
  
  // Track when user clicks submit button to know when to expect results
  function trackSubmitClicks() {
    document.addEventListener('click', (e) => {
      const target = e.target;
      const text = (target.innerText || target.textContent || '').toLowerCase();
      // Look for submit button
      if (text.includes('submit') && (target.tagName === 'BUTTON' || target.closest('button'))) {
        lastSubmitButtonClickTime = Date.now();
        console.log('[GitLeetSync] Submit button clicked, tracking submission...');
      }
    }, true); // use capture phase
  }
  
  function observeSubmissionResults() {
    // potential container that shows status; we'll use body fallback
    const root = document.body;
    const observer = new MutationObserver(mutations => {
      const now = Date.now();
      // Debounce: only check every 500ms to avoid excessive checks
      if (now - lastDetectionTime < 500) return;
      lastDetectionTime = now;

      for (const m of mutations) {
        // scan added nodes for accepted status text
        for (const node of m.addedNodes) {
          try {
            if (!node) continue;
            const text = (node.innerText || node.textContent || '').toString().toLowerCase();
            // More flexible matching for accepted status
            if (text && /accept|pass|all\s+testcas|all\s+test\s+case/i.test(text)) {
              // Also check if it's not a false positive (like "submit")
              if (!/submit/i.test(text) || /accepted|pass/i.test(text)) {
                // Only trigger push if this happened within 2 minutes of a submit click
                const timeSinceSubmit = now - lastSubmitButtonClickTime;
                if (timeSinceSubmit < 120000 && timeSinceSubmit >= 0) {
                  console.log('[GitLeetSync] Detected accepted submission:', text.substring(0, 80));
                  // small delay to ensure code is captured
                  setTimeout(onAcceptedDetected, 1000);
                  return;
                } else {
                  console.log('[GitLeetSync] Detected "accepted" but not after recent submit (time delta:', timeSinceSubmit, 'ms) — likely stale, ignoring');
                }
              }
            }
          } catch (e){}
        }
      }

      // Also scan the entire DOM periodically for accepted indicators
      try {
        const acceptedElements = document.querySelectorAll(
          '[class*="accepted"], [class*="pass"], [data-test*="accepted"], [data-testid*="accepted"]'
        );
        for (const el of acceptedElements) {
          const text = (el.innerText || el.textContent || '').toLowerCase();
          if (text && /accepted|passed|all\s+testcas/i.test(text)) {
            // Only trigger push if this happened within 2 minutes of a submit click
            const timeSinceSubmit = now - lastSubmitButtonClickTime;
            if (timeSinceSubmit < 120000 && timeSinceSubmit >= 0) {
              console.log('[GitLeetSync] Detected accepted via DOM scan:', text.substring(0, 80));
              setTimeout(onAcceptedDetected, 1000);
              return;
            } else {
              console.log('[GitLeetSync] Detected "accepted" via DOM but not after recent submit (time delta:', timeSinceSubmit, 'ms) — likely stale, ignoring');
            }
          }
        }
      } catch (e){}
    });
    observer.observe(root, {childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-testid']});
    console.log('[GitLeetSync] Submission observer started');
  }

  let lastPushedKey = null;
  let lastPushAttemptTime = 0;
  async function onAcceptedDetected() {
    try {
      const slug = getSlugFromUrl();
      const title = getProblemTitle();
      const language = getLanguageFromPage() || 'python';
      const link = getProblemLink();
      const description = getProblemDescription();

      log('onAcceptedDetected called:', {slug, title, language});

      // avoid duplicate pushes within short window
      const now = Date.now();
      if (lastPushedKey && (now - lastPushAttemptTime) < 30000 && lastPushedKey === `${slug}:${language}`) {
        log('Skipping duplicate push for', slug, language);
        return;
      }

      // Try to find a function name from the visible editor (lightweight scan)
      let functionName = null;
      try {
        const preview = tryGetCodeFromEditor();
        if (preview && typeof preview === 'string' && preview.length > 0) {
          // python
          const mPy = preview.match(/def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
          if (mPy) functionName = mPy[1];
          // javascript/typescript
          if (!functionName) {
            const mJs = preview.match(/function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(|const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\(?/);
            if (mJs) functionName = mJs[1] || mJs[2];
          }
          // java/cpp: try method name heuristics
          if (!functionName) {
            const mJ = preview.match(/[a-zA-Z0-9_<>\[\]\s]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
            if (mJ) functionName = mJ[1];
          }
        }
      } catch (e) { /* ignore */ }

      log('Candidate functionName:', functionName);

      let code = null;
      // 1) If we have a function name, try to get the exact cached file containing it
      if (functionName) {
        log('Searching IndexedDB by function name...');
        try {
          code = await extractFunctionFromIndexedDB(functionName, language);
          if (code) log('Found code via function-name search (IndexedDB)');
        } catch (e) { logWarn('function-name IndexedDB search failed', e); }
      }

      // 2) If not found, try slug + language search in IndexedDB
      if (!code) {
        log('Searching IndexedDB by slug + language...');
        try {
          code = await extractCodeFromIndexedDB(slug, language);
          if (code) log('Found code via slug+language search (IndexedDB)');
        } catch (e) { logWarn('slug+language IndexedDB search failed', e); }
      }

      // 3) Fallback to editor/DOM extraction
      if (!code) {
        log('Falling back to editor extraction...');
        code = tryGetCodeFromEditor() || tryGetCodeFromLocalStorage(slug);
        if (code) log('Code extracted from editor fallback, length:', code.length);
      }

      if (!code) {
        logError('No code found to push for', slug);
        lastPushAttemptTime = now;
        lastPushedKey = `${slug}:${language}`;
        // notify background of failure for user visibility
        chrome.runtime.sendMessage({type:'PUSH_FAILURE', slug, reason: 'no_code_found'});
        return;
      }

      // guard: make sure code is a string
      if (typeof code !== 'string') {
        try { code = JSON.stringify(code); } catch (e) { code = String(code); }
      }

      // mark attempt
      lastPushAttemptTime = now;
      lastPushedKey = `${slug}:${language}`;

      // send to background to push
      log('Sending push request to background...', {slug, title, language, codeLength: code.length});
      const payload = { type: 'PUSH_SOLUTION', slug, title, language, code, description, link };
      sendMessageWithRetries(payload, 5)
        .then(resp => {
          log('Push response:', resp);
        }).catch(err => {
          logError('Push send failed', err);
        });

    } catch (e) {
      logError('onAcceptedDetected error', e);
    }
  }

  // start observing
  observeSubmissionResults();
  trackSubmitClicks();

  // Also provide manual keyboard trigger: Ctrl+Shift+Y to force push
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'y') {
      console.log('[GitLeetSync] Manual push triggered via Ctrl+Shift+Y');
      setTimeout(onAcceptedDetected, 200);
    }
  });

  // Debug helper: Ctrl+Shift+D to log current page state
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
      console.log('=== [GitLeetSync Debug Info] ===');
      console.log('URL:', location.href);
      console.log('Slug:', getSlugFromUrl());
      console.log('Title:', getProblemTitle());
      const detectedLang = getLanguageFromPage();
      console.log('Language:', detectedLang);
      const code = tryGetCodeFromEditor() || tryGetCodeFromLocalStorage(getSlugFromUrl());
      console.log('Code found:', code ? code.substring(0, 100) + '...' : 'NOT FOUND');
      console.log('Code length:', code ? code.length : 0);
      console.log('Description length:', getProblemDescription().length);
      console.log('=============================');
    }
  });

  console.log('[GitLeetSync] ✅ Content script loaded on', location.href);
  console.log('[GitLeetSync] Watching for accepted submissions...');
  console.log('[GitLeetSync] Keyboard shortcuts:');
  console.log('[GitLeetSync]   Ctrl+Shift+Y = Manually trigger push');
  console.log('[GitLeetSync]   Ctrl+Shift+D = Show debug info');
})();
