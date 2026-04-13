
/**
 * Default configuration OAuth apps. Contains the minimum set of parameters needed 
 * for the Login module create the full set of parameters required to complete the login:
 * - Indexed by 
 *   - the name of the platform (GitHub only at this moment)
 *   - name of the app that DashGit knows to reference the OAuth app
 * - Containing the information registered in the app
  *  - clientId
 *   - scopes as defined in the app
 *   - Do not contain the secret, this should be in the configuration of the PKCS exchange service
 * 
 * https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#web-application-flow
 * https://docs.gitlab.com/api/oauth2/
 * 
 * NOTE: Github requires a proxy exchange server, if not, it will fail because of CORS
 */
const oaconfig = {
  GitHub: {
    github: {
      clientId: "Ov23liF8QHJgpfMvHfDx",
      scopes: "repo notifications",
      //platformUrl: "https://github.com",
      exchangeUrl: "https://giis.uniovi.es/desarrollo/oauth/exchange",
    },
    github2: {
      clientId: "Ov23liX99oNsXeNScNCS",
      scopes: "repo notifications",
      //platformUrl: "https://github.com",
      exchangeUrl: "https://giis.uniovi.es/desarrollo/oauth/exchange",
    },
  },
  GitLab: {
    gitlab: {
      clientId: "0f31ac81765c1290f903cd671975d71314a0bb48dfd070e4136ee4e08283b97b",
      scopes: "read_api",
      //platformUrl: "https://gitlab.com",
      exchangeUrl: "",
    },
  },
}
export { oaconfig };
