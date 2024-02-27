package giis.qabot.ci.models;

/**
 * Funciones adicionales de un tipo enum
 */
public interface IEntityMatcher<E extends Enum<E>> {
	Enum<E> bestMatch(String target);

	String plural();
}
