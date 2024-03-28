import { gitStoreApi } from "./GitStoreApi.js"
import { wiView } from "./WiView.js"
import { config } from "./Config.js"

/**
 * Additional work item controller to manage the combined updates 
 */

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
  wiControllerUpdate.sendCombinedUpdates($(`#wi-btn-update-dry-run`).is(':checked'));
});
$(document).on('click', '#wi-update-workflow-file-show', async function (e) {
  wiControllerUpdate.fillWorkflowTemplate("wi-update-workflow-file-content");
  $("#wi-update-workflow-file-div").show();
});
$(document).on('click', '#wi-update-workflow-file-hide', async function (e) {
  $("#wi-update-workflow-file-div").hide();
});

const wiControllerUpdate = {
  // To perform combined dependency updates, the dedicated update manager repository 
  // has a workflow that runs the updates. This methods gets the appropriate content
  // according to the providers configuration
  fillWorkflowTemplate: function() {
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
    const model = this.getModel(itemsToUpdate, config.data.updateManagerRepo, branch, dryRun);
    const content = JSON.stringify(model, null, 2);
    console.log("Push combined updates, model: " + JSON.stringify(model, null, 2));
    // Creates the dedicated branch and json file in the update repository manager,
    // this will trigger the GitHub Actions that perform the required tasks
    gitStoreApi.createBranchAndContent(config.data.updateManagerToken, ownerRepo[0], ownerRepo[1], branch, path, btoa(content), message)
    .then(async function(responseUrl) {
      wiView.confirmUpdateEnd(`https://github.com/${config.data.updateManagerRepo}/actions`, responseUrl);
    }).catch(async function(error) {
      wiView.confirmUpdateClear();
      wiView.renderAlert("danger", error);
    });
  },

  // Creates the model required for combined updates:
  // takes the list of selected items and produces a hierarchical structure by providers and repositories.
  // Keep in sync with the model creation from javascript in dashgit-updater: UpdaterModel.js
  getModel: function (items, updateManagerRepo, updateManagerBranch, dryRun) {
    // items [{ provider, repo, iid}]
    console.log("Generate update model");
    console.log(items);
    let updates = {};
    for (let item of items) {
      if (updates[item.provider] == undefined) {
        let provider = config.getProviderByUid(item.provider);
        updates[item.provider] = {
          providerType: provider.provider,
          urlValue: provider.url,
          userValue: provider.user,
          tokenSecret: provider.updates.tokenSecret,
          userEmail: provider.updates.userEmail,
          repositories: {}
        };
      }
      if (updates[item.provider]["repositories"][item.repo] == undefined)
        updates[item.provider]["repositories"][item.repo] = [];
      updates[item.provider]["repositories"][item.repo].push(item.iid);
    }
    return { updates: { updateManagerRepo: updateManagerRepo, updateManagerBranch: updateManagerBranch, dryRun: dryRun, providers: updates } };
  },

}

export { wiControllerUpdate };
