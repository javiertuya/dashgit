package giis.qabot.ci.models;

import lombok.Getter;
import lombok.Setter;
import lombok.experimental.Accessors;

/**
 * Datos de un proyecto cuando se busca en la lista de proyectos, solo contiene nombre y url
 */
@Accessors(fluent=true)
public class Branch extends CiObject{
	// Guarda la PR asociada a esta rama (si existe)
	@Getter @Setter private PullRequest pullRequest=null;
	
	/**
	 * Cuando existe una pr la invocacion de buildSummary sobre la rama actualiza
	 * el estado de esta para reflejar fallo si no puede hacerse el merge, incluyendo la razon
	 */
	@Override
	public Branch buildSummary() {
		// la rama no tiene items, pero si puede tener la pull request
		if (pullRequest != null && Boolean.FALSE == pullRequest.canBeMerged()) {
			this.status(CiStatus.FAILED).statusInfo(pullRequest.cantBeMergedReason());
		}
		return this;
	}
}
