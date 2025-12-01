const patEl = document.getElementById('pat');
const ownerEl = document.getElementById('owner');
const repoEl = document.getElementById('repo');
const branchEl = document.getElementById('branch');
const folderTemplateEl = document.getElementById('folderTemplate');
const saveBtn = document.getElementById('saveBtn');
const testBtn = document.getElementById('testBtn');
const clearTokenBtn = document.getElementById('clearTokenBtn');

async function loadSettings(){
  console.log('[GitLeetSync Popup] Loading settings...');
  const s = await chrome.storage.sync.get(['pat','owner','repo','branch','folderTemplate']);
  patEl.value = s.pat || '';
  patEl.type = 'password'; // Always mask
  ownerEl.value = s.owner || '';
  repoEl.value = s.repo || '';
  branchEl.value = s.branch || 'main';
  folderTemplateEl.value = s.folderTemplate || 'leetcode/{language}/{slug}';
  console.log('[GitLeetSync Popup] Settings loaded:', {owner: s.owner, repo: s.repo});
}
loadSettings();

saveBtn.addEventListener('click', async () => {
  const payload = {
    pat: patEl.value.trim(),
    owner: ownerEl.value.trim(),
    repo: repoEl.value.trim(),
    branch: branchEl.value.trim() || 'main',
    folderTemplate: folderTemplateEl.value.trim() || 'leetcode/{language}/{slug}'
  };
  console.log('[GitLeetSync Popup] Saving settings:', {owner: payload.owner, repo: payload.repo, branch: payload.branch});
  await chrome.storage.sync.set(payload);
  console.log('[GitLeetSync Popup] Settings saved successfully');
  alert('Saved settings.');

  // Mask PAT field and make readonly, prevent copying
  patEl.type = 'password';
  patEl.readOnly = true;
  patEl.addEventListener('copy', (e) => e.preventDefault());
  patEl.addEventListener('contextmenu', (e) => e.preventDefault());
  patEl.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
    }
  });
});

// Launch a dry-run test by calling background
testBtn.addEventListener('click', async () => {
  console.log('[GitLeetSync Popup] Test button clicked');
  const settings = await chrome.storage.sync.get(['pat','owner','repo','branch','folderTemplate']);
  console.log('[GitLeetSync Popup] Sending TEST_SETTINGS to background');
  // background will simply verify credentials by calling GET repo endpoint (no write)
  chrome.runtime.sendMessage({type: 'TEST_SETTINGS', settings}, (resp) => {
    console.log('[GitLeetSync Popup] Test response:', resp);
    if (resp && resp.ok) {
      console.log('[GitLeetSync Popup] Test successful');
      alert('Test OK: Repository found and token works for reading.');
    } else {
      console.error('[GitLeetSync Popup] Test failed');
      alert('Test failed. Check console and settings.');
    }
  });
});

clearTokenBtn.addEventListener('click', async () => {
  await chrome.storage.sync.set({ pat: '' });
  patEl.value = '';
  patEl.readOnly = false;
  patEl.type = 'password';
  alert('Token cleared.');
});

console.log('[GitLeetSync Popup] Script loaded');
