package giis.qabot.ci.models;

public enum CiStatus implements IEntityMatcher<CiStatus> {
	FAILED, 
	SUCCESSFUL, 
	OTHER, // cualquier estado no failed ni successful
	ALL, // usado para representar cualquiera de los estados
	UNKNOWN; // estado desconocido (p.e. no ejecutado todavia)

	@Override
	public String toString() {
		return this.name().toLowerCase();
	}

	@Override
	public String plural() {
		return this.toString();
	}

	@Override
	public CiStatus bestMatch(String target) {
		String best = new EntityMatcher().bestMatch(target, 
				new String[] { "successful", "success", "succ", "pass" },
				new String[] { "failed", "failure", "failing", "fail" },
				new String[] { "all", "every", "any", "each" });
		return best == null ? UNKNOWN : CiStatus.valueOf(best.toUpperCase());
	}
}
