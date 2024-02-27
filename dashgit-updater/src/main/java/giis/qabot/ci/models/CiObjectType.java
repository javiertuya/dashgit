package giis.qabot.ci.models;

public enum CiObjectType implements IEntityMatcher<CiObjectType> {
	CI, PROJECT, BRANCH, UPDATE, UNKNOWN;

	@Override
	public String toString() {
		return this.name().toLowerCase();
	}

	@Override
	public String plural() {
		if (this == CI || this == PROJECT || this == UPDATE)
			return this.toString() + "s";
		if (this == BRANCH)
			return "branches";
		return this.toString();
	}

	@Override
	public CiObjectType bestMatch(String target) {
		String best = new EntityMatcher().bestMatch(target, new String[] { "ci", "ci service", "ci system" },
				new String[] { "project", "projects", "pr", "proj" },
				new String[] { "branch", "branches", "br", "brch" },
				new String[] { "update", "updates", "upd", "dependabot update", "dependency updates", "dep updates" });
		return best == null ? UNKNOWN : CiObjectType.valueOf(best.toUpperCase());
	}
}
