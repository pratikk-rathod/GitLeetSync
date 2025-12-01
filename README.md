# GitLeetSync Extension - Quick Start Guide

## ✅ Installation & Setup

### 1. Load Extension in Chrome
1. Go to `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select this folder: `d:\New folder (3)\gitGitLeetSync-ext`

### 2. Configure Settings
1. Click the **GitGitLeetSync** icon in your Chrome toolbar
2. Enter your settings:
   - **GitHub Personal Access Token** - Create at github.com/settings/tokens
   - **Repo Owner** - Your GitHub username
   - **Repo Name** - Name of your solutions repo
   - **Branch** - Usually `main`
   - **Folder template** - e.g., `leetcode/{language}/{slug}`

3. Click **Save**
4. Click **Test Push (dry-run)** to verify settings work

---

## 🚀 How to Use

### Automatic Push (Recommended)
1. Go to a **LeetCode problem**
2. Write and **submit your solution**
3. **Once it's Accepted**, the extension automatically pushes to GitHub
4. Watch the **Console (F12)** for logs starting with `[GitLeetSync]`

### Manual Push (If Auto-Push Doesn't Work)
1. Have your code ready in the editor
2. Press **`Ctrl+Shift+Y`** to manually trigger a push
3. Check console for success/error messages

---

## 🐛 Debugging

### View Console Logs
- **On LeetCode page**: Press **F12** → Go to **Console** tab
- **Background service worker**: 
  - Go to `chrome://extensions`
  - Find GitLeetSync → Click **Details**
  - Click **"Inspect views: service_worker"**
  - View logs in DevTools console

### Check What's Being Detected
1. Go to a LeetCode problem page
2. Press **`Ctrl+Shift+D`**
3. Check console output - should show:
   - Problem slug
   - Problem title
   - Programming language
   - Code preview (first 100 chars)
   - Description length

---

## 📋 Expected Console Output

When you **submit and get Accepted**:

```
[GitLeetSync] ✅ Content script loaded on https://leetcode.com/problems/...
[GitLeetSync] Watching for accepted submissions...
[GitLeetSync] Keyboard shortcuts:
[GitLeetSync]   Ctrl+Shift+Y = Manually trigger push
[GitLeetSync]   Ctrl+Shift+D = Show debug info
[GitLeetSync] Detected accepted submission: Accepted
721 / 721 testcases passed
[GitLeetSync] onAcceptedDetected called: {slug: '...', title: '...', language: 'python'}
[GitLeetSync] Attempting to extract code...
[GitLeetSync] Code extracted successfully, length: 450
[GitLeetSync] Extracting problem description...
[GitLeetSync] Sending push request to background...
[GitLeetSync] ✅ Push successful: {status: 'ok', folder: 'leetcode/python/...'}
```

---

## ⚠️ Troubleshooting

### Issue: "Extension context invalidated" Error
**Cause**: Extension reloaded while sending message  
**Fix**: 
1. Go to `chrome://extensions`
2. Click **Reload** on GitLeetSync
3. Try submitting again

### Issue: Language Detected as 'txt'
**Cause**: Couldn't find language selector  
**Debug**: 
1. Press **`Ctrl+Shift+D`** on the problem page
2. Check what language it shows
3. Make sure language selector is visible in editor

### Issue: Code Not Found
**Cause**: Couldn't extract code from editor  
**Debug**:
1. Make sure you have code in the editor
2. Press **`Ctrl+Shift+Y`** to manually trigger
3. Check console for where code extraction failed

### Issue: "Test Push" Failed
**Causes**:
- Invalid GitHub token
- Wrong username/repo name
- PAT doesn't have `repo` scope
- Repo doesn't exist

**Fix**: Double-check all settings in popup

---

## 🔑 GitHub Personal Access Token Setup

1. Go to https://github.com/settings/tokens
2. Click **Generate new token (classic)**
3. Set expiration to 90 days
4. **MUST check these scopes:**
   - ✅ `repo` (full control of private repositories)
5. Click **Generate token**
6. **Copy immediately** (won't show again!)
7. Paste into extension popup

---

## 📁 Folder Structure in GitHub

Files are saved like:
```
your-repo/
├── leetcode/
│   ├── python/
│   │       └──two-sum/ 
|   |             ├──two-sum.py
│   │             └── two-sum.md
│   │   
│   │   
│   └── javascript/
│           └── contains-duplicate/
|                 ├── contains-duplicate.js
│                 └── contains-duplicate.md
```

You can customize the template in settings!

---

## 🎮 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+Y` | Manually trigger push |
| `Ctrl+Shift+D` | Show debug info |

---

## ✨ Features

- ✅ **Auto-push on accepted** - Automatically pushes when you solve a problem
- ✅ **Code + Description** - Saves both solution and problem statement
- ✅ **Multiple languages** - Detects Python, Java, C++, JavaScript, etc.
- ✅ **Customizable folders** - Use templates like `{language}/{slug}/{title}`
- ✅ **Manual push** - Use `Ctrl+Shift+Y` if auto-push doesn't work
- ✅ **Detailed logging** - Debug mode to see exactly what's happening

---

## 🔒 Security
- Your GitHub token is always masked and cannot be copied from the popup
- Token is stored locally in Chrome and never sent anywhere except GitHub
- No sensitive data is ever logged
- You can clear the token at any time using the 'Clear Token' button
- All API calls use HTTPS
- Extension only communicates with LeetCode and GitHub
- Security warning is shown in the popup

## 🏷️ Versioning & Releases
- Current version: 1.0.1
- All changes are tracked in `CHANGELOG.md`
- To release a new version:
  1. Update `manifest.json` version
  2. Add changes to `CHANGELOG.md`
  3. Commit and push to your GitHub repo
  4. Tag the release in GitHub

## ✨ New Features in 1.0.1
- Token field is always masked and protected from copying
- Token can be cleared with a button in the popup
- Security warning added to popup
- Version bumped for release tracking

---

## 📞 Support

If something isn't working:
1. Check the console logs (`F12`)
2. Try the debug command (`Ctrl+Shift+D`)
3. Try manual push (`Ctrl+Shift+Y`)
4. Reload the extension (`chrome://extensions` → Reload)
5. Check TROUBLESHOOTING.md for detailed help
6. Connect with me on LinkedIn
