# 🧩 LeetCode → GitHub Syncer

A Python CLI tool that automatically fetches all your accepted LeetCode solutions
and pushes them to a GitHub repository — complete with per-problem READMEs,
a master progress dashboard, and a GitHub Actions workflow for daily auto-sync.

---

## ✨ Features

- ✅ Fetches all Accepted submissions automatically (paginated, de-duplicated)
- ✅ Groups problems by **Difficulty → Topic → Problem** folder structure
- ✅ Generates per-problem `README.md` with description, metadata table, and solution
- ✅ Generates master `README.md` with a progress dashboard and topic breakdown
- ✅ Single GitHub commit per sync run (clean, linear git history)
- ✅ GitHub Actions workflow for daily auto-sync at midnight UTC
- ✅ Dry-run mode — preview all generated files locally before pushing
- ✅ Supports all LeetCode languages (Python, C++, Java, Go, Rust, and more)

---

## 📋 Prerequisites

- **Python 3.11+**
- A **LeetCode account** with solved problems
- A **GitHub account** with a dedicated (empty) repo for your solutions
- A **GitHub Personal Access Token** with `repo` scope

---

## 🚀 Setup

### Step 1 — Clone, create a virtual environment, and install

```powershell
git clone https://github.com/yourusername/leetcode-syncer.git
cd leetcode-syncer

# Create a virtual environment (keeps your system Python clean)
python -m venv .venv

# Activate it (Windows PowerShell)
.venv\Scripts\Activate.ps1

# Install the two dependencies
pip install -r requirements.txt
```

> **Tip:** To deactivate the venv when done, type `deactivate`.
> The `.venv/` folder is already in `.gitignore` so it will never be committed.

### Step 2 — Get your LeetCode cookies

Your session cookie authenticates the tool as your LeetCode account.
It is never stored anywhere except your local `.env` file.

1. Go to [https://leetcode.com](https://leetcode.com) and log in
2. Open DevTools: press **F12** (or right-click → Inspect)
3. Navigate to: **Application** tab → **Cookies** → `https://leetcode.com`
4. Copy the value of **`LEETCODE_SESSION`**
5. Copy the value of **`csrftoken`**

> **Note:** Cookies expire after approximately 2 weeks. Re-copy them if you
> see authentication errors.

### Step 3 — Get a GitHub Personal Access Token

1. Go to [https://github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **"Generate new token (classic)"**
3. Give it a name, e.g. `leetcode-syncer`
4. Under **Select scopes**, tick **`repo`** (full control of private repositories)
5. Click **Generate token** and copy the value immediately (it won't be shown again)

### Step 4 — Create your solutions repository

Create an **empty** public or private GitHub repository where your solutions
will be pushed, e.g. `yourname/leetcode-solutions`.

> **Important:** The repo must exist before running the syncer. It does not
> need any files — the syncer will create everything including `README.md`.

### Step 5 — Configure `.env`

```powershell
# Windows PowerShell
copy .env.example .env
```

Open `.env` in any text editor and fill in all values:

```env
LEETCODE_SESSION=<paste your LEETCODE_SESSION cookie value>
LEETCODE_CSRF_TOKEN=<paste your csrftoken cookie value>
LEETCODE_USERNAME=<your LeetCode username>

GITHUB_TOKEN=<paste your Personal Access Token>
GITHUB_REPO=yourname/leetcode-solutions
GITHUB_BRANCH=main

REQUEST_DELAY=0.5
MAX_SUBMISSIONS=0
```

> **Security:** `.env` is listed in `.gitignore` and will never be committed.
> Your credentials stay on your local machine only.

### Step 6 — Verify the setup locally

Before doing a full sync, run these two scripts to catch any issues early:

```powershell
# 1. Check all imports are wired correctly (no credentials needed)
python check_imports.py

# 2. Quick live test — authenticates, fetches 3 problems, writes to ./test_output/
python test_local.py
```

`check_imports.py` runs entirely offline and validates every module, all
computed properties, and the builder output. `test_local.py` makes real API
calls and writes actual files so you can inspect the output before pushing.

---

## 💻 Usage

### Full sync to GitHub

```bash
python sync.py
```

Fetches all solved problems, builds the complete file tree, and pushes
everything to GitHub in a single commit.

### Dry-run: preview files locally without pushing

```bash
python sync.py --dry-run --output-dir ./preview
```

Generates all files into `./preview/` on your local machine so you can
inspect the output before committing to a push.

### Sync only the latest N problems

```bash
python sync.py --max 50
```

Useful for a first test run — fetches and pushes only the 50 most recent
accepted submissions.

### Custom commit message

```bash
python sync.py --commit-msg "Weekly LeetCode sync"
```

### Slower request rate (if you hit rate limits)

```bash
python sync.py --delay 1.0
```

### All available flags

| Flag | Default | Description |
|------|---------|-------------|
| `--dry-run` | off | Write files locally, skip GitHub push |
| `--output-dir DIR` | `./output` | Destination for dry-run files |
| `--max N` | `0` (all) | Max problems to fetch per run |
| `--delay SECONDS` | `.env` value | Seconds between API requests |
| `--commit-msg MSG` | auto-generated | Custom GitHub commit message |
| `--no-auth-check` | off | Skip LeetCode auth pre-flight check |

Run `python sync.py --help` for the full help text.

---

## ⚙️ GitHub Actions — Daily Auto-Sync

The included `.github/workflows/sync.yml` runs `sync.py` every day at
**midnight UTC** automatically. It can also be triggered manually from the
GitHub Actions tab at any time.

### Adding secrets to GitHub

1. Go to your **syncer repo** on GitHub
2. Navigate to: **Settings → Secrets and variables → Actions**
3. Click **"New repository secret"** and add each of the following:

| Secret name | Value |
|-------------|-------|
| `LEETCODE_SESSION` | Your `LEETCODE_SESSION` cookie value |
| `LEETCODE_CSRF_TOKEN` | Your `csrftoken` cookie value |
| `LEETCODE_USERNAME` | Your LeetCode username |
| `GITHUB_REPO` | `yourname/leetcode-solutions` |
| `GITHUB_BRANCH` | `main` |

> **`GITHUB_TOKEN` is automatically provided by GitHub Actions — do not add it manually.**

Once secrets are added, the workflow will run on its own schedule.
You can also click **"Run workflow"** in the Actions tab to trigger it immediately.

---

## 📁 Output Structure

```
solutions/
├── Easy/
│   ├── Array/
│   │   ├── 0001-Two-Sum/
│   │   │   ├── README.md         # Problem description + metadata table
│   │   │   └── solution.py       # Solution with header comment
│   │   └── 0026-Remove-Duplicates-from-Sorted-Array/
│   │       ├── README.md
│   │       └── solution.py
│   └── String/
│       └── 0020-Valid-Parentheses/
│           ├── README.md
│           └── solution.py
├── Medium/
│   └── Dynamic-Programming/
│       └── 0070-Climbing-Stairs/
│           ├── README.md
│           └── solution.py
└── Hard/
    └── ...

README.md                         # Auto-generated master dashboard
```

---

## ❓ FAQ

**Q: My session cookie expired — how do I update it?**
A: Re-copy `LEETCODE_SESSION` and `csrftoken` from your browser DevTools and
update your `.env` file. For GitHub Actions, also update the corresponding
repo secrets. LeetCode cookies typically last about 2 weeks.

**Q: Can I use this with multiple programming languages?**
A: Yes. The tool auto-detects the language per submission and uses the correct
file extension (`solution.py`, `solution.cpp`, `solution.java`, etc.).

**Q: Will it overwrite my existing solutions if I run it again?**
A: Files are created or updated if content changed. The tool **never deletes**
any file from the repository — it only adds and updates.

**Q: How do I run it for the first time safely?**
A: Use `--dry-run --max 10` to inspect 10 generated files locally, then run
without flags when you're happy with the output.

```bash
# Safe first run
python sync.py --dry-run --max 10 --output-dir ./preview

# Full sync when ready
python sync.py
```

**Q: What if a problem's code can't be fetched?**
A: The syncer will write `# Code not available` as a placeholder in the
solution file and continue. No problems are silently skipped.

**Q: Where can I learn more about GitHub Actions?**
A: See the [GitHub Actions documentation](https://docs.github.com/en/actions)
and the [Encrypted secrets guide](https://docs.github.com/en/actions/security-guides/encrypted-secrets).

---

## 🛡️ Security

- Credentials are stored **only** in your local `.env` file (git-ignored)
- The `LEETCODE_SESSION` cookie accesses only **your own account data**
- The GitHub token is scoped to `repo` only — no org, admin, or delete permissions
- Rate limiting (0.5s delay) is built in to be a respectful API client
- No third-party servers are involved — all requests go directly to
  `leetcode.com` and `api.github.com`

---

*Built with Python 3.11 · requests · python-dotenv · GitHub Git Trees API*
