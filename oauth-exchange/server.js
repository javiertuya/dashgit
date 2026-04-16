import express from "express";
import fetch from "node-fetch";
import cors from "cors";

/**
 * OAuth2 token exchange proxy.
 * 
 * Afther the client gets the authorization grant (code), it must call again the authorization server to 
 * exchange the code for the token. This requires a secret that should not be stored in an SPA application.
 * This service is a proxy that safely stores the secrets, receives the exchange request from the client 
 * and forwards it to the authorization server.
 * 
 * Handles multiple authorization servers. For each, it requires two environment variables:
 * - CLIENT_SECRET_<CLIENT_ID>: The secret for the CLIENT_ID (both assigned when creating the OAuth application)
 * - TOKEN_URL_<CLIENT_ID>: The URL for the CLIENT_ID where the exchange request must be forwarded to.
*/
const app = express();
app.use(express.json());
app.use(cors());

const log = (message) => {
  console.log(`[${new Date().toISOString()}] ${message}`);
}
const error = (message) => {
  console.error(`[${new Date().toISOString()}] ${message}`);
}

app.get("/healthcheck", async (req, res) => {
  log("Health check requested");
  res.status(200).send("OK");
});

app.post("/exchange", async (req, res) => {
  try {
    const { client_id, code, code_verifier, redirect_uri } = req.body;
    log(`Received exchange request for client_id=${client_id} and redirect_uri=${redirect_uri}`);

    // The environment variables determine the secret and token url
    const clientSecret = process.env["CLIENT_SECRET_" + client_id];
    const tokenUrl = process.env["TOKEN_URL_" + client_id];
    log(`  Forwarding to ${tokenUrl} with secret *********`);

    // returns custom error if some of the environment variables are not defined
    if (!clientSecret || !tokenUrl) {
      error("Can't find a client secret or token url for this client, returning 403 forbidden");
      res.status(403).json({ error: "forbidden", error_description: "Exchange not allowed" });
      return;
    }

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        client_id: client_id,
        client_secret: clientSecret,
        code,
        code_verifier,
        redirect_uri,
        grant_type: "authorization_code"
      })
    });

    const data = await response.json();
    res.json(data);

  } catch (err) {
    error(err);
    res.status(500).json({ error: "server_error", error_description: err.message });
  }
});

app.listen(3000, () => {
  log("OAuth microservice running on port 3000");
});

/*
To check in local that service is live and returns forbidden if no env vars are defined
docker build -t oauth-develop .
docker stop oauth-develop && docker rm oauth-develop
docker run -d --name oauth-develop \
    -e CLIENT_SECRET_myclientid="myclientsecret" \
    -e TOKEN_URL_myclientid="http://localhost/oauth-token-endpoint" \
    -p 3000:3000 oauth-develop

curl http://localhost:3000/healthcheck
curl -X POST http://localhost:3000/exchange \
  -H "Content-Type: application/json" \
  -d '{"code":"XXX","code_verifier":"YYY","redirect_uri":"http://localhost/ZZZ?oapp=app1"}'
*/