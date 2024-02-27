package giis.dashgit.updater.test;

import java.io.IOException;

import org.junit.Test;

import giis.dashgit.updater.DependencyUpdater;
import giis.qabot.ci.clients.GitLocal;
import giis.qabot.ci.clients.GithubGitClient;
import giis.qabot.ci.clients.IGitClient;
import giis.qabot.ci.models.Project;
import giis.qabot.ci.models.PullRequest;
import giis.qabot.core.models.Formatter;
import lombok.extern.slf4j.Slf4j;

/**
 * A full IT scenario of dependency updates, including
 * - Aggregation of more than one update
 * - Conflicting updates (because of adjacent changes)
 * 
 * Requires a dedicated repository and configuration file (see readme for configuration details).
 * 
 * This is the GitHub test, GitLab test uses a subclass of this.
 */
@Slf4j
public class TestItGithubLiveUpdates extends Base {

	protected DependencyUpdater updateService = new DependencyUpdater();
	protected Config config;

	// Override these methods to handle a different git provider
	
	protected Config setUpConfig() {
		return new Config().read("github");
	}

	protected IGitClient getGitClient() {
		return new GithubGitClient(config.server(), config.user(), config.token(), true);
	}

	protected GitLocal getGitLocal() {
		return new GitLocal("target", config.server(), config.user(), config.token());
	}

	/**
	 * Combined update process from a set of PRs, including setup and cleanup.
	 * Each branch i makes a change in a line.
	 * Because all changes are on adjacent lines, odd changes are conflicting.
	 */
	@Test
	public void testCombinedUpdates() throws IOException {
		config = setUpConfig();
		IGitClient gitClient = getGitClient();
		Project project = super.getTestProject();
		project.name(config.repo());

		cleanTestBranchesAndPrs(gitClient, project, rateLimitDelay);
		try (GitLocal gitLocal = getGitLocal()) {
			setupTestBranchesAndPrs(gitClient, gitLocal, project);
		}
		// Here, we do not wait for build finish as we do not need to check the status
		// (this is left to the user)

		PullRequest combinedPr = null;
		try (GitLocal gitLocal = getGitLocal()) {
			combinedPr = updateService.runCreateCombinedProjectPr(gitClient, gitLocal, project, rateLimitDelay);
		}

		// Check status of all PRs and content
		log.debug("*** Check test results...");
		assertPristinePullRequestStatus(gitClient, new Formatter(), project);
		assertCombinedPullRequestValues(gitClient, project, combinedPr);
		assertCombinedPullRequestStatus(gitClient, project, combinedPr);
		// cleanup conflicting branch, only if test pass
		cleanTestBranchesAndPrs(gitClient, project, super.rateLimitDelay);
	}
	
}
