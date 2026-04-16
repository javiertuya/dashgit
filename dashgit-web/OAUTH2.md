# DashGit - OAuth2

DashGit implements the *Authorization Code Grant with Proof Key for Code Exchange (PKCE)* protocol [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) to authenticate and authorize access to GitHub and GitLab resources.
In simplified terms, this involves two phases:
- DashGit requests authorization the GitHub/GitLab identity provider, that may ask the user to authorize if it is not logged yet.
  It returns the authorization grant (code) by redirecting to a callback page in DashGit.
- DashGit requests the identity provider to exchange the code by a token. The token is received. This token is used to authenticate all API calls until the session is closed (by closing the borwser tab).

Out of the box, DashGit leverages a predefined GitHub OAuth App or GitLab Application (refered as App henceforth) and a exchange proxy service to handle de authorization process for github.com and gitlab.com, respectively. You are asked to give authorization the first time you create a session. Succesive sessions handle the authorization automatically (you may see a little flickering due to the the callback redirection). On some ocasions you may be asked for authorization again, for example, GitHub request reauthorize if you open 10 new sessions in 60 minutes.

This can be customized in several ways.

## Use your own GitHub OAuth App or GitLab Application

First, you create your App from your GitHub or GitLab settings:
- On GitHub: Go to developer settings an create a GitHub OAuth App. Give it name and set `https://javiertuya.github.io/dashgit/` as the Homepage URL and `https://javiertuya.github.io/dashgit/?oauth=github` as the authorization callback URL. Register the application. Take note of the *Client ID*.
- On GitLab: Go to Access->Applications and add a new application. Give it name and set `https://javiertuya.github.io/dashgit/?oauth=gitlab` as the redirect URI. Uncheck *Confidential* and set the `read_api` scope. Take note of the *Application ID*.

Next, from the DashGit configuration, check *Use OAuth2 to authenticate* and *Customize OAuth2*, fill *OAuth Client ID* with the client ID or Application ID and save the settings. The behaviour depends on the implementation:
- On GitHub: It is not possible to authenticate because the access is restricted to a number of predefined servers and a *client secret* is required. This is because GitHub considers all OAuth Apps as *Confidential* (see next section).
- On GitLab: Every time that you open a new tab with DashGit, you are asked to authorize the App access the account with the *Read APi* scope. Note that with this configuration you are asked to authorize everytime you open a new session.

## Use your own Exchange Proxy Service

The OAuth2 protocol defines an App (client) as *Confidential* if it requrires a secret to exchange the code by the token. However, a SPA web application like DashGit should not store any kind of secret.

To allow authentication without storing any confidential information in the browser, an *Exchange Proxy Service* can be used to safely store the secrets and request the exchange on behalf of DashGit.

Folder `oauth-exchange` in this repo provides the source of a tiny proxy service docker container. The container must be started with two environment variables for each App you are using:
- `CLIENT_SECRET_<CLIENT_ID>`: Contains secret for the CLIENT_ID (both assigned when creating the OAuth application)
- `TOKEN_URL_<CLIENT_ID>` : The URL for the CLIENT_ID where the exchange request must be forwarded to.

To use this service:
- When creating the App, mark it as *Confidential*, grab both the Client ID/Application ID and the Secret.
- In the DashGit OAuth2 custom configuration set *OAuth Client ID* to this ID and *OAuth exchange token URL* to one of:
  - https://github.com/login/oauth/access_token for github.com
  - https://gitlab.com/oauth/token for gitlab.com
  - https://your-on-premises-gitlab/oauth/token for GitLab on premises




