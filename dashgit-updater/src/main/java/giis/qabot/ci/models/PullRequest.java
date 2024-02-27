package giis.qabot.ci.models;

import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.JsonAutoDetect.Visibility;

import lombok.Getter;
import lombok.Setter;
import lombok.experimental.Accessors;

/**
 * Modelo de una pull request, no considera de momento PRs entre diferentes proyectos
 */
@JsonAutoDetect(fieldVisibility = Visibility.ANY)
@Accessors(fluent=true)
public class PullRequest {
	@Getter @Setter private String title;
	@Getter @Setter private String fullName; // owner/repo
	@Getter @Setter private String repoName; // solo repo
	@Getter @Setter private String repoId; //id unico (en github owner/repo, en gitlab un numero)
	@Getter @Setter private long prId;
	@Getter @Setter private boolean isOpen;
	@Getter @Setter private Boolean canBeMerged=null; //null es indefinido
	@Getter @Setter private String cantBeMergedReason=""; //explicacion adicional si no se puede hacer merge
	@Getter @Setter private String assignee;
	@Getter @Setter private List<String> labels=new ArrayList<>();
	@Getter @Setter private String sourceBranch;
	@Getter @Setter private String targetBranch;
	@Getter @Setter private String sha;
	@Getter @Setter private String description;
	@Getter @Setter private String htmlUrl;
	
	@Override
	public String toString() {
		return title();
	}
}
