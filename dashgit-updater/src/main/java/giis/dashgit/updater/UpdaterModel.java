package giis.dashgit.updater;

import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import java.util.Map.Entry;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.Accessors;

/**
 * This is the model that the UI creates to indicate the combined updates to merge.
 * Keep in sync with the model creation from javascript in dashgit-web/app/WiServices.js
 */
@Accessors(chain = true)
@Getter
@Setter
@NoArgsConstructor
public class UpdaterModel {
	Updates updates = new Updates();

	@Getter
	@Setter
	public static class Updates {
		String updateManagerRepo = "";
		String updateManagerBranch = "";
		boolean dryRun = false;
		Map<String, Provider> providers = new HashMap<>();
	}

	@Getter
	@Setter
	public static class Provider {
		String providerType = "";
		String urlValue = "";
		String userValue = "";
		String tokenSecret = "";
		String userEmail = "";
		Map<String, String[]> repositories = new HashMap<>();
	}

	public String toSummaryString() {
		StringBuilder sb = new StringBuilder();
		Updates upd = this.getUpdates();
		sb.append("UpdateManagerRepo: ").append(upd.getUpdateManagerRepo()).append(", DryRun: ")
				.append(upd.isDryRun());
		for (Entry<String, Provider> provider : upd.getProviders().entrySet()) {
			sb.append("\nProvider id: ").append(provider.getKey())
					.append(", type: ").append(provider.getValue().getProviderType())
					.append(", url: ").append(provider.getValue().getUrlValue());
			for (Entry<String, String[]> repository : provider.getValue().getRepositories().entrySet()) {
				sb.append("\n  Repository: ").append(repository.getKey()).append(", Pulls: ")
						.append(Arrays.toString(repository.getValue()));
			}
		}
		return sb.toString();
	}

}
