package giis.dashgit.updater.test;

import java.io.IOException;

import org.junit.Test;

import giis.qabot.ci.clients.GitlabClient;
import giis.qabot.ci.clients.IGitClient;

public class TestItGitlabLiveUpdates extends TestItGithubLiveUpdates {

	@Override
	protected Config setUpConfig() {
		return new Config().read("gitlab");
	}

	@Override
	protected IGitClient getGitClient() {
		return new GitlabClient(config.server(), config.user(), config.token(), true);
	}

	@Override
	@Test
	public void testCombinedUpdates() throws IOException {
		super.testCombinedUpdates();
	}

}
