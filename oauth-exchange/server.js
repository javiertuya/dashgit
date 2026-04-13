import express from "express";
import fetch from "node-fetch";
import cors from "cors";

/*
To test in local for an app named app1
docker build -t oauth-develop .
docker stop oauth-develop && docker rm oauth-develop
docker run -d --name oauth-develop \
    -e CLIENT_ID_APP0="myclientid" \
    -e CLIENT_SECRET_APP1="myclientsecret" \
    -p 3000:3000 oauth-develop

curl http://localhost:3000/healthcheck
curl -X POST http://localhost:3000/exchange \
  -H "Content-Type: application/json" \
  -d '{"code":"XXX","code_verifier":"YYY","redirect_uri":"http://localhost/ZZZ?oapp=app1"}'

# note that suffix of environment variables match the oapp= parameter in uppercas
*/
const app = express();
app.use(express.json());
app.use(cors());

const log = (message) => {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

app.get("/healthcheck", async (req, res) => {
  log("Health check requested");
  res.status(200).send("OK");
});

app.post("/exchange", async (req, res) => {
  try {
    const { code, code_verifier, redirect_uri } = req.body;
    log(`Received exchange request with redirect_uri: ${redirect_uri}`);

    // Given the redirect_uri, extracts the app name in the query string (in the form ?oapp=name)
    const url = new URL(redirect_uri);
    const params = new URLSearchParams(url.search);
    const app = params.get("oapp");

    // The environment variables are named CLIENT_ID_* and CLIENT_SECRET_*, where * is the app name
    const clientId = process.env["CLIENT_ID_" + app.toUpperCase()];
    const clientSecret = process.env["CLIENT_SECRET_" + app.toUpperCase()];
    log(`  using client id ${clientId} and secret *********`);
    //TODO check&log for undefined values to return not found
    
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        client_id: clientId,
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
    console.error(err);
    res.status(500).json({ error: "server_error", details: err.message });
  }
});

app.listen(3000, () => {
  log("OAuth microservice running on port 3000");
});
