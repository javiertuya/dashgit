import express from "express";
import fetch from "node-fetch";
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
 */
const app = express();
app.use(express.json());
app.use(cors());

const consoleLog = (message) => {
  console.log(`[${new Date().toISOString()}] ${message}`);
}
const consoleError = (message) => {
  console.error(`[${new Date().toISOString()}] ${message}`);
}

app.get("/healthcheck", async (req, res) => {
  res.status(200).send("OK");
});

app.post("/exchange", async (req, res) => {
  try {
    const { grant_type, client_id, code, code_verifier, redirect_uri, refresh_token } = req.body;
    consoleLog(`Received exchange request: grant_type=${grant_type}, client_id=${client_id}, redirect_uri=${redirect_uri}`);

    // The environment variables determine the secret and token url
    const clientSecret = process.env["CLIENT_SECRET_" + client_id];
    const tokenUrl = process.env["TOKEN_URL_" + client_id];
    consoleLog(`  Forwarding to ${tokenUrl}`);

    // returns custom error if some of the environment variables are not defined
    if (!clientSecret || !tokenUrl) {
      consoleError("Can't find a client secret or token url for this client, returning 403 forbidden");
      res.status(403).json({ error: "forbidden", error_description: "Exchange not allowed" });
      return;
    }

    // Two different operations are allowed: (1) get a new token and (2) refresh an existing token
    let body;
    if (grant_type == "authorization_code") {
      body = { client_secret: clientSecret, client_id, grant_type, redirect_uri, code, code_verifier }
    } else if (grant_type == "refresh_token") {
      body = { client_secret: clientSecret, refresh_token: refresh_token, client_id, grant_type, redirect_uri }
    } else {
      consoleError(`Grant type ${grant_type} is not supported, returning 403 forbidden`);
      res.status(403).json({ error: "forbidden", error_description: "Grant type not supported" });
      return;
    }

    // Everything is correct, forward the request to the Authentication Server and return the response to the client
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok)
      consoleError(`Response is not OK: ${JSON.stringify(response)}`);
    res.json(data);

  } catch (err) {
    consoleError(err);
    res.status(500).json({ error: "server_error", error_description: err.message });
  }
});

app.listen(3000, () => {
  consoleLog("OAuth microservice running on port 3000");
});

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
