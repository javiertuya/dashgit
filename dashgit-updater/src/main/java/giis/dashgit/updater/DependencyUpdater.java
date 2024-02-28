package giis.dashgit.updater;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;

import giis.qabot.ci.clients.GitLocal;
import giis.qabot.ci.clients.IGitClient;
import giis.qabot.ci.models.Branch;
import giis.qabot.ci.models.Project;
import giis.qabot.ci.models.PullRequest;
import giis.qabot.core.models.Formatter;
import giis.qabot.core.models.Util;
import lombok.extern.slf4j.Slf4j;

/**
 * Core service to create combined dependency updates for a given project/repository.
 * Ported from QABot and reduced to remove all Spring Boot dependencies and callbacks,
 * now using automerge to merge the combined updates.
 * 
 * Restrictions: Dependabot update PRs must be generated against the main branch.
 */
@Slf4j
public class DependencyUpdater {
	private static final String COMBINED_BRANCH_PREFIX = "dashgit/combined/update";

	// only for combined updates, create the combined PR but does not delete branches nor merge
	private static final boolean WET_RUN = false;

	/**
	 * Creates a combined pull requests with all branches included in the indicated project
	 * and enables the automerge of the resulting PR.
	 * The combined changes are squashed and details on the included changes are shown in the description.
	 */
	public PullRequest runCreateCombinedProjectPr(IGitClient gitClient, GitLocal gitLocal, Project project,
			long rateLimitDelay) {
		log.info("**********************************************************");
		log.info("****** Rebase and automerge a combined pull request ******");
		log.info("Project {}", project.name());
		for (Branch branch : project.branches())
			log.info("Branch: {}", branch.name());
		log.info("**********************************************************");
		
		// Creates the combined update branch (only with no conflictng branches)
		// Note that the combined branch is created using main branch as the base
		String combinedBranch = getCombinedBranch(gitClient, gitLocal, project);
		if ("".equals(combinedBranch)) { // no hay actualizaciones que combinar
			log.warn("There are no updates to merge (or all updates have merge conflicts)");
			return null;
		}
		log.info("Combined branch created in local repo, name: {}", combinedBranch);
		gitLocal.push(false);

		// Creates the combined update PR.
		// Note that target branch is taken from the first PR, and it should be the main branch
		Formatter formatter = new Formatter();
		PullRequest refPr = project.branches().get(0).pullRequest();
		PullRequest pr = createCombinedPullRequest(gitClient, formatter, project, refPr, combinedBranch);
		log.info("Combined pull request created: {}", pr.title());

		// Cleanup (branches not included in the combined PR) and set comments
		finishCombinedPullRequest(gitClient, formatter, project, pr, rateLimitDelay);
		log.info("****** End rebase and automerge a combined pull request ******");
		log.info("**************************************************************");
		return pr;
	}

	/**
	 * Creates a local repository branch with all non conflicting changes,
	 * returning the branch name (empty if no branch has been included)
	 */
	private String getCombinedBranch(IGitClient gitClient, GitLocal gitLocal, Project project) {
		log.info("*** Create Combined Branch");
		String repoName = project.name();
		gitLocal.cloneRepository(repoName);
		// New branch to add to the combined PR
		String combinedBranch = COMBINED_BRANCH_PREFIX + "-" + gitLocal.getTimestamp();
		gitLocal.checkout(combinedBranch, true);
		int successCount = 0;
		// Adds each change (note that QABot used Cherry Pick, here we use merge with conflict resolver)
		for (Branch branch : project.branches()) {
			PullRequest pr = branch.pullRequest();
			log.info("Combine pull request: {}", pr.title());
			boolean success = gitLocal.merge(pr.sha(), pr.title(), new ConflictResolver());
			pr.canBeMerged(success);
			pr.cantBeMergedReason(success ? "" : "cannot be merged");
			branch.buildSummary(); // propagates the status (needed in dashgit?)
			successCount += success ? 1 : 0;
		}
		// Push is not done here, the calling method will do it if there have been any success
		return successCount > 0 ? combinedBranch : "";
	}

	private PullRequest createCombinedPullRequest(IGitClient gitClient, Formatter formatter, Project project,
			PullRequest refPr, String combinedBranch) {
		log.info("*** Create Combined Pull Request");
		// Sets the description to show the updates that have (and haven't) been merged
		StringBuilder successSb = new StringBuilder();
		StringBuilder failSb = new StringBuilder();
		List<String> labels = new ArrayList<>();
		for (Branch branch : project.branches()) {
			PullRequest pr = branch.pullRequest();
			if (Boolean.TRUE == pr.canBeMerged()) {
				successSb.append("\n- " + formatter.url(pr.title(), pr.htmlUrl()));
				for (String label : pr.labels()) // sets labels avoiding reptitions
					if (!labels.contains(label))
						labels.add(label);
			} else {
				failSb.append("\n- " + formatter.url(pr.title(), pr.htmlUrl()));
			}
		}
		String title = "Combined dependency updates (" + new SimpleDateFormat("yyyy-MM-dd").format(new Date()) + ")";
		String description = "Includes these updates:" + successSb.toString();
		if (failSb.length() > 0)
			description += "\n\nDoes not include these updates because of merge conflicts:" + failSb.toString();

		// New combined PR
		return gitClient.createPullRequest(project.name(), combinedBranch, refPr.targetBranch(), title, description,
				refPr.assignee(), labels, true, true, true);
	}

	private void finishCombinedPullRequest(IGitClient gitClient, Formatter formatter, Project project,
			PullRequest newPr, long rateLimitDelay) {
		log.info("*** Finish Combined Pull Request");
		for (Branch branch : project.branches()) {
			PullRequest pr = branch.pullRequest();
			if (Boolean.TRUE == pr.canBeMerged()) { // no deberia ser nulo al haberse determinado ya mergeabilty
				gitClient.addPullRequestCommment(pr, "This has been included in the combined pull request "
						+ formatter.url(newPr.title(), newPr.htmlUrl()));
				log.info("Remove branch: {}, project: {}", newPr.sourceBranch(), newPr.repoName());
				if (!WET_RUN)
					gitClient.deleteBranch(pr.fullName(), pr.sourceBranch());
			} else {
				gitClient.addPullRequestCommment(pr, "This has not been included in the combined pull request "
						+ formatter.url(newPr.title(), newPr.htmlUrl()) + " because of potential merge conflicts");
			}
			Util.delay(rateLimitDelay); // separa acciones para evitar secondary rate limits en github
		}
	}

}
