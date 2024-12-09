package giis.qabot.ci.clients;

import java.util.ArrayList;
import java.util.List;

import org.apache.commons.lang3.math.NumberUtils;
import org.gitlab4j.api.Constants.MergeRequestScope;
import org.gitlab4j.api.Constants.MergeRequestState;
import org.gitlab4j.api.GitLabApi;
import org.gitlab4j.api.GitLabApiException;
import org.gitlab4j.api.models.AcceptMergeRequestParams;
import org.gitlab4j.api.models.MergeRequest;
import org.gitlab4j.api.models.MergeRequestFilter;
import org.gitlab4j.api.models.MergeRequestParams;

import giis.qabot.ci.models.PullRequest;
import giis.qabot.core.models.Util;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;

/**
 * Api de cliente para gitlab, utiliza el api recomendado https://github.com/gitlab4j/gitlab4j-api.
 */
@Slf4j
public class GitlabClient implements IGitClient {
	//estados de interes en este modulo obtenidos del api de gitlab
	//Desde gilab4j 1.5.0 estos estados que eran obtenidos con getMergeStatus se obtienan con GetDetailedMergeStatus
	//Ver issue #17
	public static final String CAN_BE_MERGED = "mergeable";
	public static final String CANNOT_BE_MERGED = "broken_status"; // conflictos
	// otros estados que no proceden del api de gitlab, pero que este modulo puede establecer en el modelo
	public static final String MERGEABILITY_TIMEOUT = "mergeability_timeout";
	public static final String REBASE_TIMEOUT = "rebase_timeout";

	private static final int AUTOMERGE_RETRY_COUNT = 8;
	private static final int AUTOMERGE_RETRY_WAIT = 2000;

	private GitLabApi api;
	// usuario utilizado en la autenticacion (el propietario del token)
	private String user;
	private boolean isAdmin = false; // el usuario tiene privilegios de administrador
	// cache para la obtencion de un userId a partir del username, evitando llamadas repetidas al api para el mismo username
	private String lastUsername = null;
	private Long lastUserid = null;
	// Cuando se debe comprobar el estado de una operacion (check mergeability o rebase)
	// se debe hacer un poll, indica el numero maximo de veces que se comprueba y el delay entre cada una
	private int pollCheckLimit = 50;
	private int pollCheckDelay = 500;

	public GitlabClient(String url, String user, String token, boolean isAdmin) {
		this.api = new GitLabApi(url, token);
		this.user = user;
		this.isAdmin = isAdmin;
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
	 * Borra una rama (esto eliminara sus pull requests)
	 */
	@Override
	public void deleteBranch(String projectId, String branchName) {
		try {
			// puede fallar transitoriamente (se ha visto en algun test justo tras merge de
			// una pr)
			// si falla, espera un poco y reintenta
			deleteBranchImpl(projectId, branchName);
		} catch (Exception e) {
			log.error("Exception trying to delete branch {}, retry: {}", branchName, e.toString());
			Util.delay(2000);
			deleteBranchImpl(projectId, branchName);
		}
	}
	@SneakyThrows(GitLabApiException.class)
	public void deleteBranchImpl(String projectId, String branchName) {
		try {
			log.debug("Deleting branch {} project {}", branchName, projectId);
			api.getRepositoryApi().deleteBranch(projectId, branchName);
		} catch (GitLabApiException e) {
			if (!e.getMessage().contains("Branch Not Found"))
				throw e;
		}
	}

	/**
	 * Obtiene todas las pull requests abiertas, 
	 * opcionalmente seleccionando solo las asignadas al usuario autenticado
	 */
	@Override
	@SneakyThrows(GitLabApiException.class)
	public List<PullRequest> getPullRequests(boolean onlyAssignedToMe) {
		MergeRequestFilter filter = new MergeRequestFilter()
				.withScope(onlyAssignedToMe ? MergeRequestScope.ASSIGNED_TO_ME : MergeRequestScope.ALL)
				.withState(MergeRequestState.OPENED);
		List<MergeRequest> mrs = api.getMergeRequestApi().getMergeRequests(filter, 1, 100);
		List<PullRequest> prs = new ArrayList<>();
		for (MergeRequest mr : mrs) {// inserta al principio para ordenar fecha ascendente
			prs.add(0, mapMergeRequest(mr));
		}
		return prs;
	}

	/**
	 * Obtiene una pull request existente dado el id de proyecto y pr
	 */
	@Override
	@SneakyThrows(GitLabApiException.class)
	public PullRequest getPullRequest(String repoId, long prId) {
		MergeRequest mr = api.getMergeRequestApi().getMergeRequest(asObject(repoId), prId);
		return mapMergeRequest(mr);
	}

	private Object asObject(String id) {
		return NumberUtils.isParsable(id) ? Long.parseLong(id) : id;
	}

	/**
	 * Inserta un comentario en una pull request
	 */
	@Override
	@SneakyThrows(GitLabApiException.class)
	public void addPullRequestCommment(PullRequest pullRequest, String comment) {
		api.getNotesApi().createMergeRequestNote(asObject(pullRequest.repoId()), pullRequest.prId(), comment, null, false);
	}

	/**
	 * Crea una pull request dado el id o nombre de proyecto y los datos de la PR,
	 */
	@Override
	@SneakyThrows(GitLabApiException.class)
	public PullRequest createPullRequest(String projectId, String sourceBranch, String targetBranch, 
			String title, String description, String assignee, List<String> labels, 
			boolean deleteBranchOnMerge, boolean squashOnMerge, boolean setAutoMerge) {
		log.debug("Create gitlab merge request project: {}, source: {}, target: {}, title: {}", projectId, sourceBranch, targetBranch, title);
		MergeRequestParams params = new MergeRequestParams()
				.withSourceBranch(sourceBranch).withTargetBranch(targetBranch)
				.withTitle(title).withDescription(description)
				.withLabels(labels)
				.withRemoveSourceBranch(deleteBranchOnMerge)
				.withSquash(squashOnMerge);
		if (assignee!=null && !"".equals(assignee))
			params.withAssigneeId(getUserIdByName(assignee));
		MergeRequest mr=api.getMergeRequestApi().createMergeRequest(asObject(projectId), params);
		String commitMessage = title + "\n\n" + description;
		if (setAutoMerge)
			this.setAutoMerge(projectId, mr.getIid(), commitMessage);
		return mapMergeRequest(mr);
	}
	
	@SneakyThrows
	public void setAutoMerge(String projectId, Long mrIid, String commitMessage) {
		// Si el automerge se ejecuta inmediatamente de la pr, aparece gitlab api
		// exception 405 method not allowed
		log.info("Set automerge to this pull request");
		for (int i = 0; i <= AUTOMERGE_RETRY_COUNT; i++) { // NOSONAR for clarity
			Thread.sleep(AUTOMERGE_RETRY_WAIT);
			String result = trySetAutoMerge(projectId, mrIid, commitMessage);
			if ("success".equals(result)) {
				log.info("Automerge is set");
				break;
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

	private String trySetAutoMerge(String projectId, Long mrIid, String commitMessage) {
		try {
			AcceptMergeRequestParams params = new AcceptMergeRequestParams()
					.withSquashCommitMessage(commitMessage)
					.withShouldRemoveSourceBranch(true).withSquash(true).withMergeWhenPipelineSucceeds(true);
			api.getMergeRequestApi().acceptMergeRequest(projectId, mrIid, params);
			return "success";
		} catch (GitLabApiException e) {
			return "retry";
		}
	}

	private Long getUserIdByName(String username) throws GitLabApiException {
		// si el ultimo username ha cambiado o no habia sido inicializado obtiene el id
		// invocando el api y guarda cache
		if (!username.equals(lastUsername)) {
			lastUserid = api.getUserApi().getUser(username).getId();
			lastUsername = username;
		}
		return lastUserid;
	}

	private PullRequest mapMergeRequest(MergeRequest mr) {
		String projName=mapProjectName(mr);
		//extrae los prefijos de owner/group (no puede haber repos con el mismo nombre con prefijos diferentes
		String[] names=projName.split("/");
		PullRequest targetpr=new PullRequest()
				.title(mr.getTitle()).description(mr.getDescription()).htmlUrl(mr.getWebUrl())
				.fullName(projName).repoName(names[names.length - 1])
				.repoId(mr.getProjectId().toString()).prId(mr.getIid())
				.isOpen("opened".equals(mr.getState()))
				.assignee(mr.getAssignee()==null ? "" : mr.getAssignee().getUsername().toString())
				.labels(mr.getLabels())
				.sourceBranch(mr.getSourceBranch()).targetBranch(mr.getTargetBranch())
				.sha(mr.getSha());
		//El estado de mergeability es null por defecto, solo se actualiza si ya se ha calculado
		String mergeStatus=mr.getDetailedMergeStatus();
		if (CAN_BE_MERGED.equals(mergeStatus))
			targetpr.canBeMerged(true).cantBeMergedReason("");
		else if (CANNOT_BE_MERGED.equals(mergeStatus) 
				|| MERGEABILITY_TIMEOUT.equals(mergeStatus)
				|| REBASE_TIMEOUT.equals(mergeStatus))
			//si no se puede hacer el merge anota la razon (nota: salvo cannot_be_merged el resto de estados
			//son ficticios (no vienen directamente del api, sino de las comprobaciones realizadas en este cliente)
			//en el caso de cannot_be_merged el valor estado devuelto por gitlab es broken_status,
			//lo deja en cannot be merged para no cambiar el estado de la pr (que es igual en github)
			targetpr.canBeMerged(false)
				.cantBeMergedReason(CANNOT_BE_MERGED.equals(mergeStatus) ? "cannot be merged" : mergeStatus.replace("_", " "));
		return targetpr;		
	}
	
	//la mr no incluye el nombre del proyecto, pero se puede determinar a partir de la referencia full a la mr
	//de la forma giis/testdependabot!106 quitandole !106
	//ojo esto solo para pr dentro del mismo proyecto
	private String mapProjectName(MergeRequest mr) {
		if (mr.getReferences() == null)
			return "unknown";
		String name = mr.getReferences().getFull();
		int posId = name.indexOf("!");
		return name.substring(0, posId);
	}
	
	/**
	 * Realiza un merge de una pull request con un rebase previo, 
	 * comprobando si no se puede hacer el merge (pe por haber conflictos).
	 * Devuelve una PR con los valores actualizados (el sha si ha habido rebase, el estado de mergeability).
	 * NOTA: No contempla MRs entre proyectos diferentes
	 */
	@Override
	@SneakyThrows(GitLabApiException.class)
	public PullRequest rebaseAndMerge(PullRequest pr, boolean squash) {
		log.debug("Rebase/Merge PR {} {} {} {} {}", pr.sha(), pr.repoId(), pr.repoName(), pr.prId(), pr.title());

		// Antes de hacer el merge comprueba si se puede hacer el merge sin conflictos,
		// finaliza si los hay
		MergeRequest mr = runMergeabilityCheck(pr.repoId(), pr.prId());
		if (CANNOT_BE_MERGED.equals(mr.getDetailedMergeStatus()) || MERGEABILITY_TIMEOUT.equals(mr.getDetailedMergeStatus())) {
			logMr("Can't merge PR:", mr);
			addCommentConflictsFound(pr);
			return mapMergeRequest(mr);
		}
		
		//Ahora el rebase, que es omitido si el paso anterior ha determinado que no hay commits delante de este
		if (mr.getDivergedCommitsCount() > 0) {
			mr = runRebase(mr);
			if (CANNOT_BE_MERGED.equals(mr.getDetailedMergeStatus()) || REBASE_TIMEOUT.equals(mr.getDetailedMergeStatus())) {
				logMr("Can't merge PR:", mr);
				addCommentConflictsFound(pr);
				return mapMergeRequest(mr);
			}
		} else {
			logMr("Don't need rebase:", mr);
		}

		// Tras todas las comprobaciones se puede hacer el merge
		logMr("Merging MR:", mr);
		AcceptMergeRequestParams params = new AcceptMergeRequestParams();
		if (squash) // si hace squash pone en el commit el mensaje de la pr
			params.withSquashCommitMessage(pr.title() + "\n\n" + pr.description());
		// en Gitlab se habra indicado antes en la merge request que se hara squash
		mr = api.getMergeRequestApi().acceptMergeRequest(pr.repoId(), pr.prId(), params);
		return mapMergeRequest(mr);
	}

	private MergeRequest runMergeabilityCheck(String projectId, Long prId) throws GitLabApiException {
		MergeRequest mr=null;
		//Realiza lecturas sucesivas hasta que el estado de mergeability es decidido (en sentido positivo o negativo)
		//https://docs.gitlab.com/ee/api/merge_requests.html#single-merge-request-response-notes
		for (int i = 1; i <= pollCheckLimit; i++) {
			mr = api.getMergeRequestApi().getMergeRequest(asObject(projectId), prId, null, true, null); // incluye diverged commit count
			log.debug("Checking mergeability: {} status: {} diverged commits: {}", mr.getSha(), mr.getDetailedMergeStatus(), mr.getDivergedCommitsCount());
			if (mr.getDivergedCommitsCount() != null && (CAN_BE_MERGED.equals(mr.getDetailedMergeStatus()) || CANNOT_BE_MERGED.equals(mr.getDetailedMergeStatus())))
				break;
			if (i == pollCheckLimit) // tras todas las iteraciones no se llega a conclusion, sale con un estado ficticio de timeout
				mr.setDetailedMergeStatus(MERGEABILITY_TIMEOUT);
			Util.delay(pollCheckDelay);
		}
		return mr;
	}
	private MergeRequest runRebase(MergeRequest mr) throws GitLabApiException {
		Long projectId = mr.getProjectId();
		Long prId = mr.getIid();
		logMr("Begin rebase MR:", mr);
		String sha = mr.getSha();
		mr = api.getMergeRequestApi().rebaseMergeRequest(projectId, prId);
		//Tras el rebase no basta con comprobar rebase in progress, 
		//hay que esperar que el sha cambie, y comprobar de nuevo el estado de mergeability
		//https://docs.gitlab.com/ee/api/merge_requests.html#single-merge-request-response-notes
		for (int i = 1; i <= pollCheckLimit; i++) {
			mr = api.getMergeRequestApi().getMergeRequest(projectId, prId, null, null, true); // incluye rebase in progress
			log.debug("Checking rebase: {} in progress: {} status: {}", mr.getSha(), mr.getRebaseInProgress(), mr.getDetailedMergeStatus());
			if (!mr.getRebaseInProgress() && !sha.equals(mr.getSha())
					&& (mr.getDetailedMergeStatus().equals(CAN_BE_MERGED) || mr.getDetailedMergeStatus().equals(CANNOT_BE_MERGED)))
				break;
			if (i == pollCheckLimit) // tras todas las iteraciones no se llega a conclusion, sale con un estado ficticio de timeout
				mr.setDetailedMergeStatus(REBASE_TIMEOUT);
			Util.delay(pollCheckDelay);
		}
		logMr("End rebase MR:", mr);
		return mr;
	}

	private void addCommentConflictsFound(PullRequest pr) throws GitLabApiException {
		addPullRequestCommment(pr, "This update could not be processed due to merge conflicts");
	}

	private void logMr(String prefix, MergeRequest mr) {
		log.debug(prefix + " {} {} {} {} {} {}", mr.getSha(), mr.getDetailedMergeStatus(), mr.getProjectId(),
				mr.getReferences().getFull(), mr.getIid(), mr.getTitle());
	}

}
