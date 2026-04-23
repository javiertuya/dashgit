import { encryption } from "./Encryption.js"

/**
 *  PAT token encryption/decription
 */
const PAT_SECRET = "dashgit-pat-secret"; // Store: to decript PATs (entered by the user at the session start)
const tokens = {

  setPatSecret: function (secret) {
    sessionStorage.setItem(PAT_SECRET, secret);
  },
  getPatSecret: function () {
    return sessionStorage.getItem(PAT_SECRET) ?? "";
  },

  encryptConfigTokens: function (providers, managerRepo) {
    const secret = this.getPatSecret();
    managerRepo.token = this.encrypt(managerRepo.token, secret);
    for (let provider of providers)
      provider.token = this.encrypt(provider.token, secret);
  },

  // To check a valid password checks if decryption of all provider tokens is possible
  isValidPassword: function (providers, pass) {
    for (let provider of providers) {
      try {
        const result = this.decrypt(provider.token, pass);
        if (result == "invalid token")
          return false;
      } catch (error) { // NOSONAR
        return false;
      }
    }
    return true;
  },

  // encrypted tokens are prefixed with "aes:" to avoid a duble encryption and decrypt non encrypted tokens
  // Allows empty tokens (e.g. for anonymous access to GitHub)
  encrypt: function (text, pass) {
    if (text == "" || text.startsWith("aes:"))
      return text; //already encrypted
    let ciphertext = encryption.encrypt(text, pass);
    return "aes:" + ciphertext;
  },

  // This is called from the API related methods to authenticate the requests and session login
  // If parameter pass is included, uses this as the secret to decrypt (to validate at sesion login)
  // Else, find the secret in local storage (regular use to call the APIs)
  decrypt: function (configToken, pass) {
    // decrypt only if token is encrypted, if not, returns the value
    if (configToken.startsWith("aes:")) {
      let ciphertext = configToken.substring(4);
      let secret = pass ?? this.getPatSecret();
      if (secret == "") //will make fail the api calls
        return "invalid token";
      let text = encryption.decrypt(ciphertext, secret);
      //raise exception if password does not match (receives empty string)
      if (text.length == 0)
        throw "Can't decrypt the token, maybe the password is wrong"; //NOSONAR
      return text;
    } else
      return configToken;
  },

}
export { tokens };
