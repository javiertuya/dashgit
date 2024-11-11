import { config } from "./Config.js"

/**
 * Additional headers inserted before all providers and at each provider
 */
const wiHeaders = {
  allProvidersHeader2html: function (target) {
    if (target == "dependabot")
      return this.updateHeader2html();
    if (target == "follow-up")
      return this.followUpHeader2html();
    if (target == "unassigned" || target == "involved") // other views do not have option to manage the filters
      return this.filterHeader2html(target, config.session.viewFilter[target]);
    if (target == "statuses") // special compact view only for statuses (branches)
      return this.compactHeader2html(target, config.session.viewFilter[target]);
    return "";
  },

  providerHeader2html: function (target, provider) {
    if (config.data.enableManagerRepo && target == "dependabot")
      return `
      <div>
        <p class="mb-0">The manager repository will access this provider with the token stored in the secret:
        <code>${config.getProviderByUid(provider).updates.tokenSecret}</code></p>
      </div>
      `;
    else if (target == "involved") // placeholder for additional comment to mentions in this target
      return `<div id="wi-providers-target-header-${target}-${provider}"></div>`
    return "";
  },

  updateHeader2html: function () {
    if (!config.data.enableManagerRepo)
      return `
      <div style="padding-left:8px">
        <p class="mb-3 mt-2">
          This view displays all pull requests created by Dependabot.
          From this view, you can combine all updates into a sigle PR per repository and merge them automatically with just a few clicks.
        </p>
        <p class="mb-3 mt-2 text-danger">
          To enable the combined updates feature, you have to check the configuration option <em>Enable a Manager Repository for advanced functions</em>,
          create the manager repository as indicated
          <a href="${config.param.readmeManagerRepo}" target="_blank">[here]</a>
          and follow instructions in this tab.
        </p>
      </div>
      `;
    else
      return `
      <div style="padding-left:8px">
        <p class="mb-3 mt-2">
          To set up your manager repository <code>${config.data.managerRepoName}</code>
          you have to add a workflow file <code>.github/workflows/manage-updates.yml</code>.<br/>
          <a href="#" id="wi-update-workflow-file-show">Click here to get the required content and copy it to the workflow file</a>.<br/>
          Since no token is ever transmitted out of the browser, you also have to create the secrets indicated below in each provider
          and store an API access token in each one.
        </p>
        <div id="wi-update-workflow-file-div" style="display: none">
          <a href="#" id="wi-update-workflow-file-hide">[Hide]</a>
          <textarea class="form-control" id="wi-update-workflow-file-content" rows="10"></textarea>
        </div>

        <p class="mb-3 mt-2">
          Click the checkboxes to select the dependabot updates that you want combine and merge in a single pull request for each repository. 
          The manager repository will do the work. 
          <a href="${config.param.readmeDependencyUpdates}" target="_blank">[learn more]</a>
        </p>

        <div class="col-auto mb-2">
          <button type="button" id="wi-btn-update-select-all" class="btn btn-success btn-sm">Select all</button>
          <button type="button" id="wi-btn-update-unselect-all" class="btn btn-success btn-sm">Unselect all</button>
          <button type="button" id="wi-btn-update-dispatch" class="btn btn-primary btn-sm">Combine and merge the selected dependency updates</button>
          &nbsp;
          <input class="form-check-input" type="checkbox" value="" id="wi-btn-update-dry-run">
          <label class="form-check-label" for="wi-btn-update-dry-run">Dry Run (only create combined PRs, no merge)</label>
        </div>
        <div class="col-auto m-3" id="wi-update-header-confirm"></div>
      </div>
      `;
  },

  followUpHeader2html: function () {
    let html = `
     <div style="padding-left:8px">
       <p class="mb-3 mt-2">
         This view displays all work items that you have flagged for follow up.
         You can flag any work item from any view by clicking the left icon(s)
         and entering the date when you want to see a reminder (in days since today).
         Work items where the reminder date has arrived appear in the <em>Assigned</em> tab even if you are not assignee or reviewer.
       </p>
     </div>
     `;
   if (!config.data.enableManagerRepo)
     html += `
     <div style="padding-left:8px">
       <p class="mb-3 mt-2 text-danger">
         To enable follow-ups, you have to check the configuration option <em>Enable a Manager Repository for advanced functions</em>
         and create the manager repository as indicated
         <a href="${config.param.readmeManagerRepo}" target="_blank">[here]</a>.</div>
       </p>
     </div>
   `;
   return html;
 },

  // Generic view header to perform additional filtering
  filterHeader2html: function (target, viewFilters) {
    return `
    <div style="padding-left:8px">
      <div class="col-auto mb-2">
        <input class="form-check-input wi-view-filter-clickable" type="checkbox" ${viewFilters.authorMe ? "checked" : ""} value="" id="wi-view-filter-${target}-authorMe">
        <label class="form-check-label" for="wi-view-filter-${target}-authorMe">Authored by me</label>
        &nbsp;
        <input class="form-check-input wi-view-filter-clickable" type="checkbox" value="" ${viewFilters.authorOthers ? "checked" : ""} id="wi-view-filter-${target}-authorOthers">
        <label class="form-check-label" for="wi-view-filter-${target}-authorOthers">Authored by others</label>
      </div>
    </div>
    `;
  },

  // View header to select compact view (only for branches)
  compactHeader2html: function (target, viewFilters) {
    return `
    <div style="padding-left:8px">
      <div class="col-auto mb-2">
        <input class="form-check-input wi-view-filter-clickable" type="checkbox" ${viewFilters.compact ? "checked" : ""} value="" id="wi-view-filter-${target}-compact">
        <label class="form-check-label" for="wi-view-filter-${target}-compact">Compact view (any status)</label>
      </div>
    </div>
    `;
  },

}

export { wiHeaders };
