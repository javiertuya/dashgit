import { gitHubApi } from "./GitHubApi.js"
import { gitLabApi } from "./GitLabApi.js"
import { wiView } from "./WiView.js"
import { wiServices } from "./WiServices.js"
import { cache } from "./Cache.js"
import { config } from "./Config.js"

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
 * - Call to updateNotificationsAsync(): After running the promises, asynchronous call to the REST api 
 *   to update the notifications icon in the view. Data is cached to be available when the view is refreshed.
 * 
 * - Call to updateStatusesAsync(): After running the promises, asynchronous call to the GraphQL api 
 *   to update the status icons in the view. Because these queries are expensive,
 *   the resulting models are cached by the controller so that consecutive calls of the services within the cache lifetime
 *   make use of the cached model.
 * 
 * - Invocation of dispatch() from the view, target statuses: Uses the same data than the obtained to update the status icons.
 *   If status cache has not expired returns it immediately.
 *   If expired, calls synchronously the updateStatusesAsync() on the api and caches the result.
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


// Response to events from the UI (dependabot tab)
$(document).on('change', '.wi-update-check', function (e) {
  wiView.confirmUpdateClear();
});
$(document).on('click', '#wi-btn-update-select-all', function (e) { //only visible for safety
  $(".accordion-item .show .wi-update-check").prop("checked", true);
  wiView.confirmUpdateClear();
});
$(document).on('click', '#wi-btn-update-unselect-all', function (e) {
  $(`.wi-update-check`).prop("checked", false);
  wiView.confirmUpdateClear();
});
$(document).on('click', '#wi-btn-update-dispatch', function (e) {
  wiView.confirmUpdate();
});
$(document).on('click', '#wi-btn-update-dispatch-confirm', async function (e) {
  wiView.confirmUpdateProgress();
  wiController.sendCombinedUpdates($(`#wi-btn-update-dry-run`).is(':checked'));
});
$(document).on('click', '#wi-update-workflow-file-show', async function (e) {
  wiController.fillUpdateWorkflowTemplate("wi-update-workflow-file-content");
  $("#wi-update-workflow-file-div").show();
});
$(document).on('click', '#wi-update-workflow-file-hide', async function (e) {
  $("#wi-update-workflow-file-div").hide();
});

const wiController = {
  reset: function (hard) {
    cache.reset(hard); //used for reload operations
  },
  updateTarget: function (target) {
    console.log(`**** Trigger update to target: ${target}`);
    wiView.setLoading(true);
    this.dispatch(target);
  },

  // Creates the appropriate target promise for each provider and run all promises in parallel
  dispatch: function (target) {
    let promises = [];
    for (let prov of config.data.providers)
      if (prov.enabled)
        promises.push(this.getPromise(target, prov));
    if (promises.length == 0)
      wiView.renderAlert("warning", "No providers have been configured, please, complete the setup in the Configure tab");
    this.dispatchPromises(target, promises);
  },

  getPromise: function (target, provider) {
    const type = provider.provider.toLowerCase();
    if (target == "statuses" && (type == "github" || type == "gitlab"))
      return this.getStatusesOrCached(provider, type); //special handling
    else if (type == "github")
      return gitHubApi.getWorkItems(target, provider);
    else if (type == "gitlab")
      return gitLabApi.getWorkItems(target, provider);
    else
      console.log(`Invalid target: ${target} for provider ${provider}`);
  },

  //Gets a model of all projects, branches and pull requests, including the status
  //Used to fill the target "statuses". Uses cached data if not invalidated
  getStatusesOrCached: async function (provider, type) {
    await cache.ensureCacheIsInitialized(provider.uid);

    if (cache.hit(provider.uid)) { // use data from cache
      console.log(`${provider.uid}: Get Statuses from CACHE`);
      return cache.getModel(provider.uid);
    }
    //Gets the whole model or part of it (depending on the cache state)
    let updateSince = cache.updateSince(provider.uid);

    console.log(`${provider.uid}: Get Statuses from the GraphQL api. ${updateSince == "" ? "REFRESH" : "Since " + updateSince}`);
    let model;
    if (type == "github")
      model = await gitHubApi.getStatusesRequest(provider, updateSince);
    else if (type == "gitlab")
      model = await gitLabApi.getStatusesRequest(provider, updateSince);

    //save refreshed or updated model to allow a hit in further calls
    cache.setModel(provider.uid, model, updateSince);
    return cache.getModel(provider.uid);
  },

  dispatchPromises: async function (target, promises) {
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
      wiView.renderWorkItems(target, models);

    // Subsequent async calls (when finish, they will invoque the update* methods)
    this.dispatchNotifications(target);
    this.dispatchStatuses(target);

    // Sync view updates
    wiView.updateStatusVisibility();
    wiView.setLoading(false);
  },
  dispatchNotifications: function (target) {
    for (let provider of config.data.providers)
      if (provider.enabled && provider.enableNotifications) {
        if (provider.provider.toLowerCase() == "github")
          gitHubApi.updateNotificationsAsync(target, provider);
        else if (provider.provider.toLowerCase() == "gitlab")
          gitLabApi.updateNotificationsAsync(target, provider);
      }
  },
  dispatchStatuses: function (target) {
    if (target != "statuses") //this target already does the reading of statuses if necessary
      for (let provider of config.data.providers)
        if (provider.enabled) {
          if (cache.hit(provider.uid)) { // use data from cache and avoid call the api
            console.log(`${provider.uid}: Update Statuses to view from CACHE`);
            let model = cache.getModel(provider.uid);
            wiView.updateStatuses(model, cache.labelsCache[provider.uid]); //labels cache only for GitLab, may be undefined
          } else if (provider.provider.toLowerCase() == "github") {
            gitHubApi.updateStatusesAsync(provider, cache.updateSince(provider.uid));
          } else if (provider.provider.toLowerCase() == "gitlab") {
            gitLabApi.updateStatusesAsync(provider, cache.updateSince(provider.uid));
          }
        }
  },
  displayError: function (message) {
    wiView.renderAlert("danger", message);
  },

  //Callbacks, they are invoked from the provider api when *Async calls finish

  updateStatuses: function (providerId, statusesModel, updateSince) {
    console.log(`${providerId}: ASYNC update statuses to view:`);
    console.log(statusesModel);
    cache.setModel(providerId, statusesModel, updateSince); //save to allow a hit in further calls
    if (cache.initialized(providerId))
      wiView.updateStatuses(statusesModel, cache.labelsCache[providerId]);
  },

  updateStatusesOnError: function (message, providerId) {
    //In case of failure in getting the status schedules a near refresh to try again
    this.displayError(message);
    wiView.updateSpinnerEnd(providerId);
    cache.scheduleNearRefresh(providerId);
  },

  //this is necessary for GitLab because items only store the label name
  updateLabels: function (providerId, labels) {
    cache.setLabels(providerId, labels)
    wiView.updateLabelColors(providerId, labels);
  },

  updateNotifications: function (providerId, notifModel) {
    //console.log(`${providerId}: ASYNC update notifications to view:`);
    //console.log(notifModel);
    //save to cache to allow access from synchronous calls that display workitems
    cache.saveNotifications(providerId, notifModel);
    let notifCount = 0; //to display the total of notifications of all providers
    for (let prop in cache.notifCache)
      notifCount += Object.keys(cache.notifCache[prop]).length;
    wiView.updateNotifications(providerId, notifCount); //don't pass model as it is alredy in cache
  },

  // To perform combined dependency updates, the dedicated update manager repository 
  // has a workflow that runs the updates. This methods gets the appropriate content
  // according to the providers configuration
  fillUpdateWorkflowTemplate: function() {
    $("#wi-update-workflow-file-content").load("assets/manage-updates-template.yml", function () {
      let content =  $("#wi-update-workflow-file-content").val();
      let secrets = [];
      // fills the names of secrets that must be known to the updater
      for (let provider of config.data.providers)
        if (provider.updates.tokenSecret != "") { //exact indentation to mach the lines above this, no repeated
          let newSecret = "          " + provider.updates.tokenSecret + ": ${{ secrets." + provider.updates.tokenSecret + "}}";
          if (!secrets.includes(newSecret))
            secrets.push(newSecret);
        }
      content = content.replace("### PROVIDER-SECRETS-HERE ###", secrets.join("\n"));
      $("#wi-update-workflow-file-content").val(content);
    });
  },
  // To perform combined dependency updates, a json file with the updates selected is sent
  // to the dedicated update manager repository in a new branch for this set of combined updates.
  // The name of the file is the version number taken from the UI so that the update manager
  // can get this name and select the appropriate version of the updater (written in java)
  // The GitHub Actions configured in the update manager will perform all required tasks.
  // Note that the workflow file must execute on push when changes are made in the path .dashgit/manage-update/**
  // If it would set on push to branches, an additonal execution would be triggered for the branch creation
  sendCombinedUpdates: async function(dryRun) {
    const itemsToUpdate = wiView.getUpdateCheckItems();
    const currentDate = new Date();
    const branch = "dashgit/manage/update-" + currentDate.toISOString().replaceAll("-", "").replaceAll("T", "-").replaceAll(":", "").replaceAll(".", "-");
    const message = `DashGit combined updates for ${itemsToUpdate.length} dependencies at ${currentDate.toString()}`;
    const path = `.dashgit/manage-update/${config.appVersion}`;
    const ownerRepo = config.data.updateManagerRepo.split("/");
    const model = wiServices.getUpdatesModel(itemsToUpdate, config.data.updateManagerRepo, branch, dryRun);
    const content = JSON.stringify(model, null, 2);
    console.log("Push combined updates, model: " + JSON.stringify(model, null, 2));
    gitHubApi.createContent(config.data.updateManagerToken, ownerRepo[0], ownerRepo[1], branch, path, btoa(content), message)
    .then(async function(responseUrl) {
      wiView.confirmUpdateEnd(`https://github.com/${config.data.updateManagerRepo}/actions`, responseUrl);
    }).catch(async function(error) {
      wiView.confirmUpdateClear();
      wiView.renderAlert("danger", error);
    });
  },

}

export { wiController };
