/**
 * github_builder.js — Phase 7: Markdown and File Builders
 *
 * Ports the exact CLI logic from builder.py to generate:
 *   - Per-problem README.md
 *   - Per-problem solution.{ext} with header comments
 *
 * All functions are pure and only deal with string manipulation.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Maps
// ─────────────────────────────────────────────────────────────────────────────

const EXTENSION_MAP = {
  python3: "py", python: "py", cpp: "cpp", java: "java", c: "c",
  csharp: "cs", javascript: "js", typescript: "ts", go: "go",
  rust: "rs", kotlin: "kt", swift: "swift", scala: "scala",
  ruby: "rb", php: "php", mysql: "sql", bash: "sh",
};

const LABEL_MAP = {
  python3: "Python", python: "Python", cpp: "C++", java: "Java", c: "C",
  csharp: "C#", javascript: "JavaScript", typescript: "TypeScript", go: "Go",
  rust: "Rust", kotlin: "Kotlin", swift: "Swift", scala: "Scala",
  ruby: "Ruby", php: "PHP", mysql: "SQL", bash: "Bash",
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getExtension(lang) {
  return EXTENSION_MAP[lang] || "txt";
}

export function getLanguageLabel(lang) {
  return LABEL_MAP[lang] || lang;
}

function difficultyEmoji(diff) {
  return { Easy: "🟢", Medium: "🟡", Hard: "🔴" }[diff] || "⚪";
}

function commentPrefix(lang) {
  if (["python3", "python", "ruby", "bash"].includes(lang)) return "#";
  if (["mysql"].includes(lang)) return "--";
  return "//";
}

function padId(id) {
  return String(id).padStart(4, "0");
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML to Markdown
// ─────────────────────────────────────────────────────────────────────────────

export function htmlToMarkdown(html) {
  if (!html) return "_No description available._";

  let md = html;

  // Code blocks
  md = md.replace(/<pre>([\s\S]*?)<\/pre>/g, "\n```\n$1\n```\n");
  // Inline code
  md = md.replace(/<code>([\s\S]*?)<\/code>/g, "`$1`");
  // Bold
  md = md.replace(/<strong>([\s\S]*?)<\/strong>/g, "**$1**");
  md = md.replace(/<b>([\s\S]*?)<\/b>/g, "**$1**");
  // Italic
  md = md.replace(/<em>([\s\S]*?)<\/em>/g, "*$1*");
  // Paragraphs
  md = md.replace(/<p>([\s\S]*?)<\/p>/g, "$1\n\n");
  // List items
  md = md.replace(/<li>([\s\S]*?)<\/li>/g, "- $1\n");
  md = md.replace(/<[ou]l>([\s\S]*?)<\/[ou]l>/g, "$1\n");
  // Superscript/Subscript
  md = md.replace(/<sup>([\s\S]*?)<\/sup>/g, "^$1");
  md = md.replace(/<sub>([\s\S]*?)<\/sub>/g, "_$1");
  // Line breaks
  md = md.replace(/<br\s*\/?>/g, "\n");

  // Strip all remaining HTML tags
  md = md.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  const entities = {
    "&lt;": "<", "&gt;": ">", "&amp;": "&",
    "&quot;": '"', "&#39;": "'", "&nbsp;": " ",
    "&le;": "≤", "&ge;": "≥", "&ne;": "≠",
  };
  for (const [entity, char] of Object.entries(entities)) {
    md = md.split(entity).join(char);
  }

  // Collapse 3+ newlines to 2
  md = md.replace(/\n{3,}/g, "\n\n");

  return md.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// File Builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the per-problem README.md string
 * @param {Object} p The payload from sync_orchestrator
 */
export function buildProblemReadme(p) {
  const emoji = difficultyEmoji(p.difficulty);
  const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const topics = p.topics && p.topics.length ? p.topics.map(t => `\`${t}\``).join(" ") : "`Uncategorized`";
  const url = `https://leetcode.com/problems/${p.slug}/`;
  const descMd = htmlToMarkdown(p.content);
  const langLabel = getLanguageLabel(p.lang);

  return `# ${padId(p.questionId)}. ${p.title}

> **[View on LeetCode](${url})** &nbsp;|&nbsp; ${emoji} ${p.difficulty}

## 📊 Details

| Field | Info |
|-------|------|
| **Difficulty** | ${emoji} ${p.difficulty} |
| **Topics** | ${topics} |
| **Language** | ${langLabel} |
| **Runtime** | ${p.runtime} |
| **Memory** | ${p.memory} |
| **Solved** | ${date} |

---

## 📝 Problem

${descMd}

---

## 💡 Solution

\`\`\`${p.lang}
${p.code}
\`\`\`
`;
}

/**
 * Build the per-problem solution code file with header comments
 * @param {Object} p The payload from sync_orchestrator
 */
export function buildSolutionFile(p) {
  const prefix = commentPrefix(p.lang);
  const date = new Date().toISOString().split("T")[0];
  const url = `https://leetcode.com/problems/${p.slug}/`;
  const topics = p.topics && p.topics.length ? p.topics.join(", ") : "Uncategorized";
  const sep = `${prefix} ` + "-".repeat(57);
  const paddedId = padId(p.questionId);

  // Sanitize all LeetCode-sourced fields against newline injection.
  // A crafted newline in a title could produce extra lines that look like
  // valid code inside the solution file.
  const safeTitle   = (p.title      || "").replace(/[\r\n`]/g, " ").trim();
  const safeDiff    = (p.difficulty || "").replace(/[\r\n]/g,  " ").trim();
  const safeTopics  = topics.replace(/[\r\n]/g, " ");
  const safeRuntime = (p.runtime    || "N/A").replace(/[\r\n]/g, " ").trim();
  const safeMemory  = (p.memory     || "N/A").replace(/[\r\n]/g, " ").trim();

  const header = `${prefix} ${paddedId}. ${safeTitle}
${prefix} Difficulty : ${safeDiff}
${prefix} Topics     : ${safeTopics}
${prefix} Runtime    : ${safeRuntime}  |  Memory : ${safeMemory}
${prefix} Solved     : ${date}
${prefix} Link       : ${url}
${sep}
`;

  return header + "\n" + p.code;
}
