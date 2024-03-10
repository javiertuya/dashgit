package giis.qabot.ci.clients;

import org.springframework.http.ResponseEntity;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import giis.qabot.core.clients.RestClient;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;

/**
 * Proporciona acceso usando graphql a algunas funcionalidades del api de github 
 * que requieren navegar por la estructura de objetos, 
 * por lo que no pueden ser obtenidas directamente con el api rest.
 * Incluye las queries a utilizar y un metodo general para ejectuar la query, devolviendo un JsonNode
 */
@Slf4j
public class GithubGraphqlClient {
	private String url;
	private String token;
	private String scope="";

	public GithubGraphqlClient(String url, String token) {
		this.url=url + "/graphql";
		this.token=token;
	}

	/**
	 * Establece el alcance que determina los proyectos que se buscaran en el repositorio
	 * NOTA: Para que el usuario que accede pueda ver los repos de organizaciones desde graphql
	 * hay que tener activado el perimiso para las organizaciones. En settings del usuario:
	 * applications-authorized oauth apps-GraphQL API Explorer-Organization access
	 * dar permiso para la organizacion que se deee
	 */
	public GithubGraphqlClient scope(String scope) {
		this.scope = "";
		if ("owner".equalsIgnoreCase(scope))
			this.scope = "ownerAffiliations: [OWNER, ORGANIZATION_MEMBER], isArchived:false, isFork:false,";
		else if ("collaborator".equalsIgnoreCase(scope))
			this.scope = "ownerAffiliations: COLLABORATOR, isArchived:false, isFork:false,";
		return this;
	}

	/**
	 * Obtencion de todos los proyectos con un scope dado, con posibilidad de incluir datos de las ramas
	 */
	public String getProjectsQuery(boolean includeBranches) {
	    return "query {\n" // NOSONAR to be backport compatible
	    		+ "  viewer {\n"
	    		+ "    login, resourcePath, url, repositories(first: 40, " + this.scope + " orderBy: {field: UPDATED_AT, direction: DESC}) {\n"
	    		+ "      nodes {\n"
	    		+ "        name, nameWithOwner, url, updatedAt\n"
	    		+ (includeBranches ? getBranchesFragment() : "")
	    		+ "}\n}\n}\n}";
	}
	/**
	 * Fragmento para obtener las ramas y sus detalles
	 */
	public String getBranchesFragment() {
	    return "        refs(refPrefix: \\\"refs/heads/\\\", first: 20) {\n" // NOSONAR to be backport compatible
	    		+ "          nodes {\n"
	    		+ "            name\n"
	    		+ "            target {\n"
	    		+ "              ... on Commit {\n"
	    		+ "                history(first: 1) { nodes { messageHeadline, committedDate, statusCheckRollup { state } } }\n"
	    		+ "        }\n}\n}\n}";
	}
	
	/**
	 * Obtencion de todas las pull requests asignadas
	 */
	public String getPullRequestsQuery() {
		return "{\n" // NOSONAR to be backport compatible
				+ "  viewer {\n"
				+ "    login, resourcePath, url\n"
				+ "    repositories(last: 40, " + this.scope + " orderBy: {field: UPDATED_AT, direction: DESC}) {\n"
				+ "      nodes {\n"
				+ "        name, nameWithOwner, url, updatedAt\n"
				+ "        pullRequests(first: 20, states:OPEN) {\n"
				+ "          nodes {\n"
				+              getPullRequestItemsFragment()
				+ "  }\n}\n}\n}\n}\n}";
	}
	private String getPullRequestItemsFragment() {
		return    "            title, body, url, number, \n" // NOSONAR to be backport compatible
				+ "            state, mergeable\n"
				+ "            baseRefName, headRefName, headRefOid\n"
				+ "            labels (first: 6) {\n"
				+ "              edges { node { name } }\n"
				+ "            }\n"
				+ "            assignees (first:6) {\n"
				+ "              edges { node { login } }"
				+ "            \n}\n";
	}

	//Obtencion de objetos individuales
	
	private String getRepositoryQueryHeader(String repoId) {
		String[] comp=repoId.split("/");
		String owner="\\\"" + comp[0] + "\\\"";
		String repo="\\\"" + comp[1] + "\\\"";
		return "repository(name: " + repo + ", owner: " + owner + ")";
	}
	/**
	 * Obtencion de un proyecto dado por su id (owner/repo)
	 */
	public String getProjectQuery(String repoId, boolean includeBranches) {
		return "{\n" // NOSONAR to be backport compatible
				+    getRepositoryQueryHeader(repoId) + " {\n"
				+ "    name, nameWithOwner, url, updatedAt\n"
	    		+ (includeBranches ? getBranchesFragment() : "")
				+ "  }\n"
				+ "}";
	}

	/**
	 * Obtencion de una pull request dado el repo id (owner/repo) y el id de la pr
	 */
	public String getPullRequestQuery(String repoId, String prId) {
		return "{\n" // NOSONAR to be backport compatible
				+    getRepositoryQueryHeader(repoId) + " {\n"
				+ "    pullRequest(number: " + prId + ") {\n"
				+        getPullRequestItemsFragment()
				+ "  }\n}\n}";
	}
	
	public String getAutoMergeQuery (String nodeId, String commitHeadline, String commitBody) {
		String query="mutation MyMutation {\n" // NOSONAR to be backport compatible
				+ "  enablePullRequestAutoMerge(input: {"
				+ "      pullRequestId: \\\"{nodeId}\\\", "
				+ "      mergeMethod: SQUASH, "
				+ "      commitHeadline:\\\"{commitHeadline}\\\", "
				+ "      commitBody:\\\"{commitBody}\\\""
				+ "    } ) {\n"
				+ "    clientMutationId\n"
				+ "  }\n"
				+ "}";
		query=query.replace("{nodeId}", nodeId)
				.replace("{commitHeadline}", commitHeadline.replace("\"", "\\\\\\\""))
				.replace("{commitBody}", commitBody.replace("\"", "\\\\\\\"").replace("\n", "\\n"));
		return query;
	}

	/**
	 * Encierra una query graphql en un json a utilizar en un post.
	 * Notar que si la query tiene comillas estas tienen que tener doble escape
	 */
	public String getGraphqlToJsonQuery(String graphql) {
		return "{ \"query\": \"" + graphql.replace("\n", "") + "\" }";
	}
	
	/**
	 * Ejecuta una query graphql contra github
	 */
	@SneakyThrows
	public JsonNode postGraphql(String query) {
		log.trace("Graphql query: {}", query);
		// Encierra la query en un json
		query = getGraphqlToJsonQuery(query);

		// Realiza el post (con resttemplate) obteniendo un string json
		ResponseEntity<String> response = new RestClient().post(this.url, query, this.token);
		log.trace("Result Status: {}", response.getStatusCode().toString());
		log.trace("Result Json: {}", response.getBody().toString());

		// convierte en jsonNode para posterior tratamiento
		ObjectMapper mapper = new ObjectMapper();
		return mapper.readTree(response.getBody());
	}
	
}
