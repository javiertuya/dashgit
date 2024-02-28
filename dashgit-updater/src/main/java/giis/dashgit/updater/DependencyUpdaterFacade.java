package giis.dashgit.updater;

import giis.qabot.ci.clients.GitLocal;
import giis.qabot.ci.clients.IGitClient;
import giis.qabot.ci.models.Branch;
import giis.qabot.ci.models.Project;
import giis.qabot.ci.models.PullRequest;

/**
 * Creates and merges a combined dependency update. As the Dependency Updater
 * that has been ported relies on specific objects to work, this facade
 * simplifies the operation.
 */
public class DependencyUpdaterFacade {

	/**
	 * Create a single combined pull request and merges it into th emain branch
	 * given the repository/project name and the internal ids of all PRs to be
	 * merged.
	 */
	public PullRequest mergeCombinedPullRequest(IGitClient gitClient, GitLocal gitLocal, 
			String projectName, long[] prIds, int rateLimitDelay) {
		Project project = getProjectWithPullRequests(gitClient, projectName, prIds);
		DependencyUpdater updater = new DependencyUpdater();
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

}
