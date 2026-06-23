# 🚀 LeetCode → GitHub Syncer Extension

This Chrome Extension is the ultimate, all-in-one tool to perfectly organize your LeetCode journey on GitHub.

## ✨ Features
1. **1-Click Bulk History Sync:** If you've already solved 100+ questions on LeetCode, this extension will fetch all of them and upload them to your GitHub repository in a single, blazing-fast commit (takes seconds).
2. **Zero-Touch Live Sync:** Every time you hit "Submit" on LeetCode and get an "Accepted" result, the extension silently captures your code, runtime, and memory, and pushes it to GitHub immediately.
3. **Beautiful Formatting:** Automatically generates perfect `README.md` files for every problem containing the difficulty, topics, and problem description.
4. **100% Secure:** Your GitHub Personal Access Token is stored securely in your browser's local storage. No third-party servers are ever involved.

## 📦 How to Install
*Since this extension is in active development, you will install it locally.*

1. Clone or download this repository to your computer.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top right corner).
4. Click **Load unpacked** in the top left corner.
5. Select the `leetcode-syncer-extension` folder.
6. The extension is now installed! Click the puzzle piece icon in Chrome and pin it to your toolbar.

## ⚙️ Setup & Usage

### 1. Get a GitHub Personal Access Token
1. Go to [https://github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **"Generate new token (classic)"**.
3. Give it a name (e.g., `LeetCode Syncer`).
4. Under **Select scopes**, tick the **`repo`** checkbox (this grants read/write access to your repositories).
5. Click **Generate token** and copy the value immediately.

### 2. Prepare your Repository
Create an **empty** public or private repository on GitHub (e.g., `yourusername/leetcode-solutions`). 
*Note: Make sure the repository has at least one file, like a `README.md`, so the `main` branch exists!*

### 3. Configure the Extension
1. Click the Extension icon in your Chrome toolbar.
2. Click the **gear icon (Settings)** to open the Options page.
3. Paste your **GitHub Token**.
4. Enter your Target Repository as `owner/repo-name` (e.g., `Rajpatel637/leetcode-solutions`).
5. Click **Save & Test Connection**.

### 4. Bulk Sync Your History (Optional)
If you want to upload all your past LeetCode solutions:
1. Ensure you are logged into LeetCode in your browser.
2. On the Extension Options page, look for the **🚀 Bulk History Sync** card.
3. Tick the optional checkbox: `Sync my previous questions to GitHub`.
4. Click **Start Bulk Sync** and watch the magic happen!

### 5. Live Auto-Sync
You're done! Now, just go to LeetCode and solve a new problem. The extension will automatically detect when you get an "Accepted" result and push it to your GitHub repository silently in the background.
