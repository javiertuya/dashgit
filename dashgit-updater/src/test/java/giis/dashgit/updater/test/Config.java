package giis.dashgit.updater.test;

import java.io.FileInputStream;
import java.io.IOException;
import java.util.Properties;

import lombok.Getter;
import lombok.Setter;
import lombok.experimental.Accessors;

/**
 * Stores and reads configuration for integration tests.
 */
@Accessors(fluent = true)
public class Config {
	private static final String PROP_FILE = "./it.properties";
	@Getter @Setter private String server = "";
	@Getter @Setter private String repo = "";
	@Getter @Setter private String token = "";
	@Getter @Setter private String user = "";
	
	public Config read(String provider) {
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
		token = prop.getProperty(provider + ".token");
		user = prop.getProperty(provider + ".user");
		if (server == null || repo == null || token == null || user == null)
			throw new RuntimeException("Properties server, repo, token, user with the " + provider
					+ " prefix must be defined in the it.properties file");
		return this;
	}
	
}
