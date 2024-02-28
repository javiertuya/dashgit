package giis.qabot.ci.clients;

public interface IConflictResolver {

	/**
	 * Process each line in a file with merge conflicts produced by changes in
	 * dependency versions; for each conflict, tries to resolve it to the higher
	 * version. The conflicting file is overwritten to reflect the resolved
	 * conflicts. Returns the number of remaining unresolved conflicts.
	 */
	int resolve(String fileName);

}