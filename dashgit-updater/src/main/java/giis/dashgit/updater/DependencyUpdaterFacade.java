package giis.dashgit.updater;

import giis.qabot.ci.clients.GitLocal;
import giis.qabot.ci.clients.GithubGitClient;
import giis.qabot.ci.clients.GitlabClient;
import giis.qabot.ci.clients.IGitClient;
import giis.qabot.ci.models.Branch;
import giis.qabot.ci.models.Project;
import giis.qabot.ci.models.PullRequest;

/**
 * Creates and merges a combined dependency update. As the Dependency Updater
 * that has been ported relies on specific objects to work, this facade
 * adapts the interface.
 */
public class DependencyUpdaterFacade {

	/**
	 * Create a single combined pull request and merges it into the main branch
	 * given the repository/project name and the internal ids of all PRs to be
	 * merged. If dryRun is set, the PR is not merged and the original update branches are no deleted
	 */
	public PullRequest mergeCombinedPullRequest(IGitClient gitClient, GitLocal gitLocal, 
			String projectName, long[] prIds, int rateLimitDelay, boolean dryRun) {
		Project project = getProjectWithPullRequests(gitClient, projectName, prIds);
		DependencyUpdater updater = new DependencyUpdater().setDryRun(dryRun);
		return updater.runCreateCombinedProjectPr(gitClient, gitLocal, project, rateLimitDelay);
	}

	private Project getProjectWithPullRequests(IGitClient gitClient, String projectName, long[] prIds) {
		Project project = (Project) new Project();
		project.name(projectName);
		for (long prId : prIds) {
			PullRequest pr = gitClient.getPullRequest(projectName, prId);
			Branch branch = (Branch) new Branch().pullRequest(pr).name(pr.sourceBranch());
			project.addItem(branch);
		}
		return project;
	}

	/**
	 * Gets the appropriate Git client given the provider type string
	 */
	public IGitClient getGitClient(String providerType, String server, String user, String token) {
		if ("github".equals(providerType.toLowerCase()))
			return new GithubGitClient(server, user, token, true);
		else if ("gitlab".equals(providerType.toLowerCase()))
			return new GitlabClient(server, user, token, true);
		else
			throw new RuntimeException("Invalid provider type: " + providerType +", only github or gitlab");
	}

}
