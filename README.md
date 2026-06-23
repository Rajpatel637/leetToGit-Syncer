<div align="center">
  <img src="leetcode-syncer-extension/icons/icon128.png" alt="LeetCode to GitHub Syncer Logo" width="128" />
  <h1>LeetCode → GitHub Syncer</h1>
  <p><strong>Automatically sync your LeetCode solutions to GitHub</strong></p>
  
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![Contributions Welcome](https://img.shields.io/badge/Contributions-Welcome-brightgreen.svg)](#)
</div>

---

This repository contains two distinct, powerful tools to sync your LeetCode Accepted solutions directly into your GitHub repository. It perfectly organizes your solutions by problem ID, generates clean `README.md` files for each problem, and appends time/space complexity to your commits!

You can choose between a fully automatic **Browser Extension** or a manual **Python CLI Tool**.

## 🚀 1. The Browser Extension (Recommended)
The extension runs in the background of your browser and detects the *exact second* you get an "Accepted" result on LeetCode. It automatically fetches your code, runtime, and memory metrics, and pushes it directly to your GitHub repository without any manual intervention.

- **Zero-touch syncing:** Solve a problem, and it's instantly on your GitHub.
- **No backend servers:** Runs entirely locally in your browser for maximum security.
- **Smart commit messages:** Captures your exact runtime and memory percentiles.

👉 **[Read the setup guide for the Extension here](./leetcode-syncer-extension)**

---

## 💻 2. The Python CLI Tool
A robust command-line tool perfect for bulk downloading your past solutions, running scheduled backups, or syncing without installing a browser extension.

- **Bulk sync:** Pulls down all 50, 100, or 500 of your past accepted solutions at once.
- **Dry-run mode:** Preview how the folders will look locally before pushing to GitHub.
- **GitHub Actions support:** Can be scheduled to run automatically on a cron job.

👉 **[Read the setup guide for the Python CLI here](./leetcode-syncer/README.md)**

---

## 📂 Example Repository Structure
Regardless of which tool you use, your target GitHub repository will be beautifully organized like this:

```
Your-Repo/
├── 0001-two-sum/
│   ├── README.md       # Problem description and difficulty
│   └── 0001-two-sum.py # Your accepted code
├── 0217-contains-duplicate/
│   ├── README.md
│   └── 0217-contains-duplicate.cpp
└── ...
```

## 🔒 Security
Both tools use **GitHub Fine-Grained Personal Access Tokens**. Your credentials are NEVER sent to a third-party server. The extension uses `chrome.storage.local` to store your token safely, and the Python tool uses local `.env` files.

## 🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check the issues page if you want to contribute.
