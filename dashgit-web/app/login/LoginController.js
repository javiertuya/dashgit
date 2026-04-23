import { login } from "./Login.js"
import { startLogin, handleCallback, refreshToken } from "../oauth/OAuthApi.js"

/**
 * Expands the functionality of the indexController to manage the sequence of OAuth logins for each provider:
 * - handleLoginOnLoad: Step 1 to request authorization
 * - handleCallbackFromApp: Step 2 to exchange the code for the token
 * - refreshExpiredToken: to renew tokens with expiration date
 * 
 * This is called once per each provider during the page load.
 * 
 * Return to the indexController and error handling:
 * - Successful return includes an object that contains the completion state to allow reload to continue
 *   the login of other providers or continue loading to display the views
 * - Errors are included in the returned object and generated using handleFailureAndDisplay:
 *   - Every error mark the token as failed
 *   - Every error return to indexController, the page load will finish to acknowledge the feedback message
 *     and continue (load page again to login the next provider)
 *   - At the end, if some token is failed a permanent display to inform the failed providers is given
 *     and with the possibility to retry (that removes the failed tokens and reloads again)
 */

// A session storage variable whith this name will remember the provider that is being set during the flow
const PROVIDER_UID = "dashgit-oauth-provider-key";

const loginController = {

  /**
   * Manages the first step of the OAuth login flow by requesting authorization for a provider.
   * 
   * If there is any provider that still is no logged in, starts the login of the first one
   * notifying the index controller if there are any error to let the user acknowledge it.
   * 
   * When there are no remaining providers without login, notifies to the index controller that
   * the flow is completed to continue page load.
   */
  handleLoginOnLoad: async function () {
    const loginStatus = await login.getLoginStatusForAllProviders();
    if (loginStatus.unsetProviders.length > 0) {
      let status = await loginController.startLoginForProvider(loginStatus.unsetProviders[0]);
      // Start login may not return here if everything is ok, but there can be errors, 
      // so, notify to the caller that there are more pending logins
      status.completed = false;
      return status;
    }
    // No more logins, returns the completion state and additional mesage if there were failed providers
    const uids = loginStatus.failedProviders.map(a => a.uid);
    const failed = loginStatus.failedProviders.length == 0 ? "" : `OAuth2 authentication failed for the provider(s) ${uids.join(", ")}. `;
    return { completed: true, failed: failed }
  },
  startLoginForProvider: async function (provider) {
    console.log("Requesting login authorization for provider " + provider.uid);
    await this.displayProgress("Login provider " + provider.uid + ", requesting...");

    // Before setting the variable stored as PROVIDER_UID that serves to let the callback know what is the provider that is authorizing,
    // a first check:
    // When a callback fails (e.g. because the client ID is wrong and the server redirects to a page in the server 
    // that notifies this error), every new entry en DashGit would retry and find the same problem.
    // Here detects if this variable is set (because the callback was not invoked) and sets the provider as failed
    let currentProviderUid = sessionStorage.getItem(PROVIDER_UID);
    if (currentProviderUid && currentProviderUid != null) {
      return await this.handleFailureAndDisplay(currentProviderUid, `
        It appears that an authorization request for provider ${currentProviderUid} was not processed correctly. 
        This may be due to, among other things, an invalid configuration of the App ID, the repository server or the redirect URI (callback).
        If this is the case, you should review your configuration before retry.
        `);
    }

    sessionStorage.setItem(PROVIDER_UID, provider.uid)
    let conf = login.getOAuthProviderConfig(provider);

    // To prevent the startLogin transfer control to a non existent url because other issues with configuration,
    // check first if the configuration was found, using the error display mechanisms in the auth.js module
    // that mark it as failed and notify the user
    if (Object.keys(conf).length === 0) {
      const customAppName = provider.oacustom.enabled ? provider.oacustom.appName : "";
      if (customAppName == "") // the default was not found, this should never happen
        return await this.handleFailureAndDisplay(provider.uid, `The default app could not be found, provider ${provider.uid}."`);
      else // The user specified a wrong custom app
        return await this.handleFailureAndDisplay(provider.uid, `The custom app "${customAppName}" could not be found, provider ${provider.uid}. Please, review your OAuth custom settings"`);
    } else if (globalThis.location.host === "localhost") { // Localhost is not a valid host for OAuth2 callbacks
      return await this.handleFailureAndDisplay(provider.uid, "Invalid host: localhost");
    }

    // Pass previous checks, call the API to redirect to the authorization provider
    return await startLogin(conf);
  },

  /**
   * Manages the second step of the OAuth login flow by requesting the exchange of code for token.
   * Invoked when the page receives the callback, performs the exchange and stores the token in session storage
   */
  handleCallbackFromApp: async function (app) {
    const providerUid = sessionStorage.getItem(PROVIDER_UID);
    console.log(`OAuth2 ${app} callback invoked for provider ${providerUid}, starting token exchange`);
    await this.displayProgress("Login provider " + providerUid + ", authorizing...");

    // Localhost is not a valid host for OAuth2 callbacks, fails immediately 
    // (nevertheless we can use 127.0.0.1 to test the real failure)
    if (globalThis.location.host === "localhost") {
      return this.handleFailureAndDisplay(providerUid, "Invalid host: " + globalThis.location.host);
    } else if (!providerUid) {
      return this.handleFailureAndDisplay(providerUid, "Provider ID is undefined");
    }

    // Now that the previous check passed, call the API to handle the callback
    let response = await handleCallback();
    response = await this.handleCallbackResponse(providerUid, response);

    // Clean up before returning
    sessionStorage.removeItem(PROVIDER_UID); // not needed anymore
    // If this is last callback, the page load will continue rendering the view with the 
    // query string parameers, hide query string parameters to avoid this
    const thisUrl = login.getDashGitUrl();
    history.replaceState(history.state, '', new URL(thisUrl));

    return response;
  },
  handleCallbackResponse: async function (providerUid, response) {
    if (response.error) {
      return await this.handleFailureAndDisplay(providerUid, response.error);
    } else {
      console.log("OAuth2 login: Callback finished successfully");
      const provider = login.getOauthEnabledProviderByUid(providerUid);
      await login.successfulLogin(response.access_token, response.refresh_token, response.expires_in, provider);
      return { success: true };
    }
  },

  // All errors that are produced MUST call this method.
  handleFailureAndDisplay: async function (providerUid, message) {
    // Ensures that the provider token is marked as failed and clears PROVIDER_UID 
    // to ensure that an authentication in progress is marked as completed.
    await login.failedLogin(providerUid);
    sessionStorage.removeItem(PROVIDER_UID);

    // In addition to a log, displays the message to the UI to allow the user acknowledge
    console.error(`OAuth2 login: ${message}`);
    $("#callback-error").text(message);
    $("#callback-continue-btn").show();

    return { error: message };
  },

  // Progress of the authorization shown in the user interface
  displayProgress: async function (message) {
    console.log(`OAuth2 login: ${message}`);
    $("#callback-provider").text(message);
  },

  /**
   * Forwards the request to refresh token from the login module. This does not involves callbacks, 
   * it is a direct call to get the return values, just consolidates the error info into a single string
   */
  refreshExpiredToken: async function (tokenInfo) {
    const response = await refreshToken(tokenInfo.refreshToken, tokenInfo.oaconfig);
    if (response.error)
      return { error: `Error refreshing token (${response.error}): ${response.error_description}` }
    return response;
  },

}

export { loginController };
