package giis.dashgit.updater.test;

import java.io.IOException;

import org.junit.Test;

import giis.dashgit.updater.UpdaterController;
import giis.dashgit.updater.UpdaterModel;
import giis.qabot.ci.clients.GitLocal;
import giis.qabot.ci.clients.IGitClient;
import giis.qabot.ci.models.Project;
import lombok.extern.slf4j.Slf4j;

/**
 * Intended to be executed manually to create the test pull requests to perform
 * E2E tests of the combined updates. Test for other providers inherit this
 * class.
 */
@Slf4j
public class TestE2eLiveUpdatesSetup extends Base {

	/**
	 * Uncomment a single line to select the provider type and whether the pull
	 * requests to combine must result in unresolved conflicts or not. Requires a
	 * previous configuration of a test repository, see TestItGithubLiveUpdates.java
	 * for instructions.
	 * 
	 * To execute the E2E test, go to the DashGit using and set a feature flag to
	 * the querystring: ?ff=updtest. This will add the PRs created in the test
	 * project to the dependabot tab. Select the work items and run the update.
	 */
	@Test
	public void testLoadE2eTestData() throws IOException {
		//loadE2eTestData("github", false);
		//loadE2eTestData("github", true);
		//loadE2eTestData("gitlab", false);
		//loadE2eTestData("gitlab", true);
	}

	private void loadE2eTestData(String provider, boolean unresolvedConflict) throws IOException {
		Config config = new Config().read(provider);
		IGitClient gitClient = config.getGitClient();
		Project project = super.getTestProject(config);

		cleanTestBranchesAndPrs(gitClient, project, rateLimitDelay);
		try (GitLocal gitLocal = config.getGitLocal()) {
			setupTestBranchesAndPrs(gitClient, gitLocal, project, unresolvedConflict);
		}
	}

	@Test
	public void testReadModelSmoke() {
		UpdaterController controller = new UpdaterController();
		UpdaterModel model = controller.deserialize(getSmokeModel());
		log.debug(model.toSummaryString());
	}

	private String getSmokeModel() {
		return """
				{
				  'updates': {
				    'dryRun' : false, 'updateManagerRepo': 'user/dashgit-manager',
				    'providers': {
				      '0-github': {
				        'urlValue': 'https://github.com', 'userValue': 'user1', 'tokenSecret': 'GITHUB_TOKEN',
				        'repositories': { 'user1/dashgit': [ '68', '67', '66' ], 'user1/dashgit-integration': [ '1' ] }
				      },
				      '1-github': {
				        'urlValue': 'https://github1.com', 'userValue': 'user2', 'tokenSecret': 'GITHUB_TOKEN',
				        'repositories': { 'user2/dashgit': [ '11' ] }
				      }
				    }
				  }
				}
				""".replace("'", "\"");
	}
}
