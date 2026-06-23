import { getAllAcceptedSubmissions, getSubmissionAndProblemDetails } from "./leetcode_api.js";
import { pushBulkToGitHub, getExistingGitHubProblems } from "./github_api.js";
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

    progressCallback("Checking GitHub for already synced problems...");
    const existingSlugs = await getExistingGitHubProblems();
    
    // Filter out submissions that already exist in the GitHub repo
    const newSubmissions = submissions.filter(sub => {
      const safeSlug = sub.slug.replace(/[^a-z0-9-]/g, "").slice(0, 100);
      return !existingSlugs.has(safeSlug);
    });

    if (newSubmissions.length === 0) {
      progressCallback(`✅ Done! All ${submissions.length} problems are already synced to GitHub.`);
      return;
    }
    
    if (newSubmissions.length < submissions.length) {
      progressCallback(`Found ${newSubmissions.length} new problems to sync (skipped ${submissions.length - newSubmissions.length} already synced).`);
      // Small pause so the user can read the message before it scrolls away
      await new Promise(r => setTimeout(r, 1500));
    }

    progressCallback(`Starting detail fetch for ${newSubmissions.length} problems...`);
    const files = [];

    const CONCURRENCY = 5;
    for (let i = 0; i < newSubmissions.length; i += CONCURRENCY) {
      const chunk = newSubmissions.slice(i, i + CONCURRENCY);
      
      const chunkPromises = chunk.map(async (sub) => {
        const details = await getSubmissionAndProblemDetails(sub.id, sub.slug);
        if (!details || !details.question) {
          console.warn(`[bulk-sync] Skipping ${sub.slug} - missing problem details.`);
          return null;
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

        return [
          { path: `${folderName}/README.md`, content: buildProblemReadme(payload) },
          { path: `${folderName}/${paddedId}-${safeSlug}.${ext}`, content: buildSolutionFile(payload) }
        ];
      });

      const results = await Promise.all(chunkPromises);
      for (const res of results) {
        if (res) files.push(...res);
      }
      
      const processed = Math.min(i + CONCURRENCY, newSubmissions.length);
      progressCallback(`[${processed}/${newSubmissions.length}] Fetched data via concurrent batches...`);
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
