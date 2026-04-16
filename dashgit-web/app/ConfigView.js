import { config } from "./Config.js"
import { configValidation } from "./ConfigValidation.js"

/**
 * Generates the html content for the config view
 */
const configView = {

  renderHeader: function () {
    $("#config").html(`
    <ul class="nav nav-underline">
      <li class="nav-item"><a class="nav-link config-nav-link active" id="config-providers" aria-current="page" href="#">Configure providers</a></li>
      <li class="nav-item"><a class="nav-link config-nav-link" id="config-import-export" href="#">Import and export</a></li>
      <li class="nav-item"><a class="nav-link config-nav-link" id="config-encrypt" href="#">Encrypt personal access tokens</a></li>
      <li class="nav-item"><a class="nav-link config-nav-link" id="config-reset" href="#">Reset password and tokens</a></li>
    </ul>
    <form class="config-form novalidate" id="config-form"></form>
    `);
  },
  renderHeaderState: function (target, encrypted) {
    $(".config-nav-link").removeClass("active");
    $(target).addClass("active");
    if (encrypted) {
      $("#config-encrypt").hide();
      $("#config-reset").show();
    } else {
      $("#config-encrypt").show();
      $("#config-reset").hide();
    }
  },

  // Main entry point to show the providers configuration form,
  // composed of a subform with common data and additional subforms for the providers
  renderData: function (data) {
    let html = this.common2html(data);
    html += `<div id="config-providers-all">`; //only to group all providers
    for (let i = 0; i < data.providers.length; i++)
      html += "\n" + this.provider2html(data.providers[i], i);
    html += "</div>"
    $("#config-form").html(html);
    this.refreshAll();
    // activate tooltips at the input labels
    $(`.info-icon`).tooltip({ delay: 200 });
  },

  common2html: function (data) {
    return `
    <div class="card mt-2 text-bg-light" id="config-providers-common">
      <div class="card-body pt-2 pb-2">
        <p class="card-text mb-1" style="display: none">
This configuration is stored in the browser local storage. For any change to take effect, click the Save configuration button.
        </p>
        <p id="stauts-no-providers" class="card-text mb-1 text-danger style="display: none"">
To start using DashGit you have to add a GitHub or GitLab provider and set the username that is accessing the repository. 
This will give you access to the public repositories at github.com, gitlab.com or GitLab on-premises.
        </p>
        <p id="status-without-auth" class="card-text mb-1 text-danger style="display: none"">
It is recommended to enable OAuth2 or set up a Personal Access Token (PAT) in all providers because unauthenticated API calls are subject to lower rate limits and do not allow you to view branches, build statuses and notifications.
        </p>
        <p id="status-with-unencrypted-pat" class="card-text mb-1 style="display: none"">
You should set up a password to encrypt the Personal Access Tokens (PAT) or use OAuth2 and remove all PATs to protect sensitive information.
        </p>
        <p id="status-with-encrypted-pat" class="card-text mb-1 style="display: none"">
Personal access tokens in this configuration will be saved encrypted. If you forget your password you will have to reset both password and tokens.
        </p>
        <p id="status-with-oauth-and-pat" class="card-text mb-1 style="display: none"">
Some providers use OAuth but also store a PAT. This PAT should be removed.
        </p>

        <h6 class="card-subtitle mb-1 mt-1 text-body-secondary">Common parameters:</h6>
        <div class="row">
          ${this.input2html("config-common-max-age", "number", "Max age", data.maxAge == 0 ? "" : data.maxAge, '', "100", "100", 
            "If present, filters out the work items with an update date older than the number of days specified")}
          ${this.input2html("config-common-statusCacheUpdateTime", "number", "Status Cache Update Time", data.statusCacheUpdateTime, 'required min="5" max="60"', "200", "100",
            "During this period (in seconds), any call to get statuses returns the cached data. When this time expires, the cache is incrementally updated by requesting data only from the projects that had recent commits",
            "Requred, between 5 and 60")}
          ${this.input2html("config-common-statusCacheRefreshTime", "number", "Status Cache Refresh Time", data.statusCacheRefreshTime, 'min="60" max="7200"', "200", "100",
            "Specifies a much longer period (in seconds) than Status Cache Update Time. When this time expires, the cache is fully refreshed",
            "Required, between 60 and 7200")}
        </div>

        <div class="card-subtitle h6 mb-1 mt-1 text-body-secondary">
          ${this.check2html(`config-providers-enabled-mgrepo`, 
            `Enable a Manager Repository for advanced functions <a href="${config.param.readmeManagerRepo}" target="_blank">[learn more]</a>`, 
            data.managerRepo.enabled,
            "Manager repository set up is requred to automatically create and merge combined dependency updates and for follow-up management", true)}
        </div>
        <div id="config-providers-all-mgrepo">
          <!-- authentication config, like the providers -->
          ${this.authprovider2html(data.managerRepo, "mgrepo")}
        </div>
        <div class="row">
          ${this.button2html("", "submit", "Save configuration", "config-btn-provider-submit btn-primary")}
          ${this.button2html("", "button", `${this.provider2icon("GitHub")} Add GitHub provider`, "config-btn-add-github btn-success")}
          ${this.button2html("", "button", `${this.provider2icon("GitLab")} Add GitLab provider`, "config-btn-add-gitlab btn-success")}
        </div>
      </div>
    </div>
  `;
  },
  provider2html: function (provider, key) {
    return `
    <div class="card mt-2 config-provider-card">
      <div class="card-body pt-2 pb-2 config-provider-panel" prov="${provider.provider}" key="${key}">
        <div class="row">
          <div class="col-auto">
            <p class="card-title h4">${this.provider2icon(provider.provider)} ${provider.provider}</p>
          </div>
          <div class="col-auto" style="width:22px"></div>
          ${this.check2html(`config-providers-enabled-${key}`, "Enabled", provider.enabled, "", true)}      
          ${this.input2html(`config-providers-url-${key}`, "url", "Repository url", provider.url, 'type="url" required', "150", "225", "The URL of the repository server.",
            "Enter the repository server URL for this provider")}
        </div>
        
        ${this.authprovider2html(provider, key)}
        
        <div class="row">  
          ${this.input2html(`config-providers-filterIfLabel-${key}`, "text", "Filter if label", provider.filterIfLabel, '', "150", "150",
            "Filters out work items that contain the specified label.")}
          ${this.array2html(`config-providers-unassignedAdditionalOwner-${key}`, "text", "Add owners to triage", provider.unassignedAdditionalOwner, '', "225", "150",
            "The default scope of Triage view is restricted to the repository of the authenticated user. Here you can include other users or organizations (separated by spaces)")}
          ${this.array2html(`config-providers-dependabotAdditionalOwner-${key}`, "text", "Add owners to dependabot", provider.dependabotAdditionalOwner, '', "225", "150",
            "The default scope of Dependabot view is restricted to the repository of the authenticated user. Here you can include other users or organizations (separated by spaces)")}
          ${this.check2html(`config-providers-enableNotifications-${key}`, "Show notifications/mentions", provider.enableNotifications)}
        </div>

        ${this.matchCriterion2html(provider, key)}

        <div class="row">
          <div class="col-auto card-subtitle h6 mt-2 text-body-secondary">GraphQL API parameters:</div>
          ${this.check2html(`config-providers-surrogate-enabled-${key}`, "Use a status surrogate", provider.statusSurrogateUser != "", "", true)}
          ${provider.provider == "GitHub"
            ? this.check2html(`config-providers-deprecated-graphqlV1-${key}`, "Use deprecated GraphQL query (before V1.6)", provider.graphql.deprecatedGraphqlV1)
            : ""}
        </div>
        <div class="row config-providers-graphql-settings">
          ${this.input2html(`config-graphql-maxProjects-${key}`, "number", "Max projects", provider.graphql.maxProjects, 'required min="2" max="100"', "150", "70",
            "Maximum number of repositories/projects that are retrieved to get the branches and build statuses",
            "Required, between 2 and 100")}
          ${provider.provider == "GitHub"
            ? this.input2html(`config-graphql-pageSize-${key}`, "number", "Page size", provider.graphql.pageSize, 'required min="2" max="50"', "150", "70",
              "Page size for the GitHub GraphQL API requests that get the branches and build statuses",
              "Required, between 2 and 100")
            : ""}
          ${this.input2html(`config-graphql-maxBranches-${key}`, "number", "Max branches", provider.graphql.maxBranches, 'required min="2" max="100"', "150", "70",
            "Maximum number of branches that are retrieved for each repository/project to get the build statuses"
            + (provider.provider == "GitLab" ? ". Note that in GitLab, more branches can be displayed if they are referenced in open merge requests" : ""),
            "Required, between 2 and 100")}
          ${provider.provider == "GitLab"
            ? this.input2html(`config-graphql-maxPipelines-${key}`, "number", "Max pipelines", provider.graphql.maxPipelines, 'required min="2" max="100"', "150", "70",
              "Maximum number of pipeline runs that are retrieved for each repository/project to get the branches and build statuses",
              "Required, between 2 and 100")
            : this.check2html(`config-graphql-include-forks-${key}`, "Include Forks", provider.graphql.includeForks)
              + this.check2html(`config-graphql-only-forks-${key}`, "Only Forks", provider.graphql.onlyForks)
              + (this.raw2html(" - GraphQL scope:", "Specifies the scope of the GitHub GraphQL API requests that get the branches and build statuses") + " &nbsp; "
              + this.check2html(`config-graphql-scope-owner-${key}`, "Owner", provider.graphql.ownerAffiliations.includes("OWNER"))
              + this.check2html(`config-graphql-scope-organization-${key}`, "Organization member", provider.graphql.ownerAffiliations.includes("ORGANIZATION_MEMBER"))
              + this.check2html(`config-graphql-scope-collaborator-${key}`, "Collaborator", provider.graphql.ownerAffiliations.includes("COLLABORATOR"))
              + this.input2html(`config-graphql-userSpecRepos-${key}`, "text", "Also include PRs from these repos", provider.graphql.userSpecRepos, '', "250", "450",
                "Include PRs from other repositories that are out of the scope. Specify the repos by full name (OWNER/REPO) and separated by spaces") )
          }
        </div>
        <div class="row config-providers-surrogate-settings">
          ${this.input2html(`config-providers-statusSurrogateUser-${key}`, "text", "Username of the status surrogate provider", provider.statusSurrogateUser, 'required', "350", "150",
            "The provider with this username and same repository url will be used to get the statuses, instead of calling the GraphQL API",
            "Enter the username of one of the other enabled providers in this platform")}
        </div>

        <div class="config-provider-updates-div-container">
        <div class="card-subtitle h6 mb-1 mt-1 text-body-secondary">Combined dependency updates, additional parameters:
          <a href="${config.param.readmeDependencyUpdates}" target="_blank">[learn more]</a></div>
        <div class="row">
          ${this.input2html(`config-updates-tokenSecret-${key}`, "text", "Secret Name to store the token", 
            provider.updates.tokenSecret, provider.user == "" ? "disabled" : "", "250", "300",
            "The name of a GitHub secret to store the personal access token used to access from the manager repository to other repositories")}
          ${this.input2html(`config-updates-userEmail-${key}`, "email", "User identified by this email", provider.updates.userEmail, '', "250", "300",
            "Optional email used to identify who creates the combined pull request and commits (if not set, some commits may not be identified as done by you)")}
        </div>
        </div>

        <div class="row">
          ${this.button2html("", "submit", "Save configuration", "config-btn-provider-submit btn-primary")}
          ${this.button2html("", "button", "Move up", "config-btn-provider-up btn-success")}
          ${this.button2html("", "button", "Move down", "config-btn-provider-down btn-success")}
          ${this.button2html("", "button", "Remove this provider", "config-btn-provider-remove btn-danger")}
        </div>
      </div>
    </div>
    `;
  },
  authprovider2html: function (provider, key) {
    return `
        <div class="row">
        <!-- regular providers and manager repo have some additional properties that are different -->
        ${key == "mgrepo"
          ? this.input2html(`config-providers-name-mgrepo`, "text", "Manager Repository", provider.name, 'required', "200", "200",
              "The full name (OWNER/REPO) of a dedicated private GitHub repository where the combined updates will be pushed and merged and where work item follow-ups are stored",
              "The name of the manager repository (OWNER/REPO) is required")
          : this.input2html(`config-providers-user-${key}`, "text", "Username", provider.user, 'required', "150", "150",
              "The reference user for whom the work items are displayed (assigned to, created by, etc.)",
            "The reference username is required")
        }
          ${this.check2html(`config-providers-auth-select-${key}`,
                `Use OAuth2 to authenticate <a href="" target="_blank">[learn more]</a>`,
                provider.oauth,
                "If checked, the authentication is done with OAuth2+PKCS instead of using a Personal Access Token (PAT). After saving the configuration and browsing to other view, you will be redirected to the provider login page to complete the authentication.", true)}
          ${this.input2html(`config-providers-token-${key}`, "password", "Personal Access token (PAT)", provider.token, '', "225", "150",
              "An Personal Access Token (PAT) with read permission to the repository, used to authenticate the repository API requests for this provider.")}
          ${" &nbsp; "}
          ${this.check2html(`config-providers-oauth-customize-${key}`,
                `Customize OAuth2`,
                provider.oacustom.enabled,
                "The default configuration is enough authenticate using OAuth2 against github.com and gitlab.com. "
                + "Customize only if you are using your own resources for authorization (GitHub OAuth App or GitLab Application), "
                + "on-premises Git server or token exchange proxy service.", true)}
        </div>
        <div class="row">
          ${this.input2html(`config-providers-oauth-clientId-${key}`, "text", "OAuth Client ID", provider.oacustom.clientId, '', "150", "150",
            "The client ID of the GitHub/GitLab App where you login to get the authorization grant.")}
          ${this.input2html(`config-providers-oauth-tokenUrl-${key}`, "text", "OAuth exchange token URL", provider.oacustom.tokenUrl, '', "225", "300",
            "The URL of the proxy service endpoint that exchanges the authorization grant (code) by the token.")}
        </div>
    `;
  },
  matchCriterion2html: function (provider, key) {
    if (provider.provider == "GitHub")
      return `
        <div class="row">  
          <div class="col-auto">
            <div class="input-group input-group-sm">
              <span class="input-group-text" style="width: 150px">Match criterion${this.infoIcon(
                "To include or exclude work items in all repositories owned by certain users or organizations, you can select here the criterion (include or exclude)"
                + " and then select the users or organizations that must match the crierion."
              )}</span>
              <select id="${`config-providers-match-criterion-${key}`}" class="form-select form-select-sm" aria-label="Match" style="width: 150px">
                <option ${provider.match.criterion == "exclude" ? "selected" : ""} value="exclude">Exclude any</option>
                <option ${provider.match.criterion == "include" ? "selected" : ""} value="include">Include one</option>
              </select>
            </div>
          </div>
          ${this.array2html(`config-providers-match-user-${key}`, "text", "match user(s)", provider.match.user, 'pattern=".*"', "160", "215",
            "A list of users separated by spaces that will be included/excluded. ",
            "If criterion is include, only one user or organization is allowed.")}
          ${this.array2html(`config-providers-match-org-${key}`, "text", "match org(s)", provider.match.org, 'pattern=".*"', "160", "215",
            "A list of organizations separated by spaces that will be included/excluded. ",
            "If criterion is include, only one user or organization is allowed.")}
         </div>
    `;
    else
      return "";
  },

  // Retrieve the info in the ui and returns a config data structure to the controller

  getProviders: function () {
    let providers = [];
    const items = $("#config-providers-all").find(`.config-provider-panel`);
    for (let item of items) // each provider card stores the provider type and a key (to differenciate between providers)
      providers.push({ type: $(item).attr("prov"), key: $(item).attr("key") });
    return providers;
  },

  html2common: function (data) {
    const age = $("#config-common-max-age").val().trim();
    data.maxAge = age == "" ? 0 : age;
    data.statusCacheUpdateTime = $("#config-common-statusCacheUpdateTime").val().trim();
    data.statusCacheRefreshTime = $("#config-common-statusCacheRefreshTime").val().trim();
    data.managerRepo.enabled = $("#config-providers-enabled-mgrepo").is(':checked');
    data.managerRepo.name = $("#config-providers-name-mgrepo").val().trim();
    this.html2authprovider(data.managerRepo, "mgrepo")
    return data;
  },

  html2authprovider: function(provider, id) {
    provider.oauth = $(`#config-providers-auth-select-${id}`).is(':checked');
    provider.token = $(`#config-providers-token-${id}`).val().trim();
    provider.oacustom.enabled = $(`#config-providers-oauth-customize-${id}`).is(':checked');
    provider.oacustom.clientId = $(`#config-providers-oauth-clientId-${id}`).val().trim();
    provider.oacustom.tokenUrl = $(`#config-providers-oauth-tokenUrl-${id}`).val().trim();
  },

  html2provider: function (provider, id) {
    provider.enabled = $(`#config-providers-enabled-${id}`).is(':checked');
    provider.user = $(`#config-providers-user-${id}`).val().trim();
    if (provider.provider == "GitLab")
      provider.url = $(`#config-providers-url-${id}`).val().trim();
    // authentication data (method and parameters)
    this.html2authprovider(provider, id);

    provider.filterIfLabel = $(`#config-providers-filterIfLabel-${id}`).val().trim();
    provider.unassignedAdditionalOwner = this.str2array($(`#config-providers-unassignedAdditionalOwner-${id}`).val());
    provider.dependabotAdditionalOwner = this.str2array($(`#config-providers-dependabotAdditionalOwner-${id}`).val());

    if (provider.provider == "GitHub") {
      provider.match.criterion = $(`#config-providers-match-criterion-${id}`).val()
      provider.match.user = this.str2array($(`#config-providers-match-user-${id}`).val());
      provider.match.org = this.str2array($(`#config-providers-match-org-${id}`).val());
    }
    provider.enableNotifications = $(`#config-providers-enableNotifications-${id}`).is(':checked');
    provider.statusSurrogateUser = $(`#config-providers-statusSurrogateUser-${id}`).val().trim();

    provider.graphql.maxProjects = $(`#config-graphql-maxProjects-${id}`).val().trim();
    provider.graphql.maxBranches = $(`#config-graphql-maxBranches-${id}`).val().trim();

    provider.updates.tokenSecret = $(`#config-updates-tokenSecret-${id}`).val().trim();
    provider.updates.userEmail = $(`#config-updates-userEmail-${id}`).val().trim();

    if (provider.provider == "GitLab") {
      provider.graphql.maxPipelines = $(`#config-graphql-maxPipelines-${id}`).val().trim();
    } else {
      provider.graphql.pageSize = $(`#config-graphql-pageSize-${id}`).val().trim();
      provider.graphql.deprecatedGraphqlV1 = $(`#config-providers-deprecated-graphqlV1-${id}`).is(':checked')
      provider.graphql.onlyForks = $(`#config-graphql-only-forks-${id}`).is(':checked')
      provider.graphql.includeForks = $(`#config-graphql-include-forks-${id}`).is(':checked');
      provider.graphql.ownerAffiliations = [];
      if ($(`#config-graphql-scope-owner-${id}`).is(':checked'))
        provider.graphql.ownerAffiliations.push("OWNER");
      if ($(`#config-graphql-scope-organization-${id}`).is(':checked'))
        provider.graphql.ownerAffiliations.push("ORGANIZATION_MEMBER");
      if ($(`#config-graphql-scope-collaborator-${id}`).is(':checked'))
        provider.graphql.ownerAffiliations.push("COLLABORATOR");
      if (provider.graphql.ownerAffiliations.length == 0) //default if none selected
        provider.graphql.ownerAffiliations.push("OWNER");
      provider.graphql.userSpecRepos = $(`#config-graphql-userSpecRepos-${id}`).val().trim();
    }
    return provider;
  },

  // View refresh on changes

  //Sets the appropriate view state for elements that have dependent inputs that must be hidden or shown
  refreshAll: function () {
    this.refreshAuthenticationMethods();
    this.refreshUpdateManagerRepo();
    this.refreshProviderDefaults();
    this.refreshProviderSurrogates();
    this.refreshMoveStatus();
    this.refreshAuthenticationStatus();
  },
  // refresh for changes on the enabled states of the manager repository
  refreshUpdateManagerRepo: function () {
    if ($(`#config-providers-enabled-mgrepo`).is(':checked')) {
      $(`#config-providers-all-mgrepo`).show();
      $(`.config-provider-updates-div-container`).show();
      configValidation.onShowInstallValidation($(`#config-providers-name-mgrepo`))
   } else {
      configValidation.onHideUninstallValidation($(`#config-providers-name-mgrepo`));     
      $(`.config-provider-updates-div-container`).hide();
      $(`#config-providers-all-mgrepo`).hide();
    }
  },
  // Toggle between authentication with PAT and OAuth2
  refreshAuthenticationMethods: function () {
    let cards = $(document).find(".config-provider-card");
    for (let card of cards) {
      this.refreshAuthenticationMethod(card);
    }
    // Manager repository has the same structure but is inside the common parameters card
    let rpmgrCard = $(document).find("#config-providers-common");
    this.refreshAuthenticationMethod(rpmgrCard);
  },
  refreshAuthenticationMethod: function (card) {
      let auth = $(card).find('input[id^="config-providers-auth-select-"]');
      let token = $(card).find('input[id^="config-providers-token-"]');
      let customize = $(card).find('input[id^="config-providers-oauth-customize-"]');
      let clientId = $(card).find('input[id^="config-providers-oauth-clientId-"]');
      let tokenUrl = $(card).find('input[id^="config-providers-oauth-tokenUrl-"]');
      if ($(auth).is(':checked')) {
        $(token).closest(".col-auto").hide();
        $(customize).closest(".col-auto").show();
        if ($(customize).is(':checked')) {
          $(clientId).closest(".col-auto").show();
          $(tokenUrl).closest(".col-auto").show();
        } else {
          $(clientId).closest(".col-auto").hide();
          $(tokenUrl).closest(".col-auto").hide();
        }
      } else {
        $(token).closest(".col-auto").show();
        $(customize).closest(".col-auto").hide();
        $(clientId).closest(".col-auto").hide();
        $(tokenUrl).closest(".col-auto").hide();
    }
  },

  // hide GitHub urls
  refreshProviderDefaults: function () {
    let urls = $('input[id^="config-providers-url-"]');
    for (let url of urls) {
      if ($(url).val() == "https://github.com")
        $(url).closest(".col-auto").hide();
    }
  },
  // Toggle between visibility of graphql parameters and surrogate user.
  // This depends on a check that is on when the surrogate user is empty.
  // Hides the toggle when there is no posibility to have surrogates (e.g. only one provider)
  refreshProviderSurrogates: function () {
    let surrogateUsers = $('input[id^="config-providers-statusSurrogateUser-"]');
    for (let surrogate of surrogateUsers) {
      let check = $(surrogate).closest(".config-provider-card").find('input[id^="config-providers-surrogate-enabled-"]');
      let checked = $(surrogate).val() != "";
      this.refreshProviderSurrogate(check, checked);
    }
  },
  refreshProviderSurrogate: function (check, checked) {
    let providerRoot = $(check).closest(".config-provider-card");
    // Hide the checkbox and disables surrogates if there are less than 2 providers with the same url
    if (this.getSurrogateCandidateNames(providerRoot).length == '') {
      $(providerRoot).find('input[id^="config-providers-surrogate-enabled-"]').closest(".col-auto").hide();
      checked = false; // no enough providers, force all disabled even if it was checked before
    } else {
      $(providerRoot).find('input[id^="config-providers-surrogate-enabled-"]').closest(".col-auto").show();
    }
    // Toogle input values depending on the checked state
    const surrogateUser = $(providerRoot).find('input[id^="config-providers-statusSurrogateUser-"]');
    if (checked) {
      $(providerRoot).find(".config-providers-graphql-settings").hide();
      $(providerRoot).find(".config-providers-surrogate-settings").show();
      // Before installing validation, sets the appropriate validation attributes in the dom
      const allowedSurrogates = this.getSurrogateCandidateNames(providerRoot);
      surrogateUser.attr("pattern", allowedSurrogates.join("|"));
      surrogateUser.attr("reqired", "");
      configValidation.onShowInstallValidation(surrogateUser);
    } else {
      configValidation.onHideUninstallValidation(surrogateUser);
      // if unchecked, also cleans the surrogate user field, which is what is stored in the config to determine if there is a surrogate
      surrogateUser.val("");
      surrogateUser.removeAttr("required");
      surrogateUser.removeAttr("pattern");
      $(providerRoot).find(".config-providers-graphql-settings").show();
      $(providerRoot).find(".config-providers-surrogate-settings").hide();
    }
  },
  // the usernames of all providers that could be designated as surrogate of this provider
  getSurrogateCandidateNames(providerRoot) {
    const thisId = $(providerRoot).find(".card-body").attr("key");
    const thisUrl = $(providerRoot).find('input[id^="config-providers-url-"]').val().trim();
    let names = [];
    for (let provider of $("#config-providers-all").children()) {
      // url must match, enabled, name non empty, excluding this provider (check by id)
      const targetId = $(provider).find(".card-body").attr("key");
      const targetUrl = $(provider).find('input[id^="config-providers-url-"]').val().trim();
      const targetEnabled = $(provider).find('input[id^="config-providers-enabled-"]').is(":checked");
      const targetUser = $(provider).find('input[id^="config-providers-user-"]').val().trim();
      if (thisUrl == targetUrl && targetEnabled && targetUser != "" && thisId != targetId)
        names.push(targetUser);
    }
    console.log(`Surrogate candidate names, provider ${thisId}: ${names}`);
    return names;
  },

  refreshGraphqlIncludeForks: function (check, checked) {
    if (checked)
       $(check).closest(".config-provider-card").find('input[id^="config-graphql-only-forks-"]').prop("checked", false);
  },
  refreshGraphqlOnlyForks: function (check, checked) {
    if (checked)
      $(check).closest(".config-provider-card").find('input[id^="config-graphql-include-forks-"]').prop("checked", false);
  },
  // toggle visibility of move provider buttons
  refreshMoveStatus: function () {
    $(".config-btn-provider-down").prop("disabled", false);
    $(".config-btn-provider-up").prop("disabled", false);
    const items = $("#config-providers-all").find(`.config-provider-panel`);
    if (items.length > 0) {
      $($(items[0]).find(".config-btn-provider-up")[0]).prop("disabled", true);
      $($(items[items.length - 1]).find(".config-btn-provider-down")[0]).prop("disabled", true);
    }
  },

  refreshAuthenticationStatus: function () { // NOSONAR
    $("#stauts-no-providers").hide();
    $("#status-without-auth").hide();
    $("#status-with-unencrypted-pat").hide();
    $("#status-with-encrypted-pat").hide();
    $("#status-with-oauth-and-pat").hide();
    $("#status-all-without-pat").hide();
    const data = config.data;
    if (data.providers.length == 0) {
      $("#stauts-no-providers").show();
      return;
    }
    let oauthWithoutPat = 0;
    for (let provider of data.providers) {
      if (provider.token == "" && !provider.oauth)
        $("#status-without-auth").show();
      if (!data.encrypted && provider.token != "")
        $("#status-with-unencrypted-pat").show();
      if (data.encrypted && provider.token != "")
        $("#status-with-encrypted-pat").show();
      if (provider.oauth && provider.token != "")
        $("#status-with-oauth-and-pat").show();
      if (data.encrypted && provider.oauth && provider.token == "")
        oauthWithoutPat++;
    }
  },

  // View manipulation

  addProvider: function (provider) {
    //get latest id to increase it in the new provider
    //can't count as some item keys may have been removed
    const items = $("#config-providers-all").find(`.config-provider-panel`);
    let last = -1;
    for (let item of items)
      if (parseInt($(item).attr("key")) > last)
        last = parseInt($(item).attr("key"));

    last++;
    const html = this.provider2html(provider, last);
    $("#config-providers-all").append(html);
    this.refreshAll();
    $("#config-providers-user-" + last).focus();
  },
  removeProvider: function (location) {
    $(location).closest(".config-provider-card").remove();
    this.refreshAll();
  },
  moveProvider: function (location, where) {
    const element = $(location).closest(".config-provider-card");
    if (where > 0)
      $(element).insertAfter($(element).next());
    else if (where < 0)
      $(element).insertBefore($(element).prev());
    this.refreshAll();
  },

  // Other rendering actions

  renderConfigData: function (target, data) {
    this.renderHeaderState($(target), data.encrypted);
    this.renderData(data);
    console.log(data);
  },
  renderEncrypt: function (target, encrypted) {
    this.renderHeaderState($(target), encrypted);
    $("#config-form").html(this.encloseInsideCard(`
  <p>This configuration is stored in your browser's local storage. You can set a password to encrypt the personal access tokens.</p>
      <div class="row">
  ${this.inputSimple2html("inputEncryptPassword", "password", "Enter a password to encrypt the Personal Access Tokens (PAT):", "required")}
      ${this.button2html("inputEncryptButton", "submit", "Encrypt")}
      </div>
    `));
  },
  renderDecrypt: function (target, encrypted) {
    this.renderHeaderState($(target), encrypted);
    $("#config-form").html(this.encloseInsideCard(`
  <p>The personal access tokens in this configuration are encrypted. If you forgot your password, you must reset both the password and the tokens.</p>
      <div class="row">${this.button2html("inputDecryptButton", "submit", "Reset password and tokens", "btn-danger")}</div>
    `));
  },
  renderImportExport: function (target, data) {
  this.renderHeaderState($(target), data.encrypted);
  $("#config-form").html(`
  <p class="m-2">You can export or import your configuration by copying or saving the JSON below.</p>
  <label for="configJson">Configuration parameters (JSON):</label>
  <textarea class="form-control" id="configJson" rows="10">${JSON.stringify(data, null, 2)}</textarea>
  <button type="submit" class="btn btn-primary btn-sm" id="buttonConfigSave">SAVE CONFIGURATION</button>
  `);
  },

  login2html: function () { //this is used from the index to set the decrypt password
    return `
    <form id="config-encrypt" class="form-group row" novalidate>
  <p>Enter the password used to encrypt the personal access tokens. If you forgot your password, click Skip and go to the configuration page to reset it.</p>
  ${this.inputSimple2html("inputPassword", "password", "Enter your password:", "Required")}
      ${this.button2html("inputPasswordButton", "submit", "Submit")}
      ${this.button2html("inputSkipButton", "submit", "Skip")}
    </form>
    `;
  },

  // Display of common form input controls, enclosed in col-auto for fluid placement

  input2html: function (id, type, label, value, validation, labelWidth, valueWidth, info, invalidMsg = "Invalid value") { // NOSONAR
    let labelStyle = labelWidth == "" ? "" : `style="width:${labelWidth}px"`;
    let valueStyle = valueWidth == "" ? "" : `style="width:${valueWidth}px"`;
    return `
    <div class="col-auto" id="${id}-div-container">
      <div class="input-group input-group-sm">
        <span class="input-group-text" id="${id}-label" ${labelStyle}>${label}${this.infoIcon(info)}</span>
        <input id="${id}" type="${type}" value="${value ?? ''}" ${validation} ${valueStyle}
          class="form-control ${label == 'Username' ? ' fw-bold' : ''}" aria-label="${label}" aria-describedby="${id}-label">
      </div>
      ${ validation && validation != "" ? '<div class="text-danger small d-none">' + invalidMsg + '</div>' : ""}
    </div>
    `;
  },

  array2html: function (id, type, label, value, validation, labelWidth, valueWidth, info, invalidMsg) { // NOSONAR
    let valueStr = value == undefined || value.length == 0 ? "" : value.join(" ");
    return this.input2html(id, type, label, valueStr, validation, labelWidth, valueWidth, info, invalidMsg);
  },

  inputSimple2html: function (id, type, label, validationMessage) {
    return `
      <div class="col-auto">
        <label for="${id}" class="col-form-label">${label}</label>
      </div>
      <div class="col-auto">
        <input id="${id}" type="${type}" class="form-control form-control-sm" aria-label="${label}" required></input>
      </div>
    `;
  },

  check2html: function (id, label, checked, info, isSwitch) {
    return `
      <div class="col-auto" id="${id}-div-container">
        <div class="form-check${isSwitch ? " form-switch" : ""} mt-1">
          <input class="form-check-input" type="checkbox" value="" ${checked ? "checked" : ""} id="${id}">
          <label class="form-check-label" for="${id}">${label}${this.infoIcon(info)}</label>
        </div>
      </div>
    `;
  },
  raw2html: function (label, info) {
    return `
      <div class="col-auto" style="margin-top:7px">
        ${label}${this.infoIcon(info)}
      </div>
    `;
  },

  infoIcon: function(info) {
    return info != undefined && info != "" ? `&nbsp;<i class="fa-regular fa-circle-question info-icon" title="${info}"></i>` : ``;
  },

  button2html: function (id, type, label, clazz) {
    const styleClass = clazz == undefined ? `btn-primary` : `${clazz}`;
    const idAttr = id == "" ? "" : `id="${id}"`;
    return `
      <div class="col-auto">
        <button type="${type}" ${idAttr} class="btn ${styleClass} btn-sm">${label}</button>
      </div>
    `
  },

  encloseInsideCard: function (html) {
    return `<div class="card mt-2" id="config-providers-common"><div class="card-body pt-2 pb-2">${html}</div></div>`;
  },

  provider2icon: function (providerType) {
    if (providerType == "GitHub")
      return `<i class="fa-brands fa-github"></i>`;
    else if (providerType == "GitLab")
      return `<i class="fa-brands fa-square-gitlab"></i>`;
    return "";
  },

  str2array: function (value) {
    return value.trim() == "" ? [] : value.trim().split(/\s+/);
  },

  setAttributeOrRemove: function (object, attribute, value) {
    if (!value || value == "")
      delete object[attribute];
    else
      object[attribute] = value;
    return object;
  },

}

export { configView };
