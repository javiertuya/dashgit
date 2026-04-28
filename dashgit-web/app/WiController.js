import { gitHubApi } from "./git/GitHubApi.js"
import { gitLabApi } from "./git/GitLabApi.js"
import { wiView } from "./WiView.js"
import { Model } from "./core/Model.js"
import { surrogates } from "./core/Surrogates.js"
import { statusesCache } from "./core/StatusesCache.js"
import { statusIndex } from "./core/StatusIndex.js"
import { labelsCache } from "./core/LabelsCache.js"
import { notifCache } from "./core/NotifCache.js"
import { config } from "./core/Config.js"
import { login } from "./login/Login.js"

/**
 * Manages the calls to different APIs (GitHub or GitLab) receiving the transformed provider-independent
 * models that are cached (when needed) and sent to the view. 
 * 
 * Information flow:
 * 
 * - dispatch() is invoked from the view, targets: assigned, created, involved, unassigned and dependabot: 
 *   Executes synchronously.
 *   Constructs a set of promises to call in parallel the REST APIs that return the model of the work items
 *   (rejected promises are separated to raise an alert).
 *   After finish and send to the view executes asyncrhonous calls to update statuses and notification icons (see below)
 * 
 * - Call to updateNotificationsAsync(): After running the promises, asynchronous call to the REST api (via DispatchNotifications)
 *   to update the notifications icon in the view (updateNotifications). Data is cached to be available when the view is refreshed.
 * 
 * - Call to updateStatusesAsync(): After running the promises, asynchronous call to the GraphQL api (via DispatchStatuses)
 *   to update the status icons in the view (updateStatuses). Because these queries are expensive,
 *   the resulting models are cached by the controller so that consecutive calls of the services within the cache lifetime
 *   make use of the cached model.
 * 
 * Particular cases:
 * - Branches view ("statuses" target): Skips all synchronous call using promises and immediately invokes dispatchStatuses().
 *   The display check if this is the current view populates it with the cached model.
 * 
 * - Paginated status updates (GitHub): for every page except the last, the api invokes updateStatusesForPage that
 *   directly displyay the partial model without using the cache. 
 * 
 * Error control:
 * - Error processing: Each error detected logs the error and raises an alert with the message to the view.
 *   Processing continues returning empty or the available data
 * - REST api:
 *   By checking the promises that failed, returns the data in promises that didn't failed
 * - GraphQL api:
 *   - Api call: detected with try/catch, returns an empty object to do not cause more errors
 *   - Query transformations: detected with try/catch
 * - Testing: bad credential, bad url (gitlab), bad GraphQL query
 */

const wiController = {
  reset: function (hard) {
    statusesCache.reset(config.data.providers, hard); //used for reload operations
    if (hard) {
      notifCache.reset();
      statusIndex.reset();
      labelsCache.reset();
    }
    surrogates.reset(config.data.providers);
  },
  updateTarget: function (target, sorting) {
    console.log(`**** Trigger update to target: ${target}`);
    wiView.setLoading(true);
    this.dispatch(target, sorting);
  },

  // Creates the appropriate target promise for each provider and run all promises in parallel
  dispatch: function (target, sorting) {
    // Particular case for branches view, only asynchronous call to update the status cache
    if (target == "statuses") { 
      this.branchViewSortOrder = sorting;
      this.dispatchStatuses(target);
      return;
    }
    // General case for the rest of targets, create the promises to get the work items and then update the notifications and statuses asynchronously
    let promises = [];
    for (let prov of config.data.providers)
      if (prov.enabled) { // if token not set or failed, skip the provider and inform to the user
        if (this.tokenIsValid(prov))
          promises.push(this.getPromise(target, prov, sorting));
        else
          wiView.renderAlert("danger", `The OAuth2 token for provider ${prov.uid} is not set or is invalid. The provider will be hidden in the view.`);
      }
    if (promises.length == 0)
      wiView.renderAlert("warning", "No providers have been configured, please, complete the setup in the Configure tab");
    this.dispatchPromises(target, promises, sorting);
  },
  tokenIsValid: function (provider) {
    if (!provider.oauth) // PAT token is always considered valid for path authentication (even if emtpy)
      return true;
    const token = login.getProviderToken(provider);
    console.log(`Check OAuth token for provider ${provider.uid}: ${token ? token.substring(0, 4) + "..." : "not found"}`);
    return token && token !== "failed"; // OAuth must have a valid value
  },

  getPromise: function (target, provider, sorting) {
    const type = provider.provider.toLowerCase();
    if (type == "github")
      return gitHubApi.getWorkItems(target, provider, sorting, provider.match);
    else if (type == "gitlab")
      return gitLabApi.getWorkItems(target, provider, sorting);
    else
      console.log(`Invalid target: ${target} for provider ${provider}`);
  },

  emptyModel: function(provider, message) {
    let model = new Model().setHeader(provider.provider, provider.uid, provider.user, "");
    model.header.message = message;
    return model;
  },

  dispatchPromises: async function (target, promises, sorting) {
    const currentDate = new Date();
    const responses = await Promise.allSettled(promises);
    console.log("Responses from all promises:");
    console.log(responses);

    //Separates successful requests to render in the view and raises errors, if any
    let models = [];
    for (let response of responses)
      if (response.status == "rejected") {
        console.error("REST api call failed");
        console.error(response);
        this.displayError("REST api call failed. Message: " + response.reason);
      } else
        models.push(response.value);

    if (models.length > 0)
      this.displayWorkItems(target, models, sorting, currentDate);

    // Subsequent async calls (when finish, they will invoque the update* methods)
    this.dispatchNotifications(target);
    this.dispatchStatuses(target);

    // Sync view updates
    wiView.updateStatusVisibility();
    wiView.setLoading(false);
  },
  
  displayWorkItems: function(target, models, sorting, currentDate) {
    wiView.renderWorkItems(target, models, sorting, config.getLastVisitedDate(target));
    if (target == "assigned" || target == "unassigned") // only highlight items for these targets
      config.saveLastVisitedDate(target, currentDate);
  },

  dispatchNotifications: function (target) {
    for (let provider of config.data.providers)
      if (provider.enabled && provider.enableNotifications && this.tokenIsValid(provider)) {
        if (provider.provider.toLowerCase() == "github")
          gitHubApi.updateNotificationsAsync(target, provider);
        else if (provider.provider.toLowerCase() == "gitlab")
          gitLabApi.updateNotificationsAsync(target, provider);
      }
  },
  dispatchStatuses: function (target) {
      for (let provider of config.data.providers)
        if (provider.enabled && this.tokenIsValid(provider)) {
          this.dispatchProviderStatuses(provider);
        }
  },
  dispatchProviderStatuses: function(provider) {
          if (surrogates.hasSurrogate(provider.uid)) {
            console.log(`${provider.uid}: Get statuses from surrogate provider ${surrogates.getSurrogate(provider.uid)} (later)`);
            return;
          }        
          if (statusesCache.hit(provider.uid)) { // use data from cache and avoid call the api
            console.log(`${provider.uid}: Update Statuses to view from CACHE`);
            this.displayProviderStatuses(provider.uid);
          } else if (provider.provider.toLowerCase() == "github") {
            gitHubApi.updateStatusesAsync(provider, statusesCache.updateSince(provider.uid));
          } else if (provider.provider.toLowerCase() == "gitlab") {
            gitLabApi.updateStatusesAsync(provider, statusesCache.updateSince(provider.uid));
          }
  },
  displayProviderStatuses: function(providerId) {
    // Particular case for branches view, full display of this view
    if (wiView.selectActiveTarget() == "statuses") {
      this.displayBranchView(providerId);
      return;
    }
    // General case for the rest of targets, only update the status icons
    let model = statusesCache.getModel(providerId);
    wiView.updateStatuses(model, providerId, labelsCache.data[providerId]); //labels cache only for GitLab, may be undefined
    //if (providerId=="0-github")
    //  wiView.updateStatuses(cache.getModel("1-github"), "1-github", labelsCache.data["1-github"]);
    for (let origin of surrogates.getOrigins(providerId))
      wiView.updateStatuses(statusesCache.getModel(origin), origin, labelsCache.data[origin]);
  },
  displayError: function (message) {
    wiView.renderAlert("danger", message);
  },

  // Full display of the branch view, peroforms a full refresh of the view with the availabe data in the cache
  // (this is called every time a provider has finished the api call to get statuses)
  branchViewSortOrder: "", // to remember the UI selection because this display is asynchronous
  displayBranchView: function (providerId) {
    console.log(`${providerId}: Update branch view from CACHE`);
    let models = [];
    // Constructs the arrays of models required for display, handling particular cases of surrogate providers 
    // and providers where cache has not been initialized yet
    for (let prov of config.data.providers)
      if (prov.enabled) {
        let model = statusesCache.getModel(prov.uid);
        /*if (cache.hasStatusSurrogate(prov.uid))
          model = this.emptyModel(prov, "Branch statuses are shown in the surrogate provider defined in the configuration");
        else*/ if (model == undefined)
          model = this.emptyModel(prov, "Still loading <span class='spinner-border spinner-border-sm text-secondary'></span>");

        // In the case of surrogates, the same statuses model is shared by different providers,
        // The match filters applied to display a provider would affect the display of the next provider.
        // Ensure that in any case each provider has its own model by creating a clone
        model = JSON.parse(JSON.stringify(model)); // NOSONAR pending: migrate to structuredClone
        model.header.uid = prov.uid;
        models.push(model);
      }

    this.displayWorkItems("statuses", models, this.branchViewSortOrder, new Date());
    wiView.updateStatusVisibility(); // required to filter according the repo name
    wiView.setLoading(false);
  },

  //Callbacks, they are invoked from the provider api when *Async calls finish

  updateStatuses: function (providerId, statusesModel, updateSince) {
    console.log(`${providerId}: ASYNC update statuses to view:`);
    console.log(statusesModel);
    statusesCache.setModel(providerId, statusesModel, updateSince); //save to allow a hit in further calls
    if (statusesCache.initialized(providerId))
      this.displayProviderStatuses(providerId)
  },

  updateStatusesForPage: function (providerId, statusesModel) {
    console.log(`${providerId}: ASYNC partial update page statuses to view:`);
    console.log(statusesModel);
    // direct call to display the statuses of the model without setting the cache
    wiView.updateStatusItems(statusesModel, providerId); //labels cache only for GitLab, may be undefined
    for (let origin of surrogates.getOrigins(providerId))
      wiView.updateStatusItems(statusesModel, origin);
  },

  updateStatusesOnError: function (message, providerId) {
    //In case of failure in getting the status schedules a near refresh to try again
    this.displayError(message);
    wiView.updateSpinnerEnd(providerId);
    statusesCache.scheduleNearRefresh(providerId);
  },

  //this is necessary for GitLab because items only store the label name
  updateLabels: function (providerId, labels) {
    labelsCache.setLabels(providerId, labels)
    wiView.updateLabelColors(providerId, labels);
  },

  updateNotifications: function (providerId, notifModel) {
    //console.log(`${providerId}: ASYNC update notifications to view:`);
    //console.log(notifModel);
    //save to cache to allow access from synchronous calls that display workitems
    //(note that github poll interval control must call this method during the poll interval with a null model)
    if (notifModel != undefined && notifModel != null)
      notifCache.saveNotifications(providerId, notifModel);
    let allMentions = 0; //to display the total of notifications of all providers
    let thisMentions = 0; //only of this provier
    for (let prop in notifCache.data) {
      let mentions = this.countProviderMentions(prop);
      allMentions += mentions;
      if (prop == providerId)
        thisMentions = mentions;
    }
    wiView.updateNotifications(providerId, thisMentions, allMentions); //don't pass model as it is alredy in cache
  },
  countProviderMentions: function (prop) {
    // counts only mentions, but across all providers that have notifications in cache
    let mentionCount = 0;
    for (let notifKey in notifCache.data[prop]) {
      let reason = notifCache.data[prop][notifKey];
      if (reason == "mention" || reason == "mentioned" || reason == "directly_addressed")
        mentionCount++; //PENDING: reason values are duplicated in the view, refactor
    }
    return mentionCount;
  },

}

export { wiController };
