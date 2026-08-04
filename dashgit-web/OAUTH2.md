# DashGit - OAuth2

DashGit supports the *Authorization Code Grant with Proof Key for Code Exchange (PKCE)* protocol [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) to authenticate and authorize access to GitHub and GitLab resources.

In simplified terms, this involves two phases:
1. DashGit requests authorization to the GitHub or GitLab *Authorization Server*:
  - The first time, you are requested to authenticate (if you are not already logged in) and to authorize a given scope (permissions to access the API).
  - Returns an *Authorization code* by redirecting the browser to a callback page in DashGit.
2. DashGit requests the *Authorization Server* to exchange the *Authorization code* for an *Access Token* that will be used by DashGit to authenticate all API calls until the session is closed (when the browser tab is closed).

Out of the box, DashGit provides the necessary resources for the OAuth Authentication and Authorization process:
- A predefined *GitHub OAuth App* and *GitLab Application* (henceforth, referred to as *App*) that play the role of *Client* in the OAuth2 protcol to manage all process.
- A *Exchange Proxy Service* to identify the *App* against the *Authorization Server* that prevents storing confidential information in the browser.

Should you want to connect to an on-premises repository sever or customize the above, you may read the below sections.

## Use your own App

This implies that you will be using an *App* created in your account and you will not be using the *Exchange Proxy Service* (the browser connects directly to the *Authorization Server* to exchange the code for the token). This depends on the platform that you are using:
- On GitLab:
  - From your GitLab preference settings, go to Access->Applications and add a new Application. Give it a name and set `https://javiertuya.github.io/dashgit/?oapp=gitlab` as the redirect URI. Uncheck *Confidential*, set the `read_api` scope and Save the application. Take note of the *Application ID*.
  - In the configuration of the DashGit provider, check *Use OAuth2 to authenticate* and *Customize OAuth2*, fill *OAuth App ID* with the *Application ID* and save the configuration.
  - The difference with respect to the out of the box configuration is that each new session will require your authorization. This is because the *App* is considered as non confidential and the process can't be managed automatically without user intervention.
- On GitHub: It is not possible to connect directly from a SPA Web Application because of some restrictions that are explained below:
  - From your GitHub settings, go to Developer Settings->OAuth Apps and create a new App. Give it a name, set `https://javiertuya.github.io/dashgit/` as the Homepage URL and `https://javiertuya.github.io/dashgit/?oapp=github` as the Authorization callback URL. Register the application and take note of the *Application ID*.
  - As you can see, you do not specify any scope and you do not have the possibility to create the App as non confidential. This means that every connection to the *Authorization Server* requires sending a secret, that is not allowed from an SPA Web Application. 
  - If you customize the DashGit provider by setting the *OAuth App ID*, the requests to authenticate and authorize will be blocked by CORS.
  - In conclusion, on GitHub, you need to provide a *Exchange Proxy Sevice* to use your own *App*, see below.

## Use your own Exchange Proxy Service

This implies that you will be using your own resources for both the *App* and the *Exchange Proxy Service*:
- Create the *App* (GitHub OAuth App or GitLab Application) as indicated above:
  - On GitLab, ensure that *Confidential* is checked and take note of the *Secret* in addition to the *Application ID*
  - On GitHub, generate a new *Client secret* and take note of it in addition to the *Client ID*
- Spin-up the *Exchange Proxy Service*. There are two variants, described in the sections below: run it locally with `dashgit-server-py/server.py`, which also serves the web app, or deploy the `oauth-exchange` docker container. The configuration below applies to both:
  - The service must be started with a pair of environment variables for each *App* you are using, where `<CLIENT_ID>` is the identifier of the *App* obtained when it was created:
    - `CLIENT_SECRET_<CLIENT_ID>`: Contains the secret required to identify the *App* against the *Authentication Server*.
    - `TOKEN_URL_<CLIENT_ID>` : The *Authentication Server* endpoint URL where the exchange request must be forwarded to.
  - The value of `TOKEN_URL_<CLIENT_ID>` must be:
    - On GitHub: `https://github.com/login/oauth/access_token`
    - On GitLab: `https://gitlab.com/oauth/token`
    - On GitLab (on-premises): `https://my-on-premises-gitlab-server/token`
  - Either variant exposes a single resource `/exchange` that is used both to exchange the code for the token and to renew expired tokens.
- In the DashGit OAuth2 custom configuration, in addition to the *OAuth App ID*, set *OAuth exchange token URL* by adding the `/exchange` resource to the address of the service. The sections below give the value for each variant.

## Run everything locally

`dashgit-server-py/server.py` serves the web app and the *Exchange Proxy Service* on a single port. It requires Python 3.7 or later and nothing else.
```
python3 dashgit-server-py/server.py        # serves DashGit at http://127.0.0.1:8080
python3 dashgit-server-py/server.py 9000   # or choose another port
```
It binds to `127.0.0.1` and is not reachable from other machines in your network.

This requires your own *App*, as the predefined one is registered against the public DashGit site and the *Authorization Server* will not redirect to any other address. Create it as described above, and then:
- Set the callback URL that is requested when creating the *App* to the address of this server, instead of the address of a published site:
  - On GitHub, set `http://127.0.0.1:8080/` as both the Homepage URL and the Authorization callback URL.
  - On GitLab, set `http://127.0.0.1:8080/?oapp=gitlab` as the redirect URI.
  - Then open DashGit in your browser at this very address. DashGit sends the address shown in the address bar, and the *Authorization Server* compares it to the one registered above: typing `localhost` when you registered `127.0.0.1` fails the login, even though both reach the same server. The examples use `127.0.0.1` because the OAuth2 specification recommends it over `localhost`.
  - If you run the server on another port, replace `8080` accordingly, as the port is compared too.
- Set the pair of environment variables described above (`CLIENT_SECRET_<CLIENT_ID>` and `TOKEN_URL_<CLIENT_ID>`), either:
  - In a `.env` file located in the `dashgit-server-py` folder, see `.env.example` in that folder for the format, or
  - In the shell environment. These take precedence over the values in `.env`, so that a wrapper script can obtain the secrets from a secret manager instead of storing them on disk.
- Set *OAuth exchange token URL* to `http://127.0.0.1:8080/exchange`.

The web app and the *Exchange Proxy Service* share the same origin here, so no CORS headers are needed or sent.

## Run the Exchange Proxy Service separately

Folder `oauth-exchange` in this repo provides the source of a small Docker container providing only the *Exchange Proxy Service*: the web app is served from somewhere else, either the public DashGit site or your own static hosting.

- Build and run the container with the environment variables described above. It listens on port 3000, see the instructions at the end of `oauth-exchange/server.js` for the exact commands.
- Set *OAuth exchange token URL* by adding the `/exchange` resource to the address where the container can be reached. For a container at `https://my-exchange-server`, the value is `https://my-exchan
ge-server/exchange`.
- Keep the callback URL of the *App* pointing to the address where the web app is served, as described above.
- The web app and the container are on different origins, so the container allows cross origin requests.
