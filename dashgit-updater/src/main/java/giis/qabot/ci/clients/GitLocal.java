package giis.qabot.ci.clients;

import org.apache.commons.io.FileUtils;
import org.eclipse.jgit.api.CherryPickResult;
import org.eclipse.jgit.api.Git;
import org.eclipse.jgit.api.MergeResult;
import org.eclipse.jgit.api.ResetCommand.ResetType;
import org.eclipse.jgit.api.errors.GitAPIException;
import org.eclipse.jgit.api.errors.TransportException;
import org.eclipse.jgit.lib.ObjectId;
import org.eclipse.jgit.transport.PushResult;
import org.eclipse.jgit.transport.RemoteRefUpdate;
import org.eclipse.jgit.transport.UsernamePasswordCredentialsProvider;

import giis.qabot.core.models.Util;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;

import java.io.File;
import java.io.IOException;
import java.nio.file.Paths;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Map;

//https://git-scm.com/book/es/v2/Ap%C3%A9ndice-B%3A-Integrando-Git-en-tus-Aplicaciones-JGit
//https://github.com/centic9/jgit-cookbook
//https://www.codeaffine.com/2014/12/09/jgit-authentication/

/**
 * Api a Git local usando jgit.
 * Ademas de los datos de acceso al repositorio remoto (necesarios para clone y push)
 * establece un directorio raiz bajo el cual se crearan los workdir para los proyectos clonados
 * (usando un nombre unico para cada clon).
 * Mantiene internamente el objeto Git que debe ser cerrado cuando se deje de usar
 * (o usar en un try with resources)
 */
@Slf4j
public class GitLocal implements AutoCloseable {
	private String rootDir; // bajo esta carpeta se crean los workdir al hacer clone
	private String rootUrl; // url de git, sin nombre de repositorio
	private String user;
	private String token;
	// Las siguientes establecen el contexto cuando se clona un repositorio
	private Git git; // objeto del api creado al hacer cloneRepository
	private String workTree; // directorio de trabajo relativo
	private boolean cleanOnClose = false; // si true borra el workTree al cerrar este objeto
	private String defaultBranch; // solo se podra conocer si este objeto ha clonado el repo
	private String timestamp; // identifica de forma unica esta instancia

	public GitLocal(String rootDir, String rootUrl, String user, String token) {
		this.rootDir = rootDir;
		this.rootUrl = rootUrl;
		if (rootUrl.contains("api.github.com")) // para uso en local, github no debe usar la direccion del api
			this.rootUrl = "https://github.com";
		this.user = user;
		this.token = token;
		this.timestamp = new SimpleDateFormat("yyyyMMdd-HHmmssSSS").format(new Date());
	}

	@Override
	public void close() {
		if (git != null) {
			git.getRepository().close();
			git.close();
		}
		if (cleanOnClose)
			cleanWorkDir();
	}

	public GitLocal setCleanOnClose(boolean value) {
		this.cleanOnClose = value;
		return this;
	}

	private String getNewWorkdirName(String repoName) {
		return repoName.replace("/", "_") + "-" + timestamp;
	}

	public String getWorkTree() {
		return git.getRepository().getWorkTree().toString();
	}

	public String getTimestamp() {
		return this.timestamp;
	}

	/**
	 * Crea un nuevo repositorio local en una carpeta bajo el rootDir establecido en la instanciacion
	 * con el contenido de la rama por defecto del repositorio establecido en la inicializacion
	 */
	@SneakyThrows(GitAPIException.class)
	public GitLocal cloneRepository(String repoName) {
		// Antes de clonar crea la carpeta de trabajo donde se va a clonar (se guarda en variable de instancia)
		workTree = createWorkTree(repoName);
		git = Git.cloneRepository().setURI(rootUrl + "/" + repoName).setDirectory(new File(workTree))
				.setCredentialsProvider(new UsernamePasswordCredentialsProvider(user, token)).call();
		defaultBranch = getCurrentBranch();
		log.debug("Default branch: {}", defaultBranch);
		return this;
	}

	@SneakyThrows(IOException.class)
	private String createWorkTree(String repoName) {
		FileUtils.forceMkdir(new File(rootDir));
		String workDir = getNewWorkdirName(repoName); // directorio de trabajo relativo
		String workTreeString = Paths.get(rootDir, workDir).toString();
		FileUtils.forceMkdir(new File(workTreeString));
		log.debug("Cloning remote repository: {}/{}", rootUrl, repoName);
		log.debug("Local repository workdir: {}/{}", rootDir, workDir);
		return workTreeString;
	}

	@SneakyThrows(IOException.class)
	private String getCurrentBranch() {
		return git.getRepository().getBranch();
	}
	
	/**
	 * Borra la carpeta donde se ha clonado el repo, normalmente se realiza al cerrar si se ha especificado cloneOnClose
	 * Controla excepcion porque es posible que ya no exista si el CI ha eliminado el workspace antes de ejectuarse este metodo
	 */
	@SneakyThrows(IOException.class)
	public void cleanWorkDir() {
		try {
			FileUtils.deleteDirectory(new File(workTree));
		} catch (RuntimeException e) {
			log.warn("Exception {} cleaning workdir {}. maybe the CI has already deleted the workspace", e.getMessage(), workTree);
		}
	}

	/**
	 * Commit del repositorio local (inclye ficheros nuevos y borrados en el indice)
	 */
	@SneakyThrows(GitAPIException.class)
	public GitLocal commit(String message) {
		log.debug("Commit branch {} '{}'", getCurrentBranch(), message);
		git.add().addFilepattern(".").call(); // including new files, excluding deleted files
		git.add().addFilepattern(".").setUpdate(true).call(); // including deleted files, excluding new files
		git.commit().setMessage(message).call();
		return this;
	}

	/**
	 * Push del repositorio local, con la opcion de push -f
	 */
	@SneakyThrows(GitAPIException.class)
	public GitLocal push(boolean forcePush) {
		log.debug("Push branch {} to remote repository", getCurrentBranch());
		// Se ha observado que el push a veces es flaky, tras varios push repetidos cuando se prueba gitlab
		// aparece una excepcion org.eclipse.jgit.api.errors.TransportException 
		// originada por java.net.SocketException con mensaje SocketClosed
		// Si falla el push espera un poco y reintenta, monitorizar si esto evita los fallos
		Iterable<PushResult> results;
		try {
			results = git.push().setCredentialsProvider(new UsernamePasswordCredentialsProvider(user, token)).setForce(forcePush).call();
		} catch (TransportException e) {
			log.error("Push Branch Exception, wait and retry {}", e.toString());
			Util.delay(2000);
			results = git.push().setCredentialsProvider(new UsernamePasswordCredentialsProvider(user, token)).setForce(forcePush).call();
		}
		checkPushResultStatus(results);
		return this;
	}

	private void checkPushResultStatus(Iterable<PushResult> results) {
		StringBuilder sb = new StringBuilder();
		boolean statusOk = true;
		for (PushResult res : results) {
			Iterable<RemoteRefUpdate> rrupdates = res.getRemoteUpdates();
			for (RemoteRefUpdate rrupdate : rrupdates) {
				sb.append("\n").append(rrupdate.toString());
				if (rrupdate.getStatus() != RemoteRefUpdate.Status.OK)
					statusOk = false;
			}
		}
		if (statusOk) {
			log.debug("Push results:" + sb.toString());
		} else {
			log.error("Push results:" + sb.toString());
			throw new ClientException("Push branch failed:" + sb.toString());
		}
	}

	/**
	 * Se establece en la rama indicada, con la opcion de crear la rama a partir de la actual (checkout -b)
	 */
	@SneakyThrows(GitAPIException.class)
	public GitLocal checkout(String branch, boolean createBranch) {
		log.debug("Checkout branch: {}, create new branch: {}", branch, createBranch);
		git.checkout().setName(branch).setCreateBranch(createBranch).call();
		return this;
	}

	/**
	 * Se establece en la rama por defecto que ha sido determinada al clonar el repositorio
	 * (si en vez de clonar se ha abierto un repositorio existente, no se conoce la
	 * rama por defecto y causa excepcion)
	 */
	public GitLocal checkoutDefault() {
		if (defaultBranch == null)
			throw new ClientException("Can't know default branch as this instance has not cloned the repo");
		return checkout(defaultBranch, false);
	}

	public String getDefaultBranch() {
		return defaultBranch;
	}

	/**
	 * Cherry pick del commit con el sha indicado, devuelve true si se realiza correctamente el commit,
	 * si no, devuelve false, deshaciendo los cambios 
	 */
	@SneakyThrows(GitAPIException.class)
	public boolean cherryPick(String sha, String prTitle) {
		log.debug("Cherry pick {}", sha);
		ObjectId commitId = getCommitId(sha);
		CherryPickResult res = git.cherryPick().include(commitId).call();
		log.debug("cherry pick status: {}", res.getStatus().toString());
		// Si no tiene exito hace un reset de la rama para deshacer cambios,
		if (res.getStatus() != CherryPickResult.CherryPickStatus.OK)
			git.reset().setMode(ResetType.HARD).call();
		return res.getStatus() == CherryPickResult.CherryPickStatus.OK;
	}
	
	@SneakyThrows(GitAPIException.class)
	public boolean merge(String sha, String prTitle) {
		log.debug("Merge from {}", sha);
		ObjectId commitId = getCommitId(sha);
		MergeResult res = git.merge().include(commitId).call();
		log.debug("Merge status: {}", res.getMergeStatus().toString());
		// Si no tiene exito muestra conflictos y reset de la rama para deshacer cambios
		if (!res.getMergeStatus().isSuccessful()) {
			for (Map.Entry<String, int[][]> conflict : res.getConflicts().entrySet()) {
				log.warn("Conflicting file: {}", conflict.getKey());
				String fileContent = readWorkspaceFile(this, conflict.getKey());
				log.trace("Conflicting file content: {}", fileContent);
			}
			git.reset().setMode(ResetType.HARD).call();
		}
		return res.getMergeStatus().isSuccessful();
	}

	@SneakyThrows(IOException.class)
	protected String readWorkspaceFile(GitLocal git, String fileName) {
		return FileUtils.readFileToString(Paths.get(git.getWorkTree(), fileName).toFile(), "UTF-8");
	}
	
	@SneakyThrows(IOException.class)
	private ObjectId getCommitId(String sha) {
		return git.getRepository().resolve(sha);
	}

	@SneakyThrows(IOException.class)
	private ObjectId getBranchId(String name) {
		return git.getRepository().resolve(name);
	}
	
}
