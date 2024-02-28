package giis.dashgit.updater.test;

import static org.junit.Assert.assertEquals;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.junit.Test;

import giis.dashgit.updater.ConflictResolver;
import giis.qabot.ci.clients.IConflictResolver;
import giis.visualassert.Framework;
import giis.visualassert.VisualAssert;
import giis.visualassert.portable.FileUtil;

/**
 * Automatic resolution of files with merge conflicts
 */
public class TestUtConflictResolution extends Base {
	private VisualAssert va=new VisualAssert().setFramework(Framework.JUNIT4);

	// Conflicts can be resolved
	// - adjacent/non adjacent conflicting lines
	// - 1/more conflicts in same file
	// Conflicts can't be resolved
	// - single conflict / multiple conflicts / part of conflicts resolved
	// - different number of lines in a conflict
	
	private String pristineSingle=content(
			lines("begin"), conflict(
			new String[] {"<x>2.2.2</x>","<y>4.4.4</y>"},
			new String[] {"<x>1.1.1</x>","<y>5.5.5</y>"}),
			lines("end")
			);
	private String pristineMultiple=content(
			lines("begin1"), conflict(
			new String[] {"<x>2.2.2</x>","<z>3.3.3</z>","<y>4.4.4</y>"},
			new String[] {"<x>1.1.1</x>","<z>3.3.3</z>","<y>5.5.5</y>"}),
			lines("end1", "begin2"), conflict(
			new String[] {"<v>1.2.3</v>","<w>4.5.5</w>"},
			new String[] {"<v>1.2.2</v>","<w>4.5.6</w>"}),
			lines("end2")
			);
	
	@Test
	public void testConflictResolvedSingle() {
		FileUtil.fileWrite("target/conflict.txt", pristineSingle);
		IConflictResolver resolver = new ConflictResolver();
		int unresolved = resolver.resolve("target/conflict.txt");
		String expected = content(lines("begin", "<x>2.2.2</x>", "<y>5.5.5</y>", "end"));
		va.assertEquals(expected, FileUtil.fileRead("target/conflict.txt"));
		assertEquals(0, unresolved);
	}
	
	@Test
	public void testConflictResolvedMultiple() {
		FileUtil.fileWrite("target/conflict.txt", pristineMultiple);
		IConflictResolver resolver = new ConflictResolver();
		int unresolved = resolver.resolve("target/conflict.txt");
		String expected = content(lines(
				"begin1", "<x>2.2.2</x>", "<z>3.3.3</z>", "<y>5.5.5</y>", "end1", 
				"begin2", "<v>1.2.3</v>", "<w>4.5.6</w>", "end2"));
		va.assertEquals(expected, FileUtil.fileRead("target/conflict.txt"));
		assertEquals(0, unresolved);
	}
	
	@Test
	public void testConflictUnesolvedSingle() {
		String pristine = pristineSingle.replace("<x>2.2.2</x>", "<XX>2.2.2</XX>");
		FileUtil.fileWrite("target/conflict.txt", pristine);
		IConflictResolver resolver = new ConflictResolver();
		int unresolved = resolver.resolve("target/conflict.txt");
		va.assertEquals(pristine, FileUtil.fileRead("target/conflict.txt"));
		assertEquals(1, unresolved);
	}

	@Test
	public void testConflictUnesolvedMultiple() {
		String pristine = pristineMultiple
				.replace("<x>2.2.2</x>", "<XX>2.2.2</XX>")
				.replace("<w>4.5.6</w>", "<WW>4.5.6</WW>");
		FileUtil.fileWrite("target/conflict.txt", pristine);
		IConflictResolver resolver = new ConflictResolver();
		int unresolved = resolver.resolve("target/conflict.txt");
		va.assertEquals(pristine, FileUtil.fileRead("target/conflict.txt"));
		assertEquals(2, unresolved);
	}

	@Test
	public void testConflictUnesolvedPartial() {
		String pristine = pristineMultiple.replace("<w>4.5.6</w>", "<WW>4.5.6</WW>");
		FileUtil.fileWrite("target/conflict.txt", pristine);
		IConflictResolver resolver = new ConflictResolver();
		int unresolved = resolver.resolve("target/conflict.txt");
		// In this case, a conflict was resolved, but not the other, can't compare against the pristine
		String expected=content(
				lines("begin1"), lines("<x>2.2.2</x>","<z>3.3.3</z>","<y>5.5.5</y>"),
				lines("end1", "begin2"), conflict(
				new String[] {"<v>1.2.3</v>","<w>4.5.5</w>"},
				new String[] {"<v>1.2.2</v>","<WW>4.5.6</WW>"}),
				lines("end2")
				);
		va.assertEquals(expected, FileUtil.fileRead("target/conflict.txt"));
		assertEquals(1, unresolved);
	}
	
	// Utilities to compose inputs and outputs
	
	@SafeVarargs
	private String content(List<String>... items) {
		List<String> lst = new ArrayList<>();
		for (List<String> item : items)
			lst.addAll(item);
		return String.join("\n", lst);
	}
	private List<String> conflict(String[] left, String[] right) {
		List<String> conflict = new ArrayList<>();
		conflict.add("<<<<<<< HEAD");
		conflict.addAll(Arrays.asList(left));
		conflict.add("=======");
		conflict.addAll(Arrays.asList(right));
		conflict.add(">>>>>>> branch-a");
		return conflict;
	}
	private List<String> lines(String... str) {
		List<String> lst = new ArrayList<>();
		lst.addAll(Arrays.asList(str));
		return lst;
	}
	
	// Other low level tests
	
	@Test
	public void testLineCompareWithMatch() {
		// style java prop/node, change major/patch, higher is left/right
		assertLine("<version>56.33.11</version>", "<version>56.33.11</version>", "<version>55.33.11</version>");
		assertLine("<version>1.3.5</version>", "<version>1.3.4</version>", "<version>1.3.5</version>");
		assertLine("'dep': '1.3.5'", "'dep': '1.3.5'", "'dep': '1.3.4'");
		// allow >3 components
		assertLine("<version>1.3.5.7</version>", "<version>1.3.5.6</version>", "<version>1.3.5.7</version>");
		// with qualifier (dash, dot)
		assertLine("<version>3.2.1-rc1</version>", "<version>3.2.1-rc1</version>", "<version>3.2.0-rc1</version>");
		assertLine("<version>3.2.1.rc1</version>", "<version>3.2.1.rc1</version>", "<version>3.2.0.rc1</version>");
	}
	
	@Test
	public void testLineCompareNoMatch() {
		// Differences in number of components, dependency name
		assertLine("", "<version>1.3.4</version>", "<version>1.3.4.5</version>");
		assertLine("", "'dep': '1.3.5'", "'dep2': '1.3.4'");
		// No version at one side
		assertLine("", "<version>1.3.4</version>", "<version>a.b.c</version>");
		assertLine("", "<version>a.b.c</version>", "<version>1.3.4</version>");
		// no version located (none, 2 components)
		assertLine("", "<version>1.3</version>", "<version>1.2</version>");
		assertLine("", "<version>a.b.c</version>", "<version>a.b.d</version>");
	}
	private void assertLine(String expected, String left, String right) {
		assertEquals(expected.replace("'", "\""),
				ConflictResolver.handleConflictingLine(0, left.replace("'", "\""), right.replace("'", "\"")));
	}

	@Test
	public void testVersionCompare() {
		assertEquals("1.2.4", ConflictResolver.getLatestVersion("1.2.3", "1.2.4"));
		assertEquals("1.2.4", ConflictResolver.getLatestVersion("1.2.4", "1.2.3"));

		assertEquals("1.3.3", ConflictResolver.getLatestVersion("1.2.3", "1.3.3"));
		assertEquals("1.3.3", ConflictResolver.getLatestVersion("1.3.3", "1.2.3"));

		assertEquals("2.2.3", ConflictResolver.getLatestVersion("1.2.3", "2.2.3"));
		assertEquals("2.2.3", ConflictResolver.getLatestVersion("2.2.3", "1.2.3"));

		assertEquals("1.2.3", ConflictResolver.getLatestVersion("1.2.3", "1.2.3"));
	}

}
