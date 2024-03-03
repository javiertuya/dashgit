package giis.dashgit.updater;

/**
 * See UpdaterController.java
 */
public class Main {
	public static void main(String[] args) {
		if (args.length != 1) {
			System.out.println("Requird: A parameter with the update.json file");
			System.exit(1);
		}
		new UpdaterController().run(args[0]);
	}
}
