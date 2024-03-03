import { config } from "./Config.js"

/**
 * Generates the html content for the config view
 */
const configView = {

  renderHeader: function () {
    $("#config").html(`
    <ul class="nav nav-underline">
      <li class="nav-item"><a class="nav-link config-nav-link active" id="config-providers" aria-current="page" href="#">Configure providers</a></li>
      <li class="nav-item"><a class="nav-link config-nav-link" id="config-import-export" href="#">Import and export</a></li>
      <li class="nav-item"><a class="nav-link config-nav-link" id="config-encrypt" href="#">Encrypt API access tokens</a></li>
      <li class="nav-item"><a class="nav-link config-nav-link" id="config-reset" href="#">Reset password and tokens</a></li>
    </ul>
    <form class="config-form" id="config-form"></form>
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
    this.setMoveStatus();
    this.setToggleDependencies(); // eg. visibility of elements that depends on a checkbox
    // activate tooltips at the input labels
    $(`.info-icon`).tooltip({ delay: 200 });
  },

  common2html: function (data) {
    return `
    <div class="card mt-2 text-bg-light" id="config-providers-common">
      <div class="card-body pt-2 pb-2">
        <p class="card-text mb-1">
          ${data.encrypted
        ? "API access tokens in this configuration will be saved encrypted. If you forget your password you will have to reset both password and tokens."
        : "This configuration is stored in the browser local memory. You can set up a password to encrypt the API access tokens."
      }
        </p>
        ${this.anyGitHubWithoutToken(data)
        ? `<p class="card-text mb-1 text-danger">GitHub unauthenticated providers are subject to lower rate limits and do not allow you to view branches, build statuses and notifications.</p>`
        : ""}

        <h6 class="card-subtitle mb-1 mt-1 text-body-secondary">Common parameters:</h6>
        <div class="row">
          ${this.input2html("config-common-max-age", "number", "Max age", data.maxAge == 0 ? "" : data.maxAge, 'min="0" max="365"', "100", "100", 
            "If present, filters out the work items that are older than the number of days specified")}
          ${this.input2html("config-common-statusCacheUpdateTime", "number", "Status Cache Update Time", data.statusCacheUpdateTime, 'min="5" max="60"', "200", "100",
            "During this period (in seconds), any call to get statuses returns the cached data. When this time expires, the cache is incrementally updated by requesting data only from the latest updated projects")}
          ${this.input2html("config-common-statusCacheRefreshTime", "number", "Status Cache Refresh Time", data.statusCacheRefreshTime, 'min="60" max="7200"', "200", "100",
            "Specifies a much longer period (in seconds) than Status Cache Update Time. When this time expires, the cache is fully refreshed")}
        </div>

        <h6 class="card-subtitle mb-1 mt-1 text-body-secondary">Automatically create and merge combined dependency updates
          <a href="https://github.com/javiertuya/dashgit-integration?tab=readme-ov-file#combined-dependabot-updates" target="_blank">[learn more]</a></h6>
        <div class="row">
          ${this.input2html(`config-common-updateManagerRepo`, "text", "Update Manager Repo", data.updateManagerRepo, 'required', "200", "200",
            "The full name (OWNER/REPO) of a dedicated private GitHub repository where the combined updates will be pushed and merged")}
          ${this.input2html(`config-common-updateManagerToken`, "password", "Access token", data.updateManagerToken, '', "150", "225",
            "An API access token with write permission to the Update Manager Repo that combines and merges the updates")}
          ${this.check2html(`config-common-enableCombinedUpdates`, "Enable combined dependency updates", data.enableCombinedUpdates,
            "Enables the ability to automatically create and merge combined dependency updates for each repository")}
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
            <p class="card-title h5">${this.provider2icon(provider.provider)} ${provider.provider}</p>
          </div>
          <div class="col-auto" style="width:22px"></div>
          ${this.check2html(`config-providers-enabled-${key}`, "Enabled", provider.enabled)}
        </div>
        <div class="row">
          ${this.input2html(`config-providers-user-${key}`, "text", "Username", provider.user, 'required', "150", "150",
            "The reference user for which the work items are displayed (assigned to, created by, etc.)")}
          ${this.input2html(`config-providers-token-${key}`, "password", "Access token", provider.token, '', "150", "225",
            "An API access token with read permission to the repository, used to authenticate the repository API requests of this provider")}
          ${provider.provider == "GitLab"
            ? this.input2html(`config-providers-url-${key}`, "url", "Repository url", provider.url, 'required', "150", "225", "The url of the repository server")
            : ""}
        </div>
        <div class="row">  
          ${this.input2html(`config-providers-filterIfLabel-${key}`, "text", "Filter if label", provider.filterIfLabel, '', "150", "150",
            "Filters out the work items that contain the label specified")}
          ${this.array2html(`config-providers-unassignedAdditionalOwner-${key}`, "text", "Add owners to unassigned", provider.unassignedAdditionalOwner, '', "225", "150",
            "The default scope of Unassigned view is restricted to the repository of the token owner. Here you can include other users or organizations (separated by spaces)")}
          ${this.array2html(`config-providers-dependabotAdditionalOwner-${key}`, "text", "Add owners to dependabot", provider.dependabotAdditionalOwner, '', "225", "150",
            "The default scope of Dependabot view is restricted to the repository of the token owner. Here you can include other users or organizations (separated by spaces)")}
          ${this.check2html(`config-providers-enableNotifications-${key}`, "Show notifications", provider.enableNotifications)}
        </div>

        <h6 class="card-subtitle mb-1 mt-1 text-body-secondary">GraphQL API parameters:</h6>
        <div class="row">
          ${this.input2html(`config-graphql-maxProjects-${key}`, "number", "Max projects", provider.graphql.maxProjects, 'required min="2" max="100"', "150", "100",
            "Maximum number of repositories/projects that are retrieved to get the branches and statuses")}
          ${this.input2html(`config-graphql-maxBranches-${key}`, "number", "Max branches", provider.graphql.maxBranches, 'required min="2" max="100"', "150", "100",
            "Maximum number of branches that are retrieved for each repository/project to get the build statuses")}
          ${provider.provider == "GitLab"
            ? this.input2html(`config-graphql-maxPipelines-${key}`, "number", "Max pipelines", provider.graphql.maxPipelines, 'required min="2" max="100"', "150", "100",
              "Maximum number of pipeline runs that are retrieved for each repository/project to get the branches and statuses")
            : (this.raw2html("API scope", "Specifies the scope of the GitHub GraphQL API requests that get the branches and statuses") + " &nbsp; "
              + this.check2html(`config-graphql-scope-owner-${key}`, "Owner", provider.graphql.ownerAffiliations.includes("OWNER"))
              + this.check2html(`config-graphql-scope-organization-${key}`, "Organization member", provider.graphql.ownerAffiliations.includes("ORGANIZATION_MEMBER"))
              + this.check2html(`config-graphql-scope-collaborator-${key}`, "Collaborator", provider.graphql.ownerAffiliations.includes("COLLABORATOR")))
          }
        </div>

        <div class="config-provider-updates-div-container">
        <h6 class="card-subtitle mb-1 mt-1 text-body-secondary">Combined dependency updates, additional parameters:
          <a href="https://github.com/javiertuya/dashgit-integration?tab=readme-ov-file#combined-dependabot-updates" target="_blank">[learn more]</a></h6>
        <div class="row">
          ${this.input2html(`config-updates-tokenSecret-${key}`, "text", "Secret Name to store the token", 
            provider.updates.tokenSecret, provider.user == "" ? "disabled" : "", "250", "300",
            "The name of a GitHub secret to store the API access token used to access each repository from the update manager")}
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
  anyGitHubWithoutToken: function (data) {
    for (let provider of data.providers)
      if (provider.provider == "GitHub" && provider.token == "")
        return true;
    return false;
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
    data.enableCombinedUpdates = $("#config-common-enableCombinedUpdates").is(':checked');
    data.updateManagerRepo = $("#config-common-updateManagerRepo").val().trim();
    data.updateManagerToken = $("#config-common-updateManagerToken").val().trim();
    return data;
  },

  html2provider: function (provider, id) {
    provider.enabled = $(`#config-providers-enabled-${id}`).is(':checked');
    provider.user = $(`#config-providers-user-${id}`).val().trim();
    provider.token = $(`#config-providers-token-${id}`).val().trim();
    if (provider.provider == "GitLab")
      provider.url = $(`#config-providers-url-${id}`).val().trim();

    provider.filterIfLabel = $(`#config-providers-filterIfLabel-${id}`).val().trim();
    provider.unassignedAdditionalOwner = $(`#config-providers-unassignedAdditionalOwner-${id}`).val().trim().split(" ");
    provider.dependabotAdditionalOwner = $(`#config-providers-dependabotAdditionalOwner-${id}`).val().trim().split(" ");
    provider.enableNotifications = $(`#config-providers-enableNotifications-${id}`).is(':checked');

    provider.graphql.maxProjects = $(`#config-graphql-maxProjects-${id}`).val().trim();
    provider.graphql.maxBranches = $(`#config-graphql-maxBranches-${id}`).val().trim();

    provider.updates.tokenSecret = $(`#config-updates-tokenSecret-${id}`).val().trim();
    provider.updates.userEmail = $(`#config-updates-userEmail-${id}`).val().trim();

    if (provider.provider == "GitLab") {
      provider.graphql.maxPipelines = $(`#config-graphql-maxPipelines-${id}`).val().trim();
    } else {
      provider.graphql.ownerAffiliations = [];
      if ($(`#config-graphql-scope-owner-${id}`).is(':checked'))
        provider.graphql.ownerAffiliations.push("OWNER");
      if ($(`#config-graphql-scope-organization-${id}`).is(':checked'))
        provider.graphql.ownerAffiliations.push("ORGANIZATION_MEMBER");
      if ($(`#config-graphql-scope-collaborator-${id}`).is(':checked'))
        provider.graphql.ownerAffiliations.push("COLLABORATOR");
      if (provider.graphql.ownerAffiliations.length == 0) //default if none selected
        provider.graphql.ownerAffiliations.push("OWNER");
    }
    return provider;
  },

  // View mannipulation 

  //Sets the appropriate view state for toggles that have dependent inputs that must be hidden or shown
  setToggleDependencies: function() {
    if ($(`#config-common-enableCombinedUpdates`).is(':checked')) {
      $(`#config-common-updateManagerRepo-div-container`).show();
      $(`#config-common-updateManagerRepo`).attr('required', 'required');
      $(`#config-common-updateManagerToken-div-container`).show();
      $(`#config-common-updateManagerToken`).attr('required', 'required');
      $(`.config-provider-updates-div-container`).show();
    } else {
      $(`#config-common-updateManagerRepo-div-container`).hide();
      $(`#config-common-updateManagerRepo`).removeAttr('required');
      $(`#config-common-updateManagerToken-div-container`).hide();
      $(`#config-common-updateManagerToken`).removeAttr('required');
      $(`.config-provider-updates-div-container`).hide();
    }
  },

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
    this.setMoveStatus();
  },
  removeProvider: function (location) {
    $(location).closest(".config-provider-card").remove();
    this.setMoveStatus();
  },
  moveProvider: function (location, where) {
    const element = $(location).closest(".config-provider-card");
    if (where > 0)
      $(element).insertAfter($(element).next());
    else if (where < 0)
      $(element).insertBefore($(element).prev());
    this.setMoveStatus();
  },
  setMoveStatus: function () {
    $(".config-btn-provider-down").prop("disabled", false);
    $(".config-btn-provider-up").prop("disabled", false);
    const items = $("#config-providers-all").find(`.config-provider-panel`);
    if (items.length > 0) {
      $($(items[0]).find(".config-btn-provider-up")[0]).prop("disabled", true);
      $($(items[items.length - 1]).find(".config-btn-provider-down")[0]).prop("disabled", true);
    }
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
      <p>This configuration is stored in the browser local memory. You can set up a password to encrypt the API access tokens.</p>
      <div class="row">
      ${this.inputSimple2html("inputEncryptPassword", "password", "Enter a password to encrypt the API access tokens:", "Required")}
      ${this.button2html("inputEncryptButton", "submit", "Encrypt")}
      </div>
    `));
  },
  renderDecrypt: function (target, encrypted) {
    this.renderHeaderState($(target), encrypted);
    $("#config-form").html(this.encloseInsideCard(`
      <p>API access tokens in this configuration are encrypted. If you forgot your password you need to reset both password and tokens.</p>
      <div class="row">${this.button2html("inputDecryptButton", "submit", "Reset password and access tokens", "btn-danger")}</div>
    `));
  },
  renderImportExport: function (target, data) {
    this.renderHeaderState($(target), data.encrypted);
    $("#config-form").html(`
    <p class="m-2">You can export or import your configuration by copying or saving the json below.</p>
    <label for="configJson">Configuration parameters (json):</label>
    <textarea class="form-control" id="configJson" rows="10">${JSON.stringify(data, null, 2)}</textarea>
    <button type="submit" class="btn btn-primary btn-sm" id="buttonConfigSave">SAVE CONFIGURATION</button>
    `);
  },

  login2html: function () { //this is used from the index to set the decrypt password
    return `
    <form id="config-encrypt" class="form-group row" novalidate>
      <p>Enter the password used to encrypt the access tokens. If you forgot your password, click skip and go to configuration to reset.</p>
      ${this.inputSimple2html("inputPassword", "password", "Enter you password:", "Required")}
      ${this.button2html("inputPasswordButton", "submit", "Submit")}
      ${this.button2html("inputSkipButton", "submit", "Skip")}
    </form>
    `;
  },

  // Display of common form input controls, enclosed in col-auto for fluid placement

  input2html: function (id, type, label, value, validation, labelWidth, valueWidth, info) {
    let labelStyle = labelWidth == "" ? "" : `style="width:${labelWidth}px"`;
    let valueStyle = valueWidth == "" ? "" : `style="width:${valueWidth}px"`;
    return `
    <div class="col-auto" id="${id}-div-container">
      <div class="input-group input-group-sm">
        <span class="input-group-text" id="${id}-label" ${labelStyle}>${label}${this.infoIcon(info)}</span>
        <input id="${id}" type="${type}" value="${value}" ${validation} ${valueStyle}
          class="form-control ${label == 'Username' ? ' fw-bold' : ''}" aria-label="${label}" aria-describedby="${id}-label">
      </div>
    </div>
    `;
  },

  array2html: function (id, type, label, value, validation, labelWidth, valueWidth, info) {
    let valueStr = value == undefined || value.length == 0 ? "" : value.join(" ");
    return this.input2html(id, type, label, valueStr, validation, labelWidth, valueWidth, info);
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

  check2html: function (id, label, checked, info) {
    return `
      <div class="col-auto">
        <div class="form-check">
          <input class="form-check-input" type="checkbox" value="" ${checked ? "checked" : ""} id="${id}">
          <label class="form-check-label" for="${id}">${label}${this.infoIcon(info)}</label>
        </div>
      </div>
    `;
  },
  raw2html: function (label, info) {
    return `
      <div class="col-auto">
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

}

export { configView };
