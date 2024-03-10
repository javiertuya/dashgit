package giis.dashgit.updater;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import giis.portable.util.FileUtil;
import giis.qabot.ci.clients.IConflictResolver;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;

/**
 * Automatic resolution of merge conflicts: Detects conflicts produced by changes
 * of dependency versions in adjacent lines and resolves to the higher version.
 * 
 * Requires that lines in each conflict differ only in strings that represent
 * the semantic version (more than 3 numbers are allowed).
 */
@Slf4j
public class ConflictResolver implements IConflictResolver {
	private static final String VERSION_PLACEHOLDER = "{version}";

	private enum State {
		OUTSIDE_CONFLICT, LEFT, RIGHT
	}
	private String fileName;
	private int unresolvedCount;
	private State state;

	private List<String> resolved; // output after resolution

	// data of a conflict
	private String leftMarker;
	private List<String> leftLines;
	private String middleMarker;
	private List<String> rightLines;
	private String rightMarker;

	/**
	 * Process each line in a file with merge conflicts produced by changes in
	 * dependency versions; for each conflict, tries to resolve it to the higher
	 * version. The conflicting file is overwritten to reflect the resolved
	 * conflicts. Returns the number of remaining unresolved conflicts.
	 */
	@Override
	@SneakyThrows
	public int resolve(String fileName) {
		this.fileName = fileName;
		unresolvedCount = 0;
		state = State.OUTSIDE_CONFLICT;
		List<String> pristine = FileUtil.fileReadLines(fileName);
		resolved = new ArrayList<>();
		reinitConflict();
		
		for (String line : pristine) {
			processTransition(line);
		}
		
		String resolvedString = String.join("\n", resolved);
		log.info("Remaining unresolved conflicts: {}", unresolvedCount);
		log.trace("Writing file content:\n{}", resolvedString);
		FileUtil.fileWrite(fileName, resolvedString);
		return unresolvedCount;
	}

	private void reinitConflict() {
		leftMarker = null;
		middleMarker = null;
		rightMarker = null;
		leftLines = new ArrayList<>();
		rightLines = new ArrayList<>();
	}
	
	private void processTransition(String line) {
		if (line.startsWith("<<<<<<")) {
			leftMarker = line;
			state = State.LEFT;
		} else if (line.startsWith("======")) {
			middleMarker = line;
			state = State.RIGHT;
		} else if (line.startsWith(">>>>>>")) {
			rightMarker = line;
			state = State.OUTSIDE_CONFLICT;
			boolean locallyResolved = handleConflict();
			unresolvedCount += locallyResolved ? 0 : 1;
			log.info(locallyResolved ? "Conflicting lines resolved" : "Conflicting lines NOT resolved");
			reinitConflict();
		} else {
			processState(line);
		}
	}
	private void processState(String line) {
		if (state == State.OUTSIDE_CONFLICT)
			resolved.add(line);
		else if (state == State.LEFT)
			leftLines.add(line);
		else if (state == State.RIGHT)
			rightLines.add(line);
	}
	
	//resolves a conflict, if resolved adds the result to the stream, if not adds the original conflict,
	//returns true if conflict is resolved
	private boolean handleConflict() {
		log.info("Try to resolve conflict at file {}", fileName);
		log.debug("Conflict to resolve:\n{}", String.join("\n", getConflictingLines()));
		if (leftLines.size() != rightLines.size())
			return unresolveConflict();

		List<String> resolvedLines = new ArrayList<>();
		for (int i = 0; i < leftLines.size(); i++) {
			String result = handleConflictingLine(i, leftLines.get(i), rightLines.get(i));
			if ("".equals(result)) // if at least one can't be resolved, conflict can't be resolved
				return unresolveConflict();
			else
				resolvedLines.add(result);
		}
		// this conflict is resolved, add the resolution to the output
		log.debug("Conflicting lines resolved to:\n{}", String.join("\n", resolvedLines));
		resolved.addAll(resolvedLines);
		return true;
	}

	//returns the resolved line or an empty string
	public static String handleConflictingLine(int lineNumber, String left, String right) {
		Pattern pattern = Pattern.compile("\\d+(\\.\\d+){2,}"); // NOSONAR is the version number of own dependency, allow 3 or more numbers
		Matcher matcher = pattern.matcher(left);
		String leftVersion = matcher.find() ? matcher.group(0) : "";
		matcher = pattern.matcher(right);
		String rightVersion = matcher.find() ? matcher.group(0) : "";
		log.trace("Line {}. Left version number: '{}', right version number: '{}'", 
				lineNumber, leftVersion, rightVersion);

		// must have version numbers at both sides
		if ("".equals(leftVersion) || "".equals(rightVersion)) {
			log.trace("No semantic version numbers at both sides");
			return "";
		}

		// must have the same number of components
		if (leftVersion.split("\\.").length != rightVersion.split("\\.").length) {
			log.trace("Versions have not the same number of components");
			return "";
		}

		// must be equal except the versions
		String leftMask = left.replace(leftVersion, VERSION_PLACEHOLDER);
		String rightMask = right.replace(rightVersion, VERSION_PLACEHOLDER);
		if (!leftMask.equals(rightMask)) {
			log.trace("Both sides difer on more than a version number");
			return "";
		}

		// now can resolve to the latest version
		String latestVersion = getLatestVersion(leftVersion, rightVersion);
		String resolvedLine = leftMask.replace(VERSION_PLACEHOLDER, latestVersion);
		log.trace("Line {}. Resolved to: {}", lineNumber, resolvedLine);
		return resolvedLine;
	}

	public static String getLatestVersion(String leftVersion, String rightVersion) {
		// assumes equal length of components
		String[] left = leftVersion.split("\\.");
		String[] right = rightVersion.split("\\.");
		for (int i = 0; i < left.length; i++)
			if (Integer.valueOf(left[i]) > Integer.valueOf(right[i]))
				return leftVersion;
			else if (Integer.valueOf(left[i]) < Integer.valueOf(right[i]))
				return rightVersion;
		return leftVersion; // default if equal
	}

	// add the original conflict to the output
	private boolean unresolveConflict() {
		log.info("Conflict can not be atomatically resolved");
		resolved.addAll(getConflictingLines());
		return false;
	}

	private List<String> getConflictingLines() {
		List<String> conflict = new ArrayList<>();
		conflict.add(leftMarker);
		conflict.addAll(leftLines);
		conflict.add(middleMarker);
		conflict.addAll(rightLines);
		conflict.add(rightMarker);
		return conflict;
	}

}
