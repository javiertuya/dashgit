import { encryption } from "./Encryption.js"

/**
 * Shared persitent data: configuration of parameters, providers, etc. 
 */
const config = {

  //App version number, do not push any change of it, this is set during deploy
  appVersion: "main",

  //Configuration data version number, to keep track of changes of data structure and migrations
  dataVersion: 2,

  //Feature flags, keeps boolean flags activated from the querystring ?ff=flag1,flag2...
  ff: {},

  //Constant parameters
  param: {
    followUpBranch: "dashgit/follow-up",
    followUpFolder: ".dashgit/follow-up",
    readmeManagerRepo: "https://github.com/javiertuya/dashgit?tab=readme-ov-file#advanced-features",
    readmeDependencyUpdates: "https://github.com/javiertuya/dashgit?tab=readme-ov-file#combined-dependabot-updates",
    readmeFollowUp: "https://github.com/javiertuya/dashgit?tab=readme-ov-file#follow-up",
  },

  //Persistent data, kept only if page is not reloaded
  session: {
    panelCollapsed: {}, //panel with the id indicated by the key is collapsed
  },

  //Persisten configuration data, that is saved to browser storage
  //Next methods are intended for manipulation of this config data
  data: {},

  // Load and save config data from browser storage
  load: function () {
    let configStr = localStorage.getItem("dashgit-config");
    config.data = this.parseAndSanitizeData(configStr);
    // save to storage (data could be changed by santization or migration)
    config.save();
  },
  save: function () {
    localStorage.setItem("dashgit-config", JSON.stringify(config.data));
  },
  encryptTokens: function () {
    config.data.managerRepoToken=this.encrypt(config.data.managerRepoToken, config.xtoken);
    for (let provider of config.data.providers)
      provider.token = this.encrypt(provider.token, config.xtoken);
  },

  // Save from a string representation of the data object
  updateFromString: function (dataStr) {
    config.data = this.parseAndSanitizeData(dataStr);
    //ensure new tokens are encrypted, if applicable
    if (config.data.encrypted)
      this.encryptTokens();
    //set config data not directly set from the ui
    for (let i = 0; i < config.data.providers.length; i++) {
      config.data.providers[i].uid = i.toString() + "-" + config.data.providers[i].provider.toLowerCase();
    }
    config.save();
  },

  // Process a string with configuration and converts to an object.
  // Sets the default values of each property to ensure a complete set of data that can be used elsewhere
  parseAndSanitizeData: function (value) {
    if (value == undefined || value == null || value.trim() == "")
      value = "{}";
    let data = JSON.parse(value);
    if (data.version != undefined && data.version != this.dataVersion) {
      // Here migrations will be included when necessary by checking data.version
      console.log(`Migrating from version ${data.version} to ${this.dataVersion}`);
      if (data.version == 1)
        this.migrateV1toV2(data);
    }
    data = this.setAllDefaults(data);
    return data;
  },
  setAllDefaults: function (data) {
    this.setDefault(data, "version", this.dataVersion);
    this.setDefault(data, "encrypted", false);
    this.setDefault(data, "statusCacheUpdateTime", 30);
    this.setDefault(data, "statusCacheRefreshTime", 3600);
    this.setDefault(data, "maxAge", 0);
    this.setDefault(data, "enableManagerRepo", false)
    this.setDefault(data, "managerRepoName", "")
    this.setDefault(data, "managerRepoToken", "")
    this.setDefault(data, "providers", []);
    for (const provider of data.providers)
      this.setProviderDefaults(provider);
    //suggested name for update secrets that depends on the provider type and user
    this.setProviderSecretDefaults(data);
    return data;
  },
  setProviderDefaults: function(element) {
    this.setDefault(element, "provider", "");
    this.setDefault(element, "uid", "");
    this.setDefault(element, "user", "");
    this.setDefault(element, "token", "");
    this.setDefault(element, "enabled", true);
    this.setDefault(element, "enableNotifications", true);
    this.setDefault(element, "filterIfLabel", "");
    if (element.provider == "GitHub") {
      this.setDefault(element, "url", "https://github.com");
      this.setDefault(element, "api", "https://api.github.com");
      this.setDefault(element, "unassignedAdditionalOwner", []);
      this.setDefault(element, "dependabotAdditionalOwner", []);
      this.setDefault(element, "graphql", {});
      this.setDefault(element.graphql, "ownerAffiliations", ["OWNER"]);
      this.setDefault(element.graphql, "maxProjects", 20);
      this.setDefault(element.graphql, "maxBranches", 10);
    } else if (element.provider == "GitLab") {
      this.setDefault(element, "url", "");
      this.setDefault(element, "dependabotUser", "dependabot");
      this.setDefault(element, "graphql", {});
      this.setDefault(element.graphql, "maxProjects", 20);
      this.setDefault(element.graphql, "maxBranches", 10);
      this.setDefault(element.graphql, "maxPipelines", 100);
    }
    this.setDefault(element, "updates", {});
    this.setDefault(element.updates, "tokenSecret", "");
    this.setDefault(element.updates, "userEmail", "");
  return element;
  },
  setDefault: function (parent, property, value) {
    if (parent[property] == undefined || parent[property] == null)
      parent[property] = value;
  },
  
  migrateV1toV2: function(configData) {
    this.renameProperty(configData, "enableCombinedUpdates", configData, "enableManagerRepo");
    this.renameProperty(configData, "updateManagerRepo", configData, "managerRepoName");
    this.renameProperty(configData, "updateManagerToken", configData, "managerRepoToken");
    configData.version = 2;
  },
  renameProperty: function(fromParent, fromName, toParent, toName) {
    if (fromParent[fromName] != undefined) {
      toParent[toName] = fromParent[fromName];
    }
    delete fromParent[fromName];
  },

  setProviderSecretDefaults: function(data) {
    for (let provider of data.providers) {
      if (provider.updates.tokenSecret == "" && provider.user != "") //only suggest if not set and user is defined
        // only alphanumeric and _ is allowed, for now, replacing dash characters
        provider.updates.tokenSecret = `DASHGIT_${provider.provider.toUpperCase()}_${provider.user.toUpperCase().replaceAll("-", "_")}_TOKEN`;
    }
  },
  getProviderByUid: function (uid) {
    for (let provider of config.data.providers)
      if (provider.uid == uid)
        return provider;
    return undefined;
  },
  getProviderFollowUpFileName: function(url, user) {
    return this.param.followUpFolder + "/" + url.replace("https://", "").replaceAll("/", "_") + "-" + user + ".json";
  },
  getGitHubUserAgent: function() {
    return `dashgit/${this.appVersion}`
  },

  //Token encryption related

  //To decript token if necessary
  xtoken: "",

  //to check a valid password checks if decription of all provider tokens is possible
  isValidPassword: function (providers, pass) {
    for (let provider of providers) {
      try {
        this.decrypt(provider.token);
      } catch (error) {
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
  // This is called from the API related methods to authenticate the requests
  decrypt: function (configToken) {
    // decrypt only if token is encrypted, if not, returns the value
    if (configToken.startsWith("aes:")) {
      let ciphertext = configToken.substring(4);
      if (config.xtoken == "") //will make fail the api calls
        return "invalid token";
      let text = encryption.decrypt(ciphertext, config.xtoken);
      //raise exception if password does not match (receives empty string)
      if (text.length == 0)
        throw "Can't decrypt the token, maybe the password is wrong"; //NOSONAR
      return text;
    } else
      return configToken;
  },

  // Manage feature flags
  loadFeatureFlags: function() {
    let ffstr = (new URL(document.location)).searchParams.get("ff");
    if (ffstr!=undefined && ffstr!=null) {
      let ffarr = ffstr.split(",");
      for (let item of ffarr)
        this.ff[item]=true;
    }
    console.log("Using feature flags: ", JSON.stringify(this.ff));
  },

}
export { config };
