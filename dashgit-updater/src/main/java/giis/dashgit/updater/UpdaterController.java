package giis.dashgit.updater;

import java.util.Arrays;
import java.util.Map.Entry;

import com.fasterxml.jackson.databind.ObjectMapper;

import giis.dashgit.updater.UpdaterModel.Provider;
import giis.portable.util.FileUtil;
import giis.qabot.ci.clients.GitLocal;
import giis.qabot.ci.clients.GithubGitClient;
import giis.qabot.ci.clients.IGitClient;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;

/**
 * When the user sends dependabot updates to combine and merge, it creates a
 * branch in the manager repository and pushes a file at
 * .dashgit/manage/update.json that indicates the updates.
 * 
 * A GitHub Action starts executing and runs the main entry point of this
 * project, that invokes this controller.
 * 
 * This controller gets the model represented by the json file and performs all
 * updates by creating a pull request with automerge for each repository.
 * Finally, cleans up the branch.
 */
@Slf4j
public class UpdaterController {

	public void run(String fileName) {
		String json = FileUtil.fileRead(fileName);
		log.info("Reading the UpdateModel: \n{}", json);
		UpdaterModel model = deserialize(json);
		int errorCount = runAllUpdates(model);
		// Removes the branch where the UI pushed the model to update, all debug traces
		// are in the Actions log
		removeUpdateModelBranch(model.getUpdates().getManagerRepoName(), model.getUpdates().getUpdateManagerBranch());
		// Fails the job if any udpate failed
		if (errorCount > 0)
			System.exit(1);
	}

	public int runAllUpdates(UpdaterModel model) {
		int updateCount = 0;
		int errorCount = 0;
		log.info("*** Running UpdateModel, summary: \n{}", model.toSummaryString());
		boolean dryRun = model.getUpdates().isDryRun();
		for (Entry<String, Provider> provider : model.getUpdates().getProviders().entrySet()) {
			String providerType = provider.getValue().getProviderType();
			String urlValue = provider.getValue().getUrlValue();
			String userValue = provider.getValue().getUserValue();
			String tokenSecret = provider.getValue().getTokenSecret();
			String userEmail = provider.getValue().getUserEmail();
			log.info("*** Starting provider: {} - {}, urlValue: {}", provider.getKey(), providerType, urlValue);
			for (Entry<String, String[]> repository : provider.getValue().getRepositories().entrySet()) {
				updateCount++;
				String repo = repository.getKey();
				log.info("*** Starting repository: {} , pulls: {}", repo, Arrays.toString(repository.getValue()));
				String error = runSingleUpdate(providerType, urlValue, userValue, userEmail, tokenSecret, repo, repository.getValue(), dryRun);
				if (!"".equals(error))
					errorCount++;
			}
		}
		// Summarize the results to show in the GitHub Actions log
		log.info("********* END OF UPDATE *********");
		log.info("Total of successful updates: {}", updateCount - errorCount);
		// Makes the job fail with at least one error.
		// Note that the job should not have any errors, this different of a failure in
		// the pull request builds
		if (errorCount > 0)
			log.info("Total of unsuccessful updates: {}", errorCount);

		return errorCount;
	}

	private String runSingleUpdate(String providerType, String urlValue, // NOSONAR
			String userValue, String userEmail, String tokenSecret, 
			String repo, String[] pullIds, boolean dryRun) {
		log.info("**** Run update: {} {} {} {}", urlValue, userValue, tokenSecret, repo);
		long[] pulls = new long[pullIds.length];
		for (int i = 0; i < pulls.length; i++)
			pulls[i] = Long.parseLong(pullIds[i]);

		String token = System.getenv(tokenSecret);
		if (token == null || token.trim().length() == 0) {
			String error = "Undefined required secret containing the api access token: " + tokenSecret;
			log.error(error);
			return error;
		}

		IGitClient gitClient = new DependencyUpdaterFacade().getGitClient(providerType, urlValue, userValue, token);
		GitLocal gitLocal = new GitLocal("target", urlValue, userValue, userEmail, token);
		try {
			new DependencyUpdaterFacade().mergeCombinedPullRequest(gitClient, gitLocal, repo, pulls, 2000, dryRun);
			return "";
		} catch (Exception e) {
			log.error("Can not create combined pull request", e);
			return e.toString();
		}
	}
	
	public void removeUpdateModelBranch(String managerRepo, String managerBranch) {
		String token = System.getenv("GITHUB_TOKEN"); // needs the permissions in the workflow
		GithubGitClient git = new GithubGitClient("https://github.com", "", token, false);
		log.info("Cleaning up the temporary branch where the update was executed");
		try {
			git.deleteBranch(managerRepo, managerBranch);
		} catch (Exception e) { // logs but does not fails the update
			log.error("Can not clean up the temporary branch, maybe GITHUB_TOKEN has not enough permissions in the job", e);
		}
	}

	@SneakyThrows
	public UpdaterModel deserialize(String json) {
		// Usually using FAIL_ON_UNKNOWN_PROPERTIES false, but here forces a well formed object
		ObjectMapper mapper = new ObjectMapper();
		return mapper.readValue(json, UpdaterModel.class);
	}

}
