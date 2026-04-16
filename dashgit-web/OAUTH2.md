# DashGit - OAuth2

DashGit supports the *Authorization Code Grant with Proof Key for Code Exchange (PKCE)* protocol [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) to authenticate and authorize access to GitHub and GitLab resources.

In simplified terms, this involves two phases:
1. DashGit requests authentication to the GitHub or GitLab *Authorization Server*:
  - The first time, you are requested to authenticate (if you are not already logged in) and to authorize a given scope (permissions to access the API).
  - Returns an *Authorization code* by redirecting the browser to a callback page in DashGit.
2. DashGit requests the *Authorization Server* to exchange the *Authorization code* for an *Access Token* that will be used by DashGit to authenticate all API calls until the session is closed (when the browser tab is closed).

Out of the box, DashGit provides the necessary resources for the OAuth Authentication and Authorization process:
- A predefined *GitHub OAuth App* and *GitLab Application* (hencefort, refered to as *App*) that play the role of *Client* in the OAuth2 protcol to manage all process.
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
- Spin-up the *Exchange Proxy Service*:
  - Folder `oauth-exchange` in this repo provides the source of a tiny *Exchange Proxy Service* docker container. The container must be started with a pair of environment variables for each *App* you are using, where `<CLIENT_ID>` is the identifier of the *App* obtained when it was created:
    - `CLIENT_SECRET_<CLIENT_ID>`: Contains the secret required to identify the *App* against the *Authentication Server*.
    - `TOKEN_URL_<CLIENT_ID>` : The *Authentication Server* endpoint URL where the exchange request must be forwarded to.
  - The value of `TOKEN_URL_<CLIENT_ID>` must be:
    - On GitHub: `https://github.com/login/oauth/access_token`
    - On GitLab: `https://gitlab.com/oauth/token`
    - On GitLab (on-premises): `https://my-on-premises-gitlab-server/token`
  - The container exposes a single resource `/exchange` that is used both to exchange the code for the token and to renew expired tokens.
  - Build and run the container with the above environment variables.
- In the DashGit OAuth2 custom configuration, in addition to the *OAuth App ID*:
  - Set *OAuth exchange token URL* by adding `/exchange` resource to the container address.
  - If for example, the container can be accessed to an address like `https://my-exchange-server`, the value of the *OAuth exchange token URL* will be `https://my-exchange-server/exchange`

