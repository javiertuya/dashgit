package giis.qabot.core.models;

/**
 * Utilidades para formateo de mensajes escritos en el chat, contemplando las
 * variantes debidas al canal utilizado
 */
public class Formatter {
	private String channel;

	public Formatter() {
		this.channel = ""; // default
	}

	public Formatter(String channel) {
		this.channel = channel;
	}

	/**
	 * Muestra un hiperenlace a una url
	 */
	public String url(String title, String url) {
		if ("slack".equals(channel))
			return "<" + url + "|" + title + ">";
		else if ("cmdline".equals(channel)) // shell de rasa, no muestra hipervinculos
			return title;
		return "[" + title + "](" + url + ")";
	}

	/**
	 * Formatea un mensaje completo que usa markdown
	 */
	public String format(String message) {
		if ("slack".equals(channel)) // supone que no existen underscores, elaborar de forma mas fiable
			return message.replace("!!!", ":warning:").replace(":-)", ":slightly_smiling_face:")
					.replace(":-(", ":hot_face:").replace("*", "_").replace("__", "*");
		else
			return message;
	}

}
