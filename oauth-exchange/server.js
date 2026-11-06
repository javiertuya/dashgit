import express from "express";
import cors from "cors";

/**
 * OAuth2 token exchange proxy for DashGit.
 * 
 * Once the client receives the authorization code, it must request the authorization server again to 
 * exchange the code for the token. This requires a secret that should not be stored in an SPA application.
 * This service is a proxy that safely stores the secrets, and provides a single endpoint that forwards 
 * the exchange request from the client to the authorization server. 
 * The same endpoint also handles the refresh token requests.
 * 
 * Handles authorization for multiple clients (GitHub OAuth App or GitLab Application) each identified by CLIENT_ID. 
 * For each client, it requires two environment variables:
 * - CLIENT_SECRET_<CLIENT_ID>: Contains the secret required to identify the client against the Authentication Server
 * - TOKEN_URL_<CLIENT_ID>: The Authentication Server URL where the exchange request must be forwarded to
 *   (e.g. https://github.com/login/oauth/access_token for GitHub or https://gitlab.com/oauth/token for GitLab)
 * 
 * See at the end of this file some instructions to build and test the service is running.
 * Unit tests are in test/server.test.js (run with: npm test).
 */
export const app = express();
// cors first, so that the error responses (e.g. invalid json body) also have the cors headers
app.use(cors());
app.use(express.json());

// Maximum time to wait for the Authorization Server (can be changed by the tests)
app.locals.forwardTimeoutMs = 30000;

const consoleLog = (message) => {
  console.log(`[${new Date().toISOString()}] ${message}`);
}
const consoleError = (message) => {
  console.error(`[${new Date().toISOString()}] ${message}`);
}

// Values received from the client or the Authorization Server are logged as json: shows their type (e.g. arrays)
// and escapes line breaks, so that they can't forge log lines
const show = (value) => JSON.stringify(value) ?? "undefined";

const INVALID_BODY = { error: "bad_request", error_description: "Invalid JSON body" };

app.get("/healthcheck", async (req, res) => {
  res.status(200).send("OK");
});

app.post("/exchange", async (req, res) => {
  try {
    // express.json() leaves the body undefined if the request is not json
    if (req.body == null || typeof req.body !== "object" || Array.isArray(req.body)) {
      consoleError("Request body is not a json object, returning 400 bad request");
      res.status(400).json(INVALID_BODY);
      return;
    }
    const { grant_type, client_id, code, code_verifier, redirect_uri, refresh_token } = req.body;
    consoleLog(`Received exchange request: grant_type=${show(grant_type)}, client_id=${show(client_id)}, redirect_uri=${show(redirect_uri)}`);

    // The environment variables determine the secret and token url
    const clientSecret = process.env["CLIENT_SECRET_" + client_id];
    const tokenUrl = process.env["TOKEN_URL_" + client_id];

    // returns custom error if some of the environment variables are not defined
    if (!clientSecret || !tokenUrl) {
      consoleError("Can't find a client secret or token url for this client, returning 403 forbidden");
      res.status(403).json({ error: "forbidden", error_description: "Exchange not allowed" });
      return;
    }

    // Two different operations are allowed: (1) get a new token and (2) refresh an existing token
    let body;
    if (grant_type === "authorization_code") {
      body = { client_secret: clientSecret, client_id, grant_type, redirect_uri, code, code_verifier }
    } else if (grant_type === "refresh_token") {
      body = { client_secret: clientSecret, refresh_token: refresh_token, client_id, grant_type, redirect_uri }
    } else {
      consoleError(`Grant type ${show(grant_type)} is not supported, returning 403 forbidden`);
      res.status(403).json({ error: "forbidden", error_description: "Grant type not supported" });
      return;
    }

    // Everything is correct, forward the request to the Authentication Server and return the response to the client
    consoleLog(`  Forwarding to ${tokenUrl}`);
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(req.app.locals.forwardTimeoutMs),
    });

    const data = await response.json();
    // Errors may come with a success status (GitHub answers OAuth errors with 200). Never log the full response, it contains the tokens
    if (!response.ok || data?.error)
      consoleError(`  Authorization Server error: status ${response.status}, error=${show(data?.error)}, error_description=${show(data?.error_description)}`);
    else
      consoleLog(`  Authorization Server response: status ${response.status}, access_token ${data?.access_token ? "received" : "missing"}`);
    res.json(data);

  } catch (err) {
    // The details are only logged, they could expose internal information (e.g. the token url)
    consoleError(`Exchange failed: ${err.name}: ${err.message}${err.cause ? " - " + err.cause : ""}`);
    // Response timeout (signal above) or connection timeout (applied by the native fetch, 10s)
    const timeout = err.name === "TimeoutError" || err.cause?.code === "UND_ERR_CONNECT_TIMEOUT";
    res.status(timeout ? 504 : 500).json({
      error: "server_error",
      error_description: timeout ? "The authorization server did not respond in time" : "Token exchange failed",
    });
  }
});

// Errors raised before reaching the handlers (e.g. invalid json body), answered as json instead of the express html page
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    consoleError("Request body is not valid json, returning 400 bad request");
    res.status(400).json(INVALID_BODY);
  } else {
    consoleError(`Request failed: ${err.message}`);
    res.status(err.status || 500).json({ error: "server_error", error_description: "Request failed" });
  }
});

// Only listen when run directly (node server.js), not when imported by the tests
if (import.meta.main) {
  app.listen(3000, () => {
    consoleLog("OAuth microservice running on port 3000");
  });
}

/*
# When dockerfile uses Docker Hardened Image, remember login to dhi.io to pull the image:
docker login dhi.io -u <username> -p <password/token>
# To check in local that service is live and returns forbidden if no env vars are defined:
docker build -t oauth-develop .
docker stop oauth-develop && docker rm oauth-develop
docker run -d --name oauth-develop \
    -e CLIENT_SECRET_myclientid="myclientsecret" \
    -e TOKEN_URL_myclientid="http://localhost/oauth-token-endpoint" \
    -p 3000:3000 oauth-develop

# This should return OK
curl http://localhost:3000/healthcheck

# This should return {"error":"forbidden","error_description":"Exchange not allowed"}
curl -X POST http://localhost:3000/exchange \
  -H "Content-Type: application/json" \
  -d '{"code":"XXX","code_verifier":"YYY","redirect_uri":"http://localhost/ZZZ?oapp=app1"}'
*/
