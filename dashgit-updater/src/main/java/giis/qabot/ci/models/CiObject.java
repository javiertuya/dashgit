package giis.qabot.ci.models;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.stream.Collectors;

import org.apache.commons.text.similarity.LevenshteinDistance;

import giis.qabot.core.models.Formatter;
import giis.qabot.core.models.Util;
import lombok.Getter;
import lombok.Setter;
import lombok.experimental.Accessors;

/**
 * Datos de un proyecto/rama del sistema de CI
 */
@Accessors(fluent=true)
public class CiObject {
	@Getter @Setter private String name="";
	@Getter @Setter private String id="";
	@Getter @Setter private CiStatus status=CiStatus.UNKNOWN;
	@Getter @Setter private String statusInfo=""; //informacion adicional opcional
	@Getter @Setter private String statusSummary="unknown";
	@Getter @Setter private Date buildDate=new Date(0);
	@Getter @Setter private String htmlUrl="";
	@Getter @Setter private CiObjectType type=CiObjectType.UNKNOWN;
	//Detalles (proyectos si es la raiz, ramas si es proyecto, ...)
	@Getter @Setter private List<CiObject> items=new ArrayList<>();
	//revisar bucles para usar mas streams
	//https://www.baeldung.com/java-streams
	//https://stackify.com/streams-guide-java-8/

	/**
	 * Busca dentro de los items el que coincide con el nombre indicado, null si no existe, case insensitive
	 */
	public CiObject findByName(String name) {
		return this.items().stream().filter(d -> d.name().equalsIgnoreCase(name)).findFirst().orElse(null);
	}

	public CiObject addItem(CiObject ciEntity) {
		items.add(ciEntity);
		return this;
	}

	public CiObject findByStatus(CiStatus status) {
		if (status == CiStatus.ALL) // no filtro
			return this.buildSummary();
		for (int i = this.items.size() - 1; i >= 0; i--)
			if (this.items.get(i).status() != status)
				this.items.remove(i);
		return this.buildSummary();
	}

	public CiObject findByPrefix(String prefix) {
		for (int i = this.items.size() - 1; i >= 0; i--)
			if (!this.items.get(i).name().contains(prefix))
				this.items.remove(i);
		return this.buildSummary();
	}

	public CiObject sortByDate() {
		items.sort(Comparator.<CiObject, Date>comparing(CiObject::buildDate));
		return this;
	}

	public CiObject sortBySimilarName(String similarTo) {
		items.sort(Comparator.<CiObject>comparingInt(u -> u.getDistanceTo(similarTo)));
		return this;
	}

	public List<String> itemNames() {
		return this.items().stream().map(CiObject::name).collect(Collectors.toList());
	}

	public String itemsAsString() {
		return this.itemsAsString(new Formatter("cmdline"), false, false); // no muestra urls, solo el texto
	}

	public String itemsAsString(Formatter formatter, boolean showFailure, boolean showDetails) {
		StringBuilder sb = new StringBuilder();
		for (CiObject item : this.items) {
			String separator = sb.length() == 0 ? "" : ", ";
			separator = showDetails ? "\n- " : separator; // cuando se muestran detalles separa por lineas
			sb.append(separator).append(item.itemAsString(formatter, showFailure, showDetails));
		}
		return sb.toString();
	}

	public String itemAsString(Formatter formatter, boolean showFailure, boolean showDetails) {
		return formatter.url(this.name, this.htmlUrl) + (showFailure && !showDetails ? "" + getFailureMsg() : "")
				+ (showDetails ? " *" + this.statusSummary() + "*" : "");
	}

	private String getFailureMsg() {
		return this.status == CiStatus.FAILED ? " **(failed)**" : "";
	}

	@Override
	public String toString() {
		return this.name;
	}

	public String toJson() {
		return Util.serialize(this, true);
	}

	public Integer getDistanceTo(String distanceTo) {
		String thisName = this.name.toLowerCase();
		distanceTo = distanceTo.toLowerCase();
		LevenshteinDistance ld = new LevenshteinDistance();
		Integer distance;
		if (thisName.startsWith(distanceTo) || thisName.contains(distanceTo))
			distance = thisName.length() - 25; // los mas cortos son los mas parecidos (para un max string de 25)
		else
			distance = ld.apply(thisName.toLowerCase(), distanceTo); // aplica distancia de levenstein
		return distance;
	}

	public CiObject buildSummary() {
		int numFailed = 0;
		int numSuccessful = 0;
		int numOther = 0;
		int numUnknown = 0;
		for (CiObject detail : this.items()) {
			numFailed += detail.status() == CiStatus.FAILED ? 1 : 0;
			numSuccessful += detail.status() == CiStatus.SUCCESSFUL ? 1 : 0;
			numOther += detail.status() == CiStatus.OTHER ? 1 : 0;
			numUnknown += detail.status() == CiStatus.UNKNOWN ? 1 : 0;
			// establece fecha de build la mas alta de todos los items
			if (this.buildDate() == null || this.buildDate().before(detail.buildDate()))
				this.buildDate(detail.buildDate());
		}
		// estado consolidado
		buildSummaryStatus(numFailed, numSuccessful, numOther);
		// String con el resumen indicando cuantos hay de cada tipo
		buildSummaryString(numFailed, numSuccessful, numOther, numUnknown);
		return this;
	}

	private void buildSummaryStatus(int numFailed, int numSuccessful, int numOther) {
		if (numFailed > 0)
			this.status(CiStatus.FAILED);
		else if (numSuccessful > 0)
			this.status(CiStatus.SUCCESSFUL);
		else if (numOther > 0)
			this.status(CiStatus.OTHER);
		else
			this.status(CiStatus.UNKNOWN);
	}

	private void buildSummaryString(int numFailed, int numSuccessful, int numOther, int numUnknown) {
		this.statusSummary(((numFailed > 0 ? numFailed + " " + CiStatus.FAILED.toString().toLowerCase() + " " : "")
				+ (numSuccessful > 0 ? numSuccessful + " " + CiStatus.SUCCESSFUL.toString().toLowerCase() + " " : "")
				+ (numOther > 0 ? numOther + " " + CiStatus.OTHER.toString().toLowerCase() + " " : "")
				+ (numUnknown > 0 ? numUnknown + " " + CiStatus.UNKNOWN.toString().toLowerCase() : "")).trim());
	}

}
