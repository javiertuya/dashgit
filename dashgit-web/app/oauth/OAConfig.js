
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
 */
const oaconfig = {
  GitHub: {
    github: {
      clientId: "Ov23liF8QHJgpfMvHfDx",
      scopes: "repo:read read:user notifications",
    },
    github2: {
      clientId: "Ov23liX99oNsXeNScNCS",
      scopes: "repo:read read:user notifications",
    },
  }
}
export { oaconfig };
