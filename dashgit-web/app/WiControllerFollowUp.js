import { gitStoreApi } from "./GitStoreApi.js"
import { wiView } from "./WiView.js"
import { wiServices } from "./WiServices.js"
import { config } from "./Config.js"

/**
 * Additional work item controller to manage the follow ups
 */

$(document).on('click', '.wi-item-column-clickable', async function (e) {
  // Show the modal, filled with the values obtained from the clicked work items
  $('#wi-follow-up-modal').modal('show');
  const provider = config.getProviderByUid($(this).closest("table").attr("provider"));
  let params = {
    server: provider.url,
    repo: $(this).closest(".wi-status-class-any").attr("itemrepo"),
    type: $(this).closest(".wi-status-class-any").attr("itemtype"),
    iid: $(this).closest(".wi-status-class-any").attr("itemiid"),
    title: $(this).closest(".wi-status-class-any").find(".wi-item-title").first().text(),
  }
  // This follow up can be existing or new, updates the modal state accordingly
  wiControllerFollowUp.edit(params);
});
$(document).on('click', '#wi-follow-up-btn-save', async function (e) {
  wiView.followUpProgress();
  await wiControllerFollowUp.save(wiView.followUpGetValues(), false);
});
$(document).on('click', '#wi-follow-up-btn-delete', async function (e) {
  wiView.followUpProgress();
  await wiControllerFollowUp.save(wiView.followUpGetValues(), true);
});
$(".modal").on("hidden.bs.modal", function () { // clear modal content on close
  wiView.followUpClear();
});

// Read the follow ups from server and determine if the follow up in the ui is new or already exists to update the view acordingly
const wiControllerFollowUp = {
  displayError: function (error) {
    console.log(error)
    wiView.followUpEnd("", error.toString());
  },
  edit: async function (params) {
    console.log("Edit or create follow up:")
    console.log(params);
    let response = await this.read(params);
    let followUps = response.content.followUp;
    let followUpIndex = this.match(followUps, params); // returns position to update or delete
    let followUp = followUpIndex < 0 ? undefined : followUps[followUpIndex];
    if (followUp != undefined) { // existing item, mark as existing and updates title (the stored title may be obsolete)
      followUp.title = params.title;
      followUp.server = params.server; // server is not stored, uses the ui value
      followUp["exists"] = true;
      followUp["days"] = wiServices.daysToDate(followUp.remind)
    } else { // was not found, uses the data from the ui and set defaults for a new follow up
      followUp = params;
      followUp["exists"] = false;
      followUp["days"] = "5";
    }
    wiView.followUpSetValues(followUp);
  },

  // Updates the follow ups to the server (change existing, add new, or delete) 
  save: async function (params, isDelete) {
    const fileName = config.getProviderFollowUpFileName(params.server)
    console.log("Save follow up:")
    console.log(params);
    // Read from server and determine if we must update or add the follow up
    let response = await this.read(params);
    let followUps = response.content.followUp;
    let sha = response.sha; //needed to save
    let followUpIndex = this.match(followUps, params); // returns position to update or delete
    let followUp = followUpIndex < 0 ? undefined : followUps[followUpIndex];
    if (followUp != undefined) { // existing item, update values that could have be changed or delete
      if (isDelete) {
        followUps.splice(followUpIndex, 1);
      } else {
        followUp.title = params.title;
        followUp.remind = wiServices.dateAfterDays(params.days);
      }
    } else { // was not found, adds to the end a new follow up
      followUp = {
        repo: params.repo, type: params.type, iid: params.iid, title: params.title,
        remind: wiServices.dateAfterDays(params.days)
      }
      followUps.push(followUp)
    }
    console.log("Saved follow ups:")
    console.log(followUps);
    const message = `${isDelete ? "Delete" : "Save"} follow up ${followUp.type} ${followUp.iid} - ${followUp.title}`;
    await this.update(fileName, sha, { followUp: followUps }, message, "Done: " + message);
  },
  match: function (stored, ui) {
    for (let i = 0; i < stored.length; i++)
      if (ui.repo == stored[i].repo && ui.type == stored[i].type && ui.iid == stored[i].iid)
        return i;
    return -1;
  },

  // Gets the json file with the follow ups of a provider, 
  // if not found creates a dedicated branch and a default file with an empty object
  read: async function (params) {
    const fileName = config.getProviderFollowUpFileName(params.server);
    const ownerRepo = config.data.updateManagerRepo.split("/");
    try {
      console.log(`Read follow up json file: ${fileName}`)
      const response = await gitStoreApi.getContent(config.data.updateManagerToken, ownerRepo[0], ownerRepo[1], config.param.followUpBranch, fileName);
      return { sha: response.data.sha, content: JSON.parse(atob(response.data.content)) };
    } catch (error) {
      console.log(`Can't get follow up json file, returned status ${error.status}`);
      if (error.status == 404) { // not found, branch+file or file only are missing
        console.log(`Branch or json file was not initialized. Try to create branch`);
        try {
          // create the branch to store the follow up json files, ignore failure if already exists
          await gitStoreApi.createBranch(config.data.updateManagerToken, ownerRepo[0], ownerRepo[1], config.param.followUpBranch);
        } catch (error2) {
          console.log(`Can't create branch, returned status ${error.status}`);
          if (error2.status == 422) {
            console.log(`It seems that branch already exists`);
          } else {
            this.displayError(error);
            throw error2
          }
        }
        // if here, there is a branch, but no file, create default file and return default value
        console.log(`Creating default empty follow up json file`);
        await this.update(fileName, "", gitStoreApi.emptyFollowUpContent, `Created follow up storage for ${params.server}`, "");
        return { sha: "", content: gitStoreApi.emptyFollowUpContent };
      } else {
        this.displayError(error);
        throw error;
      }
    }
  },

  update: async function (fileName, sha, content, commitMessage, uiMessage) {
    const ownerRepo = config.data.updateManagerRepo.split("/");
    // Updating is tricky, as works well when dev tools are open and cache disabled, but with dev tools closed and cache enabled
    // returns 409 error with some frequency. This has been reported elsewhere, eg. https://github.com/mavoweb/mavo/issues/215
    // Method gitStoreApi.setContent now removes the cache in all cases
    try {
      let response = await gitStoreApi.setContent(config.data.updateManagerToken, ownerRepo[0], ownerRepo[1],
        config.param.followUpBranch, fileName,
        sha, btoa(JSON.stringify(content, null, 2)), commitMessage);
        console.log(response)
        console.log(`SHA: ${response.data.content.sha}`)
        wiView.followUpEnd(uiMessage, "");
    } catch (error) {
      if (error.status == 409) {
        console.error(error); // show this because not calling displayError (that writes to console)
        this.displayError("Server responded with 409 Conflict, try later or disable the browser cache and retry");
      } else {
        this.displayError(error.toString());
      }
    }
  },

}

export { wiControllerFollowUp };
