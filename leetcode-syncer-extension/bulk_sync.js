import { getAllAcceptedSubmissions, getSubmissionAndProblemDetails } from "./leetcode_api.js";
import { pushBulkToGitHub } from "./github_api.js";
import { buildProblemReadme, buildSolutionFile, getExtension } from "./github_builder.js";

/**
 * Orchestrates the full historical bulk sync process.
 * 1. Fetches all unique accepted submissions.
 * 2. Fetches details + code for each.
 * 3. Builds markdown and code files in memory.
 * 4. Pushes everything at once via GitHub Trees API.
 * 
 * @param {Function} progressCallback - Receives status string updates
 */
export async function startBulkSync(progressCallback) {
  try {
    progressCallback("Fetching list of all solved problems...");
    const submissions = await getAllAcceptedSubmissions((count) => {
      progressCallback(`Found ${count} solved problems...`);
    });

    if (submissions.length === 0) {
      progressCallback("✅ Done! No solved problems found on this LeetCode account.");
      return;
    }

    progressCallback(`Starting detail fetch for ${submissions.length} problems...`);
    const files = [];

    for (let i = 0; i < submissions.length; i++) {
      const sub = submissions[i];
      progressCallback(`[${i + 1}/${submissions.length}] Fetching ${sub.title}...`);
      
      const details = await getSubmissionAndProblemDetails(sub.id, sub.slug);
      if (!details || !details.question || !details.codeDetails) {
        console.warn(`[bulk-sync] Skipping ${sub.slug} - missing details.`);
        continue;
      }

      // Build payload matching github_builder format
      const payload = {
        questionId: details.question.questionId,
        title: details.question.title,
        slug: details.question.titleSlug,
        difficulty: details.question.difficulty,
        content: details.question.content,
        topics: details.question.topicTags ? details.question.topicTags.map(t => t.name) : [],
        lang: sub.lang,
        runtime: details.codeDetails.runtimeDisplay || sub.runtime,
        memory: details.codeDetails.memoryDisplay || sub.memory,
        code: details.codeDetails.code || "// Code not found",
        runtimePercentile: details.codeDetails.runtimePercentile,
        memoryPercentile: details.codeDetails.memoryPercentile,
      };

      // Folder naming convention
      const paddedId = String(payload.questionId).padStart(4, "0");
      const safeSlug = payload.slug.replace(/[^a-z0-9-]/g, "").slice(0, 100);
      const folderName = `${paddedId}-${safeSlug}`;

      const ext = getExtension(payload.lang);
      const readmePath = `${folderName}/README.md`;
      const solutionPath = `${folderName}/${paddedId}-${safeSlug}.${ext}`;

      files.push({
        path: readmePath,
        content: buildProblemReadme(payload)
      });
      files.push({
        path: solutionPath,
        content: buildSolutionFile(payload)
      });

      // Safe rate-limit delay to avoid LeetCode IP ban (HTTP 429)
      if (i < submissions.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    progressCallback(`Packaging ${files.length} files and pushing to GitHub (this takes a few seconds)...`);
    await pushBulkToGitHub(files, `Bulk sync ${submissions.length} past LeetCode submissions`);
    progressCallback("✅ Bulk Sync Complete! All files pushed to GitHub.");

  } catch (err) {
    console.error("[bulk-sync] Error:", err);
    progressCallback(`❌ Error: ${err.message}`);
    throw err; // Re-throw to let caller handle if needed
  }
}
