package giis.qabot.ci.models;

import java.util.List;
import java.util.stream.Collectors;

import lombok.experimental.Accessors;

/**
 * Datos de un proyecto cuando se busca en la lista de proyectos, solo contiene
 * nombre y url
 */
@Accessors(fluent = true)
public class Project extends CiObject {

	/**
	 * Devuelve todos los items como lista de Branch
	 */
	public List<Branch> branches() {
		return this.items().stream().map(Branch.class::cast).collect(Collectors.toList());
	}
	
}
