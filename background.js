// background.js
// Listens for messages from content.js and popup.js and performs GitHub create/update
importScripts('logger.js');

// Use logger if available, otherwise use console
const logger = self.GitLeetSyncLogger || {
  log: (...args) => console.log('[GitLeetSync]', ...args),
  logError: (...args) => console.error('[GitLeetSync ERROR]', ...args),
  logWarn: (...args) => console.warn('[GitLeetSync WARN]', ...args)
};
const { log, logError, logWarn } = logger;

log('Background service worker started');

async function notify(title, message, isError=false) {
  log('Notification:', title, '-', message);
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title,
    message
  });
}

async function getSettings() {
  const settings = await chrome.storage.sync.get(['pat','owner','repo','branch','folderTemplate']);
  log('Settings retrieved:', {owner: settings.owner, repo: settings.repo, branch: settings.branch});
  return settings;
}

function base64Encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

// Create or update file in GitHub (with retry on 409 conflict)
async function putFileToGitHub(owner, repo, path, contentBase64, message, branch, pat, retries = 3) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  log('Pushing file to GitHub:', path);
  
  // Check if file exists to get sha
  let sha = null;
  try {
    const res = await fetch(url + `?ref=${encodeURIComponent(branch)}`, {
      method: 'GET',
      headers: {
        Authorization: `token ${pat}`,
        Accept: 'application/vnd.github+json',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache'
      }
    });
    if (res.ok) {
      const j = await res.json();
      sha = j.sha;
      log('File exists, updating with sha:', sha);
    }
  } catch (e) {
    logWarn('Error checking existing file', e);
  }

  const payload = {
    message,
    content: contentBase64,
    branch
  };
  if (sha) payload.sha = sha;

  try {
    const putRes = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `token ${pat}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    // Handle 409 Conflict: SHA mismatch, retry by re-fetching SHA with exponential backoff
    if (putRes.status === 409 && retries > 0) {
      const backoff = Math.min(3000, 200 * Math.pow(2, (4 - retries))) + Math.floor(Math.random() * 300);
      logWarn('Got 409 Conflict, will re-fetch SHA and retry...', {path, attemptDelay: backoff, retriesLeft: retries - 1});
      await new Promise(resolve => setTimeout(resolve, backoff));
      return putFileToGitHub(owner, repo, path, contentBase64, message, branch, pat, retries - 1);
    }
    
    log('GitHub API response:', putRes.status, putRes.statusText);
    return putRes;
  } catch (e) {
    logError('Failed to push file to GitHub:', e);
    throw e;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'TEST_SETTINGS') {
    log('TEST_SETTINGS request received');
    (async () => {
      const settings = msg.settings;
      if (!settings || !settings.pat || !settings.owner || !settings.repo) {
        logWarn('TEST_SETTINGS: Missing required settings');
        sendResponse({ok:false});
        return;
      }
      try {
        const url = `https://api.github.com/repos/${settings.owner}/${settings.repo}`;
        log('Testing GitHub connection to:', url);
        const r = await fetch(url, { headers: { Authorization: `token ${settings.pat}` }});
        log('Test result:', r.ok, 'Status:', r.status);
        sendResponse({ ok: r.ok, status: r.status });
      } catch(e){
        logError('TEST_SETTINGS error:', e);
        sendResponse({ok:false});
      }
    })();
    // indicate we'll call sendResponse asynchronously
    return true;
  }

  if (msg && msg.type === 'PUSH_SOLUTION') {
    log('PUSH_SOLUTION request received:', {slug: msg.slug, language: msg.language, title: msg.title});
    (async () => {
      const s = await getSettings();
      const pat = s.pat;
      const owner = s.owner;
      const repo = s.repo;
      const branch = s.branch || 'main';
      const folderTemplate = s.folderTemplate || 'leetcode/{language}/{slug}';

      if (!pat || !owner || !repo) {
        logError('PUSH_SOLUTION: Missing GitHub settings');
        await notify('GitLeetSync: Missing settings', 'Set your GitHub token & repo in the extension popup.');
        sendResponse({status: 'error', reason: 'missing_settings'});
        return;
      }

      try {
        // build folder path using template
        const slugSafe = (msg.slug || 'unknown-slug').replace(/[^a-zA-Z0-9-_]/g,'_');
        const languageSafe = (msg.language || 'txt').replace(/[^a-zA-Z0-9-_]/g,'_');
        const titleSafe = (msg.title || slugSafe).replace(/[:\/\\?<>|"\*\n\r]+/g, '_').slice(0,120);
        const folder = folderTemplate.replace('{slug}', slugSafe).replace('{language}', languageSafe).replace('{title}', titleSafe);

        // create filenames
        // map common languages -> extension (basic)
        function extFromLang(lang){
          const l = (lang||'').toLowerCase();
          if (l.includes('python')) return '.py';
          if (l.includes('java')) return '.java';
          if (l.includes('cpp') || l.includes('c++')) return '.cpp';
          if (l.includes('c#') || l.includes('csharp')) return '.cs';
          if (l.includes('javascript') || l.includes('js')) return '.js';
          if (l.includes('typescript') || l.includes('ts')) return '.ts';
          if (l.includes('php')) return '.php';
          return '.txt';
        }

        const codeExt = extFromLang(msg.language);
        const codeFilename = `${folder}/${slugSafe}${codeExt}`;
        const mdFilename = `${folder}/${slugSafe}.md`;
        
        log('Preparing push with:', {folder, codeFilename, mdFilename, codeLength: msg.code.length});

        // prepare code file content and md content
        const codeContent = msg.code;
//         const mdContent = `# ${msg.title}

// ## Problem Statement

// ${msg.description || 'No description available'}

// ---

// ## Solution

// **Language:** ${msg.language || 'Unknown'}

// **Submitted at:** ${new Date().toISOString()}

// ---

// ## Source

// [View on LeetCode](${msg.link})

// *Saved by GitLeet Sync - Auto-push tool for LeetCode solutions*
// *Developed By Pratik Rathod*


// `;

const mdContent = `

<div style="border: 2px solid #00eaff; padding: 18px; border-radius: 10px; background: #0a0f1f; color: #e0faff;">

<h1 style="color:#00eaff;text-shadow:0 0 10px #00eaff;">⚡ ${msg.title || slugSafe}</h1>

<div style="border-left:4px solid #ff0099; padding-left:12px; margin:10px 0;">
<b>Source:</b> <a href="${msg.link}" style="color:#ff66cc;">LeetCode</a><br>
<b>Language:</b> ${msg.language || 'Unknown'}<br>
<b>Submitted:</b> ${new Date().toISOString()}<br>
${msg.difficulty ? `<b>Difficulty:</b> ${msg.difficulty}<br>` : ''}
${msg.tags ? `<b>Tags:</b> ${Array.isArray(msg.tags) ? msg.tags.join(', ') : msg.tags}<br>` : ''}
</div>

---

## <span style="color:#39ff14;text-shadow:0 0 8px #39ff14;">📘 Problem Statement</span>
${msg.description || 'No description available.'}

---

## <span style="color:#ff0099;text-shadow:0 0 8px #ff0099;">💡 Solution Code</span>

\`\`\`${(msg.language || '').toLowerCase().includes('python') ? 'python' :
          (msg.language || '').toLowerCase().includes('java') ? 'java' :
          (msg.language || '').toLowerCase().includes('cpp') || (msg.language || '').toLowerCase().includes('c++') ? 'cpp' :
          (msg.language || '').toLowerCase().includes('javascript') || (msg.language || '').toLowerCase().includes('js') ? 'javascript' :
          (msg.language || '').toLowerCase().includes('typescript') || (msg.language || '').toLowerCase().includes('ts') ? 'typescript' :
          'txt'}
${msg.code || '// Code not available'}
\`\`\`

---

## <span style="color:#00eaff;text-shadow:0 0 8px #00eaff;">📎 Notes</span>

- Original problem: <a href="${msg.link}" style="color:#ff66cc;">LeetCode Link</a>  
- Auto-saved via <b style="color:#39ff14;">GitLeet Sync</b>  
- Developed by <b style="color:#ff0099;">Pratik Rathod</b>  


---

## <span style="color:#ff66cc;text-shadow:0 0 8px #ff66cc;">🔗 Connect With Me</span>

- <b>LinkedIn:</b> <a href="https://linkedin.com/in/pratikk-rathod" style="color:#00eaff;">linkedin.com/in/pratikr8132</a>  
- <b>LeetCode Profile:</b> <a href="https://leetcode.com/pratikk_rathod" style="color:#39ff14;">leetcode.com/your-username</a>

</div>

`;


        // base64 encode
        const codeB64 = base64Encode(codeContent);
        const mdB64 = base64Encode(mdContent);

        // push code file
        const codeMsg = `Add solution ${slugSafe}${codeExt} (GitLeetSync)`;
        log('Pushing code file...');
        const codeRes = await putFileToGitHub(owner, repo, codeFilename, codeB64, codeMsg, branch, pat);
        if (!codeRes.ok) {
          // Try to read JSON body (GitHub returns helpful JSON) or fallback to text
          let txt = null;
          let parsed = null;
          try {
            const raw = await codeRes.text();
            txt = raw;
            try { parsed = JSON.parse(raw); } catch(e) { parsed = null; }
          } catch (e) {
            logWarn('Could not read error body from GitHub response', e);
          }

          // Log with parsed JSON if available
          if (parsed && parsed.message) {
            logError('Code push failed', codeRes.status, parsed);
          } else {
            logError('Code push failed', codeRes.status, txt);
          }

          // Provide a more actionable notification for common 403 causes
          if (codeRes.status === 403) {
            const hintParts = [];
            hintParts.push('403: Resource not accessible by token.');
            hintParts.push('Ensure your PAT has write access (classic: `repo` scope; or fine-grained: Repository Contents = Read & write).');
            hintParts.push('If the repo belongs to an organization, authorize the token for SSO.');
            hintParts.push('If the branch is protected, try a different branch in settings.');
            const hint = hintParts.join(' ');
            await notify('GitLeetSync: Push failed (403)', `${msg.title}: ${parsed && parsed.message ? parsed.message : 'Permission denied'}` + '\n' + hint);
          } else {
            await notify('GitLeetSync: Push failed', `Failed to push ${codeFilename}: ${codeRes.status} - ${parsed && parsed.message ? parsed.message : ''}`);
          }

          sendResponse({status: 'error', reason: 'code_push_failed', statusCode: codeRes.status, text: txt, json: parsed});
          return;
        }
        log('Code file pushed successfully');

        // push md file (problem statement)
        const mdMsg = `Add problem ${slugSafe}.md (GitLeetSync)`;
        log('Pushing markdown file...');
        const mdRes = await putFileToGitHub(owner, repo, mdFilename, mdB64, mdMsg, branch, pat);
        if (!mdRes.ok) {
          let txt = null;
          let parsed = null;
          try {
            const raw = await mdRes.text();
            txt = raw;
            try { parsed = JSON.parse(raw); } catch(e) { parsed = null; }
          } catch (e) {
            logWarn('Could not read error body from GitHub response', e);
          }

          logError('MD push failed', mdRes.status, parsed || txt);
          await notify('GitLeetSync: Push partial', `Code saved but failed to push .md: ${mdRes.status} ${parsed && parsed.message ? '- ' + parsed.message : ''}`);
          sendResponse({status: 'partial', codeStatus: codeRes.status, mdStatus: mdRes.status, text: txt, json: parsed});
          return;
        }

        log('All files pushed successfully to', `${owner}/${repo}/${folder}`);
        await notify('GitLeetSync: Pushed ✔', `${msg.title} saved to ${owner}/${repo}/${folder}`);
        sendResponse({status: 'ok', folder});
      } catch (e) {
        logError('Push error:', e);
        await notify('GitLeetSync Error', 'See console for details.');
        sendResponse({status: 'error', reason: e.message});
      }
    })();
    return true; // will sendResponse asynchronously
  }

  if (msg && msg.type === 'PUSH_FAILURE') {
    logWarn('Push failure reported:', {slug: msg.slug, reason: msg.reason});
    notify('GitLeetSync: Info', `Reason: ${msg.reason}`);
  }
});

log('Message listener registered successfully');
