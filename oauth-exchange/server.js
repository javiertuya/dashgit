import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors());

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

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

    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
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
