package giis.qabot.core.clients;

import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

/**
 * Envio de peticiones rest generales
 */
public class RestClient {
	/**
	 * Hace un post a una url con el contenido body, indicando un token opcional
	 * para autorizacion; devuelve un objeto de respuesta (procesar como strings los
	 * resultados de getStatusCode y getBody)
	 */
	public ResponseEntity<String> post(String url, String body, String token) {
		ClientHttpRequestFactory requestFactory = new HttpComponentsClientHttpRequestFactory();
		RestTemplate restTemplate = new RestTemplate(requestFactory);
		HttpHeaders headers = new HttpHeaders();
		if (token != null && token.length() > 0)
			headers.add("Authorization", "Bearer " + token);
		headers.add("content-type", "application/json"); // maintain graphql
		return restTemplate.postForEntity(url, new HttpEntity<>(body, headers), String.class);
	}
}
