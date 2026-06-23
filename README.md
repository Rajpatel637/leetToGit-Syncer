<div align="center">
  <img src="leetcode-syncer-extension/icons/icon128.png" alt="LeetCode to GitHub Syncer Logo" width="128" />
  <h1>LeetCode → GitHub Syncer</h1>
  <p><strong>The ultimate Chrome Extension to seamlessly sync your LeetCode progress to GitHub.</strong></p>
  
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![Contributions Welcome](https://img.shields.io/badge/Contributions-Welcome-brightgreen.svg)](#)
</div>

---

**LeetCode → GitHub Syncer** is a powerful Chrome Extension that fully automates the process of saving your LeetCode solutions. It captures your code, runtime, memory usage, and the problem description, then perfectly organizes everything into your GitHub repository.

Whether you are solving your first problem today or you already have 500+ solved problems in your history, this extension handles it all effortlessly.

---

## ✨ Key Features

### 🚀 1-Click Bulk History Sync
Already have hundreds of solved problems? No problem. With a single click, the extension fetches your entire LeetCode history and uploads it to GitHub in **one lightning-fast commit** using the GitHub Trees API. 

### ⚡ Zero-Touch Live Auto-Sync
Once installed, just use LeetCode normally. The exact second you get an "Accepted" result, the extension silently pushes your code directly to GitHub in the background.

### 📝 Beautiful Markdown Generation
It doesn't just push code! For every single problem, it automatically generates a clean `README.md` file containing the problem description, difficulty, topic tags, and your exact runtime/memory percentiles.

### 🔒 100% Secure & Private
- **No Third-Party Servers:** Everything runs entirely locally inside your browser.
- **No Passwords:** It uses your active browser session. You never have to manually copy or expose your LeetCode session cookies.
- **Direct to GitHub:** Your GitHub Personal Access Token is saved securely in your browser's local storage and used only to communicate directly with `api.github.com`.

---

## 📦 How to Install the Extension

*The extension is currently loaded manually as it is in active development.*

1. **Clone or Download** this repository to your local machine.
2. Open Google Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle in the top right corner.
4. Click **Load unpacked** in the top left corner.
5. Select the `leetcode-syncer-extension` folder.
6. The extension is now installed! Pin it to your Chrome toolbar for easy access.

---

## ⚙️ Setup Instructions

### 1. Generate a GitHub Token
1. Go to your [GitHub Token Settings](https://github.com/settings/tokens).
2. Click **Generate new token (classic)**.
3. Under **Select scopes**, check the **`repo`** box (this grants read/write access so it can push code).
4. Generate the token and copy the value.

### 2. Prepare your Repository
Create an **empty** public or private repository on GitHub (e.g., `yourusername/leetcode-solutions`). 
*(Tip: Check the box to "Add a README file" when creating it so the `main` branch is initialized).*

### 3. Connect the Extension
1. Click the Extension icon in Chrome and hit the **Gear Icon (Settings)**.
2. Paste your GitHub Token.
3. Enter your Target Repository as `owner/repo-name` (e.g., `YourUsername/leetcode-solutions`).
4. Click **Save & Test Connection**.

### 4. Sync Your History!
If you have past solutions, tick the optional `Sync my previous questions` box on the settings page and click **Start Bulk Sync**. The extension will grab all your old solutions and push them instantly. 

For all future problems, you don't need to do anything. Just solve problems on LeetCode and they will automatically sync!

---

## 📂 Example Repository Output
Your GitHub repository will be beautifully organized like this:

```
Your-Repo/
├── 0001-two-sum/
│   ├── README.md       # Problem description and difficulty
│   └── 0001-two-sum.py # Your accepted code with comments
├── 0217-contains-duplicate/
│   ├── README.md
│   └── 0217-contains-duplicate.cpp
└── ...
```

---

## 🤝 Contributing
Contributions, issues, and feature requests are welcome! If you want to improve the extension, feel free to open a Pull Request.
