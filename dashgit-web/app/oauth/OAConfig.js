
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
 *  - Does not contain the secret, this should be in the configuration of the exchange proxy
 * 
 * GitHub OAuth Apps: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#web-application-flow
 * GitHub Apps: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app#using-the-web-application-flow-to-generate-a-user-access-token
 * GitLab Applications: https://docs.gitlab.com/api/oauth2/
 * RFC: https://datatracker.ietf.org/doc/html/rfc6749
 * 
 * NOTE: Github requires a proxy exchange server, if not, it will fail because of CORS
 */
const oaconfig = {
  GitHub: {
    github: {
      clientId: "Ov23liF8QHJgpfMvHfDx",
      scopes: "repo notifications",
      authorizePath: "/login/oauth/authorize",
      //tokenUrl: "https://github.com/login/oauth/access_token",
      tokenUrl: "https://giis.uniovi.es/desarrollo/oauth/exchange",
    },
    github2: {
      clientId: "Ov23liX99oNsXeNScNCS",
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
