package giis.dashgit.updater.test;

import java.io.IOException;

import org.junit.Test;

public class TestItGitlabLiveUpdates extends TestItGithubLiveUpdates {

	@Override
	protected Config setUpConfig() {
		return new Config().read("gitlab");
	}

	@Override
	@Test
	public void testCombinedUpdatesUnresolvedConflict() throws IOException, InterruptedException {
		super.testCombinedUpdatesUnresolvedConflict();
	}
	
	@Override
	@Test
	public void testCombinedUpdatesResolvedConflict() throws IOException, InterruptedException {
		super.testCombinedUpdatesResolvedConflict();
	}

}
