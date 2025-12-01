# GitLeetSync Extension - Troubleshooting Guide

## Issue: "Extension context invalidated" Error

**What it means:** The extension reloaded while trying to send a message to GitHub.

**Solution:** This is usually a one-time issue that happens during development/updates. Simply:
1. **Reload the extension**: `chrome://extensions` → GitLeetSync → Click Reload
2. **Submit another solution** - it should work on the next attempt

The error handling is now improved to not crash the extension.

---

## Issue: Language Detected as 'txt'

**What it means:** The extension couldn't find which programming language was used.

**To debug:**
1. Go to a LeetCode problem page
2. Press **`Ctrl+Shift+D`** 
3. Check the console output to see what language was detected
4. Share the output if it's wrong

**The extension now tries these methods in order:**
- Language selector dropdown (select element)
- Data attributes
- aria-label attributes on buttons
- Text content of visible elements

---

## Issue: Code Not Found

**What it means:** The extension found the "Accepted" message but couldn't extract your code.

**To debug:**
1. Make sure you have code visible in the editor
2. Press **`Ctrl+Shift+Y`** to manually trigger a push while looking at the problem
3. Check console for: `Code found: ...` message

---

## Manual Push (Always Works!)

**If auto-push isn't working**, manually trigger it:

1. Submit a solution on LeetCode
2. **Once it shows "Accepted"**, press **`Ctrl+Shift+Y`**
3. Watch the console for success message

---

## How to View Logs

### On LeetCode Page (Content Script Logs):
1. Open DevTools: **F12**
2. Go to **Console** tab
3. Submit a solution
4. Look for logs starting with `[GitLeetSync]`

### Background Service Worker Logs:
1. Go to `chrome://extensions`
2. Find "GitLeetSync"
3. Click **"Details"** → **"Inspect views: service_worker"**
4. View logs in the opened DevTools Console

---

## Expected Log Flow

When you submit and it's **Accepted**:

```
[GitLeetSync] Detected accepted submission: Accepted
637 / 637 testcases passed

[GitLeetSync] onAcceptedDetected called: {slug: '...', title: '...', language: 'python'}

[GitLeetSync] Code extracted successfully, length: 461

[GitLeetSync] Sending push request to background...

[GitLeetSync] ✅ Push successful: {status: 'ok', folder: 'leetcode/python/...'}
```

---

## Settings Test

1. Click extension icon
2. Enter your GitHub details
3. Click **"Test Push (dry-run)"**
4. Should see: `Test OK: Repository found and token works for reading.`

If it fails:
- Check your PAT (Personal Access Token) is valid
- Make sure owner and repo name are correct
- Verify PAT has `repo` scope enabled
