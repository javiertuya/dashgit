/**
 * Shared persitent data: configuration of parameters, providers, etc. 
 */
const DASHGIT_CONFIG = "dashgit-config"; // Store: all configuration
const LAST_VISITED_DATES = "dashgit-config-visited"; // Store: to highlight recent items
//const PAT_SECRET = "dashgit-pat-secret"; // Store: to decript PATs
const config = {

  //App version number, do not push any change of it, this is set during deploy
  appVersion: "main",

  //Configuration data version number, to keep track of changes of data structure and migrations
  dataVersion: 3,

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
    viewFilter: {}, // additional filters applicable to the view indicated by the key
  },

  //Persistent configuration data, that is saved to browser storage
  //Next methods are intended for manipulation of this config data
  data: {},

  // Load and save config data from browser storage
  load: function () {
    let configStr = localStorage.getItem(DASHGIT_CONFIG);
    config.data = this.parseAndSanitizeData(configStr);
    // save to storage (data could be changed by santization or migration)
    config.save();
  },
  save: function () {
    localStorage.setItem(DASHGIT_CONFIG, JSON.stringify(config.data));
  },

  // Determines if version has changed from last used configuration (used to display a message to the user),
  // does not fire if there are no providers (still not initialized)
  appUpdateEvent: function() {
    if (config.appVersion != config.data["appLastVersion"] && config.data.providers.length > 0) {
      config.data["appLastVersion"] = config.appVersion;
      this.save(); // save to prevent this message again
      return true;
    }
    return false;
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
      if (data.version == 2)
        this.migrateV2toV3(data);
    }
    data = this.setAllDefaults(data);
    //set other config data not directly set from the ui (uid identification of providers)
    for (let i = 0; i < data.providers.length; i++)
      data.providers[i].uid = i.toString() + "-" + data.providers[i].provider.toLowerCase();

    return data;
  },
  setAllDefaults: function (data) {
    this.setDefault(data, "version", this.dataVersion);
    this.setDefault(data, "appLastVersion", "");
    this.setDefault(data, "encrypted", false);
    this.setDefault(data, "statusCacheUpdateTime", 30);
    this.setDefault(data, "statusCacheRefreshTime", 3600);
    this.setDefault(data, "maxAge", 0);
    this.setDefault(data, "managerRepo", {});
    this.setDefault(data.managerRepo, "enabled", false);
    this.setDefault(data.managerRepo, "name", "");
    // authentication related properties with the same name than in the providers
    this.setAuthProviderDefaults(data.managerRepo);
    this.setDefault(data, "providers", []);
    for (const provider of data.providers)
      this.setProviderDefaults(provider);
    //suggested name for update secrets that depends on the provider type and user
    this.setProviderSecretDefaults(data);
    this.setViewFilterDefaults(data);
    return data;
  },
  setAuthProviderDefaults: function(element) {
    this.setDefault(element, "token", "");
    this.setDefault(element, "oauth", false);
    this.setDefault(element, "oacustom", {}); // can have a variable number of attributes
    this.setDefault(element.oacustom, "enabled", false);
    this.setDefault(element.oacustom, "appName", "");
    this.setDefault(element.oacustom, "clientId", "");
  },
  setProviderDefaults: function(element) {
    this.setDefault(element, "provider", "");
    this.setDefault(element, "uid", "");
    this.setDefault(element, "user", "");
    this.setAuthProviderDefaults(element);
    this.setDefault(element, "enabled", true);
    this.setDefault(element, "enableNotifications", true);
    this.setDefault(element, "filterIfLabel", "");
    this.setDefault(element, "statusSurrogateUser", "");
    // match filters are only for github, but empty filter is included also in gitlab to handle it in the same way
    this.setDefault(element, "match", {});
    this.setDefault(element.match, "criterion", "exclude");
    this.setDefault(element.match, "user", []);
    this.setDefault(element.match, "org", []);
    if (element.provider == "GitHub") {
      this.setDefault(element, "url", "https://github.com");
      this.setDefault(element, "api", "https://api.github.com");
      this.setDefault(element, "unassignedAdditionalOwner", []);
      this.setDefault(element, "dependabotAdditionalOwner", []);
      this.setDefault(element, "graphql", {});
      this.setDefault(element.graphql, "deprecatedGraphqlV1", false);
      this.setDefault(element.graphql, "includeForks", false);
      this.setDefault(element.graphql, "onlyForks", false);
      this.setDefault(element.graphql, "ownerAffiliations", ["OWNER"]);
      this.setDefault(element.graphql, "userSpecRepos", "");
      this.setDefault(element.graphql, "maxProjects", 20);
      this.setDefault(element.graphql, "pageSize", 10); // only GitHub is paginated
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
  setViewFilterDefaults: function (data) {
    this.setDefault(data, "viewFilter", {});
    this.setDefault(data.viewFilter, "main", {}); // main is shared by all views (in the header)
    this.setMainFilterDefaults(data);
    this.setDefault(data.viewFilter, "involved", {});
    this.setDefault(data.viewFilter, "created", {});
    this.setDefault(data.viewFilter, "unassigned", {});
    this.setDefault(data.viewFilter, "statuses", {});
    this.setDefault(data.viewFilter, "dependabot", {});
    this.setDefault(data.viewFilter.involved, "authorMe", true);
    this.setDefault(data.viewFilter.involved, "authorOthers", true);
    this.setDefault(data.viewFilter.involved, "exclude", "");
    this.setDefault(data.viewFilter.created, "exclude", "");
    this.setDefault(data.viewFilter.unassigned, "authorMe", true);
    this.setDefault(data.viewFilter.unassigned, "authorOthers", true);
    this.setDefault(data.viewFilter.statuses, "compact", false);
    this.setDefault(data.viewFilter.statuses, "exclude", "");
    this.setDefault(data.viewFilter.dependabot, "exclude", "");
  },
  setMainFilterDefaults: function(data) {
    this.setDefault(data.viewFilter.main, "status", "111111");
    this.setDefault(data.viewFilter.main, "search", "");
    this.setDefault(data.viewFilter.main, "sort", "descending,updated_at");
    this.setDefault(data.viewFilter.main, "group", false);
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
  migrateV2toV3: function(configData) {
    // Manager repo properties are all inside a new object, copy and delte old properties
    configData["managerRepo"] = {
      enabled: configData.enableManagerRepo,
      name: configData.managerRepoName,
      token: configData.managerRepoToken
    }
    delete configData["enableManagerRepo"];
    delete configData["managerRepoName"];
    delete configData["managerRepoToken"];
    configData.version = 3;
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

  // Control of the moment where each tab is visited, used to highlight items
  // that are new since the previous visit to a tab.
  // Note that this is informative only, and not 100% exact because it is based
  // on the dates received from the api compared whit the access dates to the tabs.
  // To prevent and item not to be highlighted when it should,
  // gives a few secons of tolerance (visit time is always a little smaller than the real)
  // this means that some item may be highlighted twice if updated during this period
  // A completely precise should check the items that were displayed previously
  // and compare them against the actual items

  getLastVisitedDate: function(target) {
    let visited = this.getVisitedDates();
    return new Date(visited[target]);
  },
  saveLastVisitedDate: function(target, currentDate) {
    let visited = this.getVisitedDates();
    currentDate.setMilliseconds(0);
    // Gives a few secons of tolerance,
    // this means that some item may be highlighted twice if updated during this period
    // but avoids and item not to be highlighted when it should
    visited[target] = new Date(currentDate-4000);
    localStorage.setItem(LAST_VISITED_DATES, JSON.stringify(visited));
  },
  getVisitedDates: function() {
    let value = localStorage.getItem(LAST_VISITED_DATES);
    if (value == undefined || value == null)
      value = "{}";
    return JSON.parse(value);
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
