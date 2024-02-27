package giis.qabot.core.models;

import com.fasterxml.jackson.annotation.PropertyAccessor;

import org.springframework.web.util.UriUtils;

import com.fasterxml.jackson.annotation.JsonAutoDetect.Visibility;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.SneakyThrows;

public class Util { // NOSONAR static utility class

	@SneakyThrows(JsonProcessingException.class)
	public static String serialize(Object obj, boolean prettyPrint) {
		ObjectMapper mapper = new ObjectMapper().setVisibility(PropertyAccessor.FIELD, Visibility.ANY);
		return prettyPrint ? mapper.writerWithDefaultPrettyPrinter().writeValueAsString(obj)
				: mapper.writeValueAsString(obj);
	}

	@SuppressWarnings({ "unchecked", "rawtypes" })
	@SneakyThrows(JsonProcessingException.class)
	public static Object deserialize(String payload, Class clazz) {
		// configura el deserializador para no fallar cuando recibe mas campos que los
		// especificados en el modelo
		// p.e. DIETClassifier produce confidence_entity pero RegexEntityExtractor no.
		ObjectMapper mapper = new ObjectMapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
		return mapper.readValue(payload, clazz);
	}

	@SneakyThrows(InterruptedException.class)
	public static void delay(long millis) {
		if (millis > 0)
			Thread.sleep(millis);
	}

	public static String decodePath(String value) {
		return UriUtils.decode(value, "UTF-8");
	}

	public static String encodePath(String value) {
		return UriUtils.encode(value, "UTF-8");
	}

	public static String splitLast(String text, String separator) {
		String[] comp = text.split(separator);
		return comp[comp.length - 1];
	}

	/**
	 * Indica si se esta ejecutando bajo Jenkins (true si existe la variable de
	 * entorno JOB_NAME)
	 */
	public static boolean runInCi() {
		return System.getenv("JOB_NAME") != null;
	}

}
