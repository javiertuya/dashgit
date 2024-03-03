package giis.dashgit.updater.test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.IOException;
import java.nio.file.Paths;
import java.util.List;

import org.apache.commons.io.FileUtils;
import org.apache.commons.io.FilenameUtils;
import org.junit.Before;
import org.junit.Rule;
import org.junit.rules.TestName;

import giis.qabot.ci.clients.GitLocal;
import giis.qabot.ci.clients.IGitClient;
import giis.qabot.ci.models.Branch;
import giis.qabot.ci.models.Project;
import giis.qabot.ci.models.PullRequest;
import giis.qabot.core.models.Formatter;
import giis.qabot.core.models.Util;
import lombok.extern.slf4j.Slf4j;

/**
 * Utilities to setup and run the Combined Update Integration tests.
 */
@Slf4j
public class Base {
	private static final String BRANCH_PREFIX = "dependabot/testupdate/";

	private String branchPattern; // updates will add this pattern to the prefix

	protected long rateLimitDelay = 1000;
	protected int numTestBranches = 3;

	@Rule public TestName testName = new TestName();
	
	@Before
	public void setUp() {
		log.info("****** Running test: {} ******", testName.getMethodName());
	}

	public Project getTestProject(Config config) {
		Project project = (Project) new Project();
		for (int i = 0; i < numTestBranches; i++)
			project.addItem(new Branch().name(BRANCH_PREFIX + "branch-" + i));
		project.name(config.repo());
		return project;
	}

	public void cleanTestBranchesAndPrs(IGitClient gitClient, Project project, long delay) {
		log.debug("*** Clean Test Branches and PRs");
		for (Branch branch : project.branches()) {
			gitClient.deleteBranch(project.name(), branch.name());
			Util.delay(delay);
		}
	}

	public void setupTestBranchesAndPrs(IGitClient gitClient, GitLocal git, Project project, boolean unresolvedConflict) throws IOException {
		log.debug("*** Setup Test Branches and PRs");
		// Clone, reset and push the test repository with the script that will be changed
		// Requires previous configuration of the CI in each repo using one of the files at src/test/resources/git-project
		git.cloneRepository(project.name());
		createWorkspaceFile(git, ".", "main-script.sh");
		git.commit("Reset default test branch content for " + branchPattern).push(true);

		// A branch for each update, changes will be done in adjacent lines to cause
		// conflicts.
		String[][] labels = new String[3][];
		labels[0] = new String[] { "dependencies", "java" };
		labels[1] = new String[] { "dependencies", ".NET" };
		labels[2] = new String[] { "dependencies", "docker" };
		for (int i = 0; i < numTestBranches; i++) {
			Branch branch = project.branches().get(i);
			git.checkoutDefault().checkout(branch.name(), true);
			String script = readWorkspaceFile(git, "main-script.sh");
			//Sets a change of minor version at row i
			script = script.replace(
					i + "." + i + "." + i ,
					i + "." + i + "." + (i+1));
			//If indicated in the parameter, ensures that conflict in the middle row can't be resolved (changes the tag)
			if (i==1 && unresolvedConflict)
				script=script.replace("d1>", "dxx>");
			writeWorkspaceFile(git, "main-script.sh", script);

			// Note that pushes are against main branch (the checked-out)
			git.commit("Set change at branch " + branch.name()).push(true);
			PullRequest pr = gitClient.createPullRequest(project.name(), branch.name(), git.getDefaultBranch(),
					"Test pull Request for " + branch.name(),
					"Description of test pull request for branch " + branch.name(), "", List.of(labels[i]), true, false,
					false);
			// complete project branches object with the pull request created
			branch.pullRequest(pr);
		}
	}
	protected void createWorkspaceFile(GitLocal git, String folder, String fileName) throws IOException {
		String script = """
				#!/bin/bash
				echo "this is <d0>0.0.0</d0>"
				echo "this is <d1>1.1.1</d1>"
				echo "this is <d2>2.2.2</d2>"
				echo "ending"
				sleep 5
				""";
		writeWorkspaceFile(git, FilenameUtils.concat(folder, fileName), script);
	}

	public void assertCombinedPullRequestValues(IGitClient gitClient, Project project, PullRequest combinedPr, boolean unresolvedConflict) {
		log.debug("*** Assert Combined Pull Request Values");
		log.debug("Combined PR content check: {} {} {}", project.name(), combinedPr.prId(), combinedPr.title());
		PullRequest pr = gitClient.getPullRequest(project.name(), combinedPr.prId());
		log.debug("Combined PR description: {}", pr.description());
		String[] description = pr.description().split("Does not include these updates");
		// If unresolvedConflict is false all branches must be included, if not, odd branches are excluded
		if (!unresolvedConflict) {
			assertFalse("Description should not say that excludes updates as conflicts should be resolved",
				pr.description().contains("Does not include these updates"));
			for (int i = 0; i < numTestBranches; i++) // even PRs are in first part (included)
				assertTrue("Branch " + i + "must be included",
						description[0].contains("[Test pull Request for dependabot/testupdate/branch-" + i + "]"));
		} else { // some branch is excluded
			for (int i = 0; i < numTestBranches; i = i + 2) // even PRs are in first part (included)
				assertTrue("Branch " + i + "must be included",
					description[0].contains("[Test pull Request for dependabot/testupdate/branch-" + i + "]"));
			for (int i = 1; i < numTestBranches; i = i + 2) // even PRs are in first part (included)
				assertTrue("Branch " + i + "must not be included",
					description[1].contains("[Test pull Request for dependabot/testupdate/branch-" + i + "]"));
		}
	}

	public void assertCombinedPullRequestStatus(IGitClient gitClient, Project project, PullRequest combinedPr) {
		log.debug("*** Assert Combined Pull Request Status");
		for (int i = 1; i <= 20; i++) { // Poll the combined PR until closed/merged
			log.debug("Combined PR status check: {} {} {}", project.name(), combinedPr.prId(), combinedPr.title());
			PullRequest pr = gitClient.getPullRequest(project.name(), combinedPr.prId());
			if (!pr.isOpen())
				return;
			else if (i == 20)
				fail("Combined PR is not closed after max number of attempts");
			// poll wait wit larger delay
			log.debug("Combined PR still open");
			Util.delay(4 * rateLimitDelay);
		}
	}

	public void assertPristinePullRequestStatus(IGitClient gitlab, Formatter formatter, Project project, boolean unresolvedConflict) {
		// Checks status of branches (closed/not closed), storing all results in a string to better comparison
		log.debug("*** Assert Pristine Pull Request Status");
		StringBuilder errors = new StringBuilder();
		for (int i = 0; i < numTestBranches; i++) {
			Branch branch = project.branches().get(i);
			PullRequest pr = branch.pullRequest();
			// reads the actual branch to compare
			pr = gitlab.getPullRequest(branch.pullRequest().repoId(), branch.pullRequest().prId());
			String prData = "PR " + pr.repoId() + " " + pr.repoName() + " " + pr.prId() + " " + pr.title();
			log.debug("Check merge result {}", prData);
			log.debug("  Is open: {}. Can be merged: {}", pr.isOpen(), pr.canBeMerged());
			prData = "\n" + prData;
			// If unresolvedConflict is false all repos should have been removed, if not:
			// even repos have not conflicts, should have been removed, odd repost shouldn't
			if (!unresolvedConflict && pr.isOpen())
				errors.append(prData + " should not be open");
			if (unresolvedConflict && pr.isOpen() && i % 2 == 0)
				errors.append(prData + " should not be open");
			if (unresolvedConflict && !pr.isOpen() && i % 2 != 0)
				errors.append(prData + " should be open");
		}
		assertEquals("Any PR is not in the right state after generating the combined PR", "", errors.toString());
	}

	protected String readWorkspaceFile(GitLocal git, String fileName) throws IOException {
		return FileUtils.readFileToString(Paths.get(git.getWorkTree(), fileName).toFile(), "UTF-8");
	}

	protected void writeWorkspaceFile(GitLocal git, String fileName, String value) throws IOException {
		FileUtils.writeStringToFile(Paths.get(FilenameUtils.concat(git.getWorkTree(), fileName)).toFile(), value,
				"UTF-8");
	}

}
