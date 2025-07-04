package giis.qabot.ci.models;

import org.apache.commons.text.similarity.LevenshteinDistance;

import lombok.extern.slf4j.Slf4j;

/**
 * Dado un string target, determina en un array de items el mas cercano;
 * cada item es otro array con un conjunto de valores, 
 * siendo el primer elemento el devuelto si la distancia es la minima
 */
@Slf4j
public class EntityMatcher {

	public String bestMatch(String target, String[]... args) {
		if (target == null || target.length() < 2)
			return null;
		int minDist = Integer.MAX_VALUE;
		String[] minArg = new String[] { "" };
		for (String[] arg : args) {
			int currentDist = minDistance(target, arg);
			if (currentDist < minDist) {
				minDist = currentDist;
				minArg = arg;
			}
		}
		log.debug("Best mach for '{}' is '{}', distance: {}", target, minArg[0], minDist);
		return minArg[0];
	}

	private int minDistance(String target, String[] arg) {
		LevenshteinDistance ld = LevenshteinDistance.getDefaultInstance();
		int min = Integer.MAX_VALUE;
		for (String s : arg) {
			if (target.equals(s))
				return 0;
			int current = ld.apply(target, s);
			if (current < min)
				min = current;
		}
		return min;
	}
	
}
