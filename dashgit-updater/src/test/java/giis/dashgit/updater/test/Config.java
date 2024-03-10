package giis.dashgit.updater.test;

import java.io.FileInputStream;
import java.io.IOException;
import java.util.Properties;

import giis.qabot.ci.clients.GitLocal;
import giis.qabot.ci.clients.GithubGitClient;
import giis.qabot.ci.clients.GitlabClient;
import giis.qabot.ci.clients.IGitClient;
import lombok.Getter;
import lombok.Setter;
import lombok.experimental.Accessors;
import lombok.extern.slf4j.Slf4j;

/**
 * Stores and reads configuration for integration tests.
 */
@Slf4j
@Accessors(fluent = true)
public class Config {
	private static final String PROP_FILE = "./it.properties";
	private String provider;
	@Getter @Setter private String server = "";
	@Getter @Setter private String repo = "";
	@Getter @Setter private String token = "";
	@Getter @Setter private String user = "";
	@Getter @Setter private String email = "";
	
	public Config read(String provider) {
		this.provider=provider;
		Properties prop = new Properties();
		FileInputStream propFile;
		try {
			propFile = new FileInputStream(PROP_FILE);
			prop.load(propFile);
		} catch (IOException e) {
			throw new RuntimeException("Can't find the it.properties file at the root this project", e);
		}
		server = prop.getProperty(provider + ".server");
		repo = prop.getProperty(provider + ".repo");
		// if run in local, we need *.token property to contain the token
		// in CI we need *.secret with the name of a secret that stores the token
		String githubActions = System.getenv("GITHUB_ACTIONS");
		if (githubActions == null || "".equals(githubActions)) { // run in local
			log.debug("Run in local, reading token from provider.token");
			token = prop.getProperty(provider + ".token");
		} else {
			log.debug("Run in local, reading secret from provider.secret, that must store the token");
			String secret = prop.getProperty(provider + ".secret");
			token = System.getenv(secret);
		}
		user = prop.getProperty(provider + ".user");
		email = prop.getProperty(provider + ".email");
		if (server == null || repo == null || token == null || user == null || email == null)
			throw new RuntimeException("The server, repo, token or secret, user, email properties with the " + provider
					+ " prefix must be defined in the it.properties file");
		return this;
	}
	
	protected IGitClient getGitClient() {
		if ("github".equals(provider))
			return new GithubGitClient(this.server(), this.user(), this.token(), true);
		else if ("gitlab".equals(provider))
			return new GitlabClient(this.server(), this.user(), this.token(), true);
		else
			throw new RuntimeException("Invalid provider " + provider +", only github or gitlab");
	}

	protected GitLocal getGitLocal() {
		return new GitLocal("target", this.server(), this.user(), this.email(), this.token());
	}


	
}
