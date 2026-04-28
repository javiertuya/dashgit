
/**
 * Default configuration OAuth apps. Contains the minimum set of parameters needed 
 * for the Login module create the full set of parameters required to complete the login:
 * - Indexed by 
 *   - the name of the platform (GitHub only at this moment)
 *   - name of the app that DashGit knows to reference the OAuth app
 * - Containing the information registered in the app
 *  - clientId
 *  - scopes as defined in the app
 *  - Paths/urls to determine the endpoints for authorization request or token exchange
 *  - Does not contain the secret, this should be stored in the the exchange proxy
 * 
 * There are variants of the configuration for development and production.
 * 
 * GitHub OAuth Apps: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#web-application-flow
 * GitHub Apps: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app#using-the-web-application-flow-to-generate-a-user-access-token
 * GitLab Applications: https://docs.gitlab.com/api/oauth2/
 * RFC: https://datatracker.ietf.org/doc/html/rfc6749
 * 
 * NOTE: Github requires a proxy exchange server, if not, it will fail because of CORS
 */
const oaconfig = {

  getCurrentUrl: function() {
    return globalThis.location.protocol + "//" + globalThis.location.host  + globalThis.location.pathname;
  },

  // Returns the approriate configuration for the current environment given the url where the application is running
  getConfig: function (url) {
    if (!url)
      url = this.getCurrentUrl();
    if (url.replace(/\/$/, '') == "https://javiertuya.github.io/dashgit")
      return productionConfig;
    else
      return developConfig;
  }
}

// Default configurations for each environment.
const productionConfig = {
  GitHub: {
    github: {
      clientId: "Ov23liVGL1zed4TQItlx",
      scopes: "repo notifications",
      authorizePath: "/login/oauth/authorize",
      //tokenUrl: "https://github.com/login/oauth/access_token",
      tokenUrl: "https://giis.uniovi.es/oauth/exchange",
    },
  },
  GitLab: {
    gitlab: {
      clientId: "2a3cc46261c4ec7d35a3f27b336b3f10be74f4664bec3f57b24b0e3426a6361b",
      scopes: "read_api",
      authorizePath: "/oauth/authorize",
      //tokenUrl: "https://gitlab.com/oauth/token",
      tokenUrl: "https://giis.uniovi.es/oauth/exchange",
    },
  },
}
const developConfig = {
  GitHub: {
    github: {
      clientId: "Ov23liF8QHJgpfMvHfDx",
      scopes: "repo notifications",
      authorizePath: "/login/oauth/authorize",
      //tokenUrl: "https://github.com/login/oauth/access_token",
      tokenUrl: "https://giis.uniovi.es/desarrollo/oauth/exchange",
    },
  },
  GitLab: {
    gitlab: {
      clientId: "0f31ac81765c1290f903cd671975d71314a0bb48dfd070e4136ee4e08283b97b",
      scopes: "read_api",
      authorizePath: "/oauth/authorize",
      //tokenUrl: "https://gitlab.com/oauth/token",
      tokenUrl: "https://giis.uniovi.es/desarrollo/oauth/exchange",
    },
  },
}

export { oaconfig };
