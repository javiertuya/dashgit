package giis.qabot.ci.clients;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.kohsuke.github.GHFileNotFoundException;
import org.kohsuke.github.GHPullRequest;
import org.kohsuke.github.GHPullRequest.MergeMethod;
import org.kohsuke.github.GHRepository;
import org.kohsuke.github.GHUser;
import org.kohsuke.github.GitHub;
import org.kohsuke.github.GitHubBuilder;

import com.fasterxml.jackson.databind.JsonNode;

import giis.qabot.ci.models.PullRequest;
import giis.qabot.core.models.Util;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;

/**
 * Api de cliente para gitlab, utiliza el api recomendado https://github.com/gitlab4j/gitlab4j-api.
 */
@Slf4j
public class GithubGitClient implements IGitClient {
	private static final int AUTOMERGE_RETRY_COUNT = 8;
	private static final int AUTOMERGE_RETRY_WAIT = 2000;

	private GithubGraphqlClient graphql; // api propio para buscar pull requests de multiples repos
	private GitHub api; // api recomendada para github (org.kohsuke:github-api)
	private GHRepository lazyRepo = null; // repo obtenido del api anterior, creado de forma lazy, para evitar multiples llamadas
	private String lazyRepoLast = ""; // ultimo lazyRepo obtenido, si coincide lo reutiliza, si no, instancia uno nuevo
	private String user; // usuario que se ha autenticado
	private boolean isAdmin = false; // el usuario tiene privilegios de administrador

	// Cuando se debe comprobar el estado de una operacion (check mergeability o rebase)
	// se debe hacer un poll, indica el numero maximo de veces que se comprueba y el delay entre cada una
	private int pollCheckLimit = 20;
	private int pollCheckDelay = 2500;

	public GithubGitClient(String url, String user, String token, boolean isAdmin) {
		if ("https://github.com".equals(url))
			url = "https://api.github.com";
		this.graphql = new GithubGraphqlClient(url, token);
		this.api = getGhApi(user, token);
		this.user = user;
		this.isAdmin = isAdmin;
	}

	@SneakyThrows(IOException.class)
	static GitHub getGhApi(String user, String token) {
		return new GitHubBuilder().withOAuthToken(token, user).build();
	}

	/**
	 * Establece el alcance de los proyectos que se buscaran en el repositorio
	 */
	public GithubGitClient scope(String scope) {
		this.graphql.scope(scope); // no guarda scope, solo se usa en graphql
		return this;
	}

	/**
	 * Obtiene el nombre del usuario utilizado en la autenticacion a este cliente
	 */
	@Override
	public String getUsername() {
		return this.user;
	}

	/**
	 * Indica si el usuario utilizado en la autenticacion a este cliente tiene
	 * permisos elevados de administracion sobre el repositorio
	 */
	@Override
	public boolean isAdmin() {
		return this.isAdmin;
	}

	/**
	 * Obtiene el repositorio a partir de su nombre (de la forma owner/repo), si ya
	 * habia sido instanciado lazyRepo para este repositorio devuelve la instancia,
	 * si no, crea una nueva
	 */
	@SneakyThrows
	private GHRepository getRepository(String repoName) {
		if (lazyRepo == null || !lazyRepoLast.equals(repoName)) { // primera instanciacion o cambio de instancia
			lazyRepo = api.getRepository(repoName);
			lazyRepoLast = repoName;
		}
		return lazyRepo;
	}

	@Override
	public IGitClient pollCheckLimit(int iterations) {
		this.pollCheckLimit = iterations;
		return this;
	}

	@Override
	public IGitClient pollCheckDelay(int milliseconds) {
		this.pollCheckDelay = milliseconds;
		return this;
	}

	/**
	 * Borra una rama (esto eliminara sus pull requests)
	 */
	@Override
	@SneakyThrows
	public void deleteBranch(String projectId, String branchName) {
		log.debug("Deleting branch {} project {}", branchName, projectId);
		GHRepository repo = this.getRepository(projectId);
		try {
			repo.getRef("refs/heads/" + branchName).delete();
		} catch (GHFileNotFoundException e) {
			// NOTE in QABot used RuntimeException instead GHFileNotFoundException,
			// but does not work here, because this is not running under Spring?
			// Si la rama no existe (se han observado dos mensajes difererentes, no lanza la excepcion)
			if (!e.getMessage().contains("Not Found") && !e.getMessage().contains("Reference does not exist")) {
				log.error("Exception deleting branch {}: {}", branchName, e.toString());
				throw e;
			}
		}
	}

	/**
	 * Obtiene todas las pull requests abiertas, opcionalmente seleccionando solo
	 * las asignadas al usuario autenticado. 
	 * El api de github solo devuelve las pr para un repo, el api de busqueda 
	 * devuelve varios repos pero solo contiene la informacion comun con las issues. 
	 * Usara una query graphql para obtener todos los datos necesarios.
	 */
	@Override
	public List<PullRequest> getPullRequests(boolean onlyAssignedToMe) {
		List<PullRequest> target = new ArrayList<>();
		JsonNode json = graphql.postGraphql(graphql.getPullRequestsQuery());
		json = json.get("data").get("viewer").get("repositories").get("nodes");
		for (JsonNode repository : json) {
			String projName = repository.get("name").asText();
			String projNameWithOwner = repository.get("nameWithOwner").asText();
			JsonNode pullRequests = repository.get("pullRequests").get("nodes");
			for (JsonNode jsonpr : pullRequests) {
				PullRequest pr = mapMergeRequest(projName, projNameWithOwner, jsonpr);
				if (!onlyAssignedToMe || this.user.equals(pr.assignee())) // tiene en cuenta las asignadas a mi
					target.add(0, mapMergeRequest(projName, projNameWithOwner, jsonpr));
			}
		}
		return target;
	}

	private PullRequest mapMergeRequest(String projName, String projNameWithOwner, JsonNode jsonpr) {
		PullRequest targetpr = new PullRequest()
				.title(jsonpr.get("title").asText())
				.description(jsonpr.get("body").asText())
				.htmlUrl(jsonpr.get("url").asText())
				.fullName(projNameWithOwner)
				.repoName(projName)
				.repoId(projNameWithOwner)
				.prId(jsonpr.get("number").asLong())
				.isOpen("OPEN".equals(jsonpr.get("state").asText()))
				.sourceBranch(jsonpr.get("headRefName").asText())
				.targetBranch(jsonpr.get("baseRefName").asText())
				.sha(jsonpr.get("headRefOid").asText());
		// navega para obtener las etiquetas y asignee
		for (JsonNode labels : jsonpr.get("labels").get("edges"))
			targetpr.labels().add(labels.get("node").get("name").asText());
		JsonNode assignee = jsonpr.get("assignees").get("edges");
		targetpr.assignee(assignee.has(0) ? assignee.get(0).get("node").get("login").asText() : null);

		// El estado de mergeability no es true/false/null como se describe en el api,
		// aqui puede ser UNKNOWN, MERGEABLE, CONFLICTING (y alguno mas introducido por
		// los metodos de merge)
		// Se pone null en el primer caso, true en el segundo y false en el resto (con la razon)
		String mergeable = jsonpr.get("mergeable").asText();
		if ("UNKNOWN".equals(mergeable))
			targetpr.canBeMerged(null).cantBeMergedReason("");
		if ("MERGEABLE".equals(mergeable))
			targetpr.canBeMerged(true).cantBeMergedReason("");
		else if ("CONFLICTING".equals(mergeable))
			// si no se puede hacer el merge anota la razon (usando el mismo string que se
			// usa en gitlab para homogeneidad)
			targetpr.canBeMerged(false).cantBeMergedReason("cannot be merged");
		return targetpr;
	}

	/**
	 * Obtiene una pull request existente dado el id de proyecto y pr
	 */
	@Override
	public PullRequest getPullRequest(String repoId, long prId) {
		JsonNode json = graphql.postGraphql(graphql.getPullRequestQuery(repoId, String.valueOf(prId)));
		json = json.get("data").get("repository").get("pullRequest");
		return mapMergeRequest(repoId.split("/")[1], repoId, json);
	}

	/**
	 * Inserta un comentario en una pull request
	 */
	@Override
	@SneakyThrows
	public void addPullRequestCommment(PullRequest pullRequest, String comment) {
		int pullId = ((Long) pullRequest.prId()).intValue();
		GHRepository repo = this.getRepository(pullRequest.repoId());
		repo.getIssue(pullId).comment(comment);
	}

	/**
	 * Crea una pull request dado el id o nombre de proyecto y los datos de la PR,
	 */
	@Override
	@SneakyThrows
	public PullRequest createPullRequest(String projectId, String sourceBranch, String targetBranch, String title,
			String description, String assignee, List<String> labels, boolean deleteBranchOnMerge,
			boolean squashOnMerge, boolean setAutoMerge) {
		log.debug("Create github pull request project: {}, source: {}, target: {}, title: {}", projectId, sourceBranch,
				targetBranch, title);
		GHRepository repo = this.getRepository(projectId);
		GHPullRequest ghpr = repo.createPullRequest(title, sourceBranch, targetBranch, description);
		// Actualiza con resto de valores necesarios (assignee y labels)
		// En github no se definen a priori los valores deleteBranchOnMerge, squashOnMerge
		if (assignee != null && !"".equals(assignee)) {
			GHUser ghuser = api.getUser(assignee);
			ghpr.assignTo(ghuser);
		}
		// setLabels does not work when running from the manager repository action, why?, changed to addLabels
		ghpr.addLabels(labels.toArray(new String[0]));
		ghpr.refresh();

		if (setAutoMerge)
			setAutoMerge(ghpr.getNodeId(), title, description);

		// obtengo el modelo de la pull request buscandola por su numero
		return this.getPullRequest(projectId, ghpr.getNumber());
	}

	private void setAutoMerge(String nodeId, String title, String description) throws InterruptedException {
		log.info("Set automerge to this pull request");
		for (int i = 0; i <= AUTOMERGE_RETRY_COUNT; i++) { // NOSONAR for clarity
			Thread.sleep(AUTOMERGE_RETRY_WAIT);
			String result = trySetAutoMerge(nodeId, title, description);
			if ("success".equals(result)) {
				log.info("Automerge is set");
				break;
			} else if ("abort".equals(result) || "unknown".equals(result)) {
				log.error("Can't set automerge");
				return;
			} else if ("retry".equals(result)) {
				if (i == AUTOMERGE_RETRY_COUNT) {
					log.error("Can't set automerge after {} retries", AUTOMERGE_RETRY_COUNT);
					break;
				} else {
					log.info("Retry set automerge");
				}
			}
		}
	}

	private String trySetAutoMerge(String nodeId, String title, String description) {
		JsonNode json = graphql.postGraphql(graphql.getAutoMergeQuery(nodeId, title, description));
		JsonNode data = json.get("data");
		JsonNode errors = json.get("errors");
		if (errors == null) {
			log.debug("Success: {}", data);
			return "success";
		} else {
			String type = errors.get(0).get("type").asText();
			String message = errors.get(0).get("message").asText();
			log.debug("Failure: {} {}", type, message);
			// Check known conditions that prevent automerge to abort, if not, retry
			if (message.contains("Auto merge is not allowed for this repository"))
				return "abort";
			else
				return "retry";
		}
	}

	/**
	 * Realiza un merge de una pull request con un rebase previo, comprobando si no
	 * se puede hacer el merge (pe por haber conflictos). 
	 * Devuelve una PR con los valores actualizados
	 * (el sha si ha habido rebase, el estado de mergeability).
	 * NOTA: No contempla MRs entre proyectos diferentes
	 */
	@Override
	@SneakyThrows(IOException.class)
	public PullRequest rebaseAndMerge(PullRequest pr, boolean squash) {
		int pullId = ((Long) pr.prId()).intValue();
		GHRepository repo = this.getRepository(pr.repoId());
		log.debug("Rebase/Merge PR {} {} {} {} {}", pr.sha(), pr.repoId(), pr.repoName(), pullId, pr.title());

		// Antes de hacer el merge comprueba si se puede hacer el merge sin conflictos, finaliza si los hay
		// Como los estados con este api de github estan fijados, el check devuelve un string
		// similar a los de gitlab con el status
		String mergeabilityStatus = runMergeabilityCheck(pr.repoId(), pullId);
		if (!"can_be_merged".equals(mergeabilityStatus)) {
			log.debug("Can't merge pull request");
			this.addPullRequestCommment(pr, "This update could not be processed due to merge conflicts");
			return this.getPullRequest(pr.repoId(), pullId);
		}
		// En Gitlab se comprueban los diverged commits, en github no existe esa posibilidad

		// Tras todas las comprobaciones se puede hacer el merge
		log.debug("Merging pull request");
		// En gitlab se marca la pr para hacer squash si hay que crear combined update,
		// En github no existe esa opcion, hay que indicarlo en el momento del merge
		MergeMethod mergeMethod = squash ? MergeMethod.SQUASH : MergeMethod.REBASE;
		GHPullRequest ghpr = repo.getPullRequest(pullId);
		
		// si hace squash pone en el commit el mensaje de la pr (solo descripcion pues
		// en github no es la totalidad del mensaje del commit)
		ghpr.merge(squash ? pr.description() : null, null, mergeMethod);
		// En gitlab se marcan las pr para borrado de las ramas, pero en github es una configuracion del proyecto
		// por lo que hay que borrar explicitamente la rama, a no ser que en settings se tenga Automatically delete head branches
		if (!repo.isDeleteBranchOnMerge())
			this.deleteBranch(pr.repoId(), pr.sourceBranch());

		return this.getPullRequest(pr.repoId(), pullId);
	}

	private String runMergeabilityCheck(String projectId, int prId) throws IOException {
		GHRepository repo = this.getRepository(projectId);
		GHPullRequest ghpr = null;
		// Realiza lecturas sucesivas hasta que el estado de mergeability es decidido (en sentido positivo o negativo)
		// https://docs.github.com/en/rest/guides/getting-started-with-the-git-database-api#checking-mergeability-of-pull-requests
		for (int i = 1; i <= pollCheckLimit; i++) {
			ghpr = repo.getPullRequest(prId);
			Boolean mergeable = ghpr.getMergeable();
			log.debug("Checking mergeability: {} status: {} mergeable: {}", ghpr.getMergeCommitSha(),
					ghpr.getMergeableState(), mergeable);
			if (mergeable != null) // null es desconocido, continuara el bucle, si no finaliza
				return mergeable ? "can_be_merged" : "cannot_be_merged"; // NOSONAR ya se ha hecho el check de nullabilidad
			if (i != pollCheckLimit) // tras todas las iteraciones no se llega a conclusion, sale con un estado ficticio de timeout
				Util.delay(pollCheckDelay);
		}
		return "mergeability_timeout"; // si se llega aqui no se ha podido determinar el estado
	}

}
