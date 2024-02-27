package giis.qabot.ci.clients;

import java.util.List;

import giis.qabot.ci.models.PullRequest;

public interface IGitClient {

	IGitClient pollCheckLimit(int iterations);

	IGitClient pollCheckDelay(int milliseconds);

	/**
	 * Obtiene el nombre del usuario utilizado en la autenticacion a este cliente
	 */
	String getUsername();
	
	/**
	 * Indica si el usuario utilizado en la autenticacion a este cliente 
	 * tiene permisos elevados de administracion sobre el repositorio
	 */
	boolean isAdmin();
	
	/**
	 * Borra una rama (esto eliminara sus pull requests)
	 */
	void deleteBranch(String projectId, String branchName);

	/**
	 * Obtiene todas las pull requests abiertas, 
	 * opcionalmente seleccionando solo las asignadas al usuario autenticado
	 */
	List<PullRequest> getPullRequests(boolean onlyAssignedToMe);

	/**
	 * Obtiene una pull request existente dado el id de proyecto y pr
	 */
	PullRequest getPullRequest(String repoId, long prId);

	/**
	 * Inserta un comentario en una pull request
	 */
	void addPullRequestCommment(PullRequest pullRequest, String comment);

	/**
	 * Crea una pull request dado el id o nombre de proyecto y los datos de la PR,
	 */
	PullRequest createPullRequest(String projectId, String sourceBranch, String targetBranch, String title, //NOSONAR
			String description, String assignee, List<String> labels, 
			boolean deleteBranchOnMerge, boolean squashOnMerge, boolean setAutoMerge);

	/**
	 * Realiza un merge de una pull request con un rebase previo, 
	 * comprobando si no se puede hacer el merge (pe por haber conflictos).
	 * Devuelve una PR con los valores actualizados (el sha si ha habido rebase, el estado de mergeability).
	 * NOTA: No contempla MRs entre proyectos diferentes
	 */
	PullRequest rebaseAndMerge(PullRequest pr, boolean squash);

}