import { config } from "./Config.js"
import { wiHeaders } from "./WiViewHeaders.js"
import { wiRender } from "./WiViewRender.js"
import { wiServices } from "./WiServices.js"

/**
 * Generates the html content for the work item view
 */
const wiView = {
  //only api-related target. Note that statuses is named Branches in the UI tab
  allTargets: ["assigned", "involved", "created", "unassigned", "follow-up", "dependabot", "statuses"],

  setLoading(value) {
    setTimeout(function () {
      $("#loadingIcon").css('visibility', value ? 'visible' : 'hidden');
    }, 0)
  },

  renderAlert: function (type, message) {
    let html = `
      <div class="alert alert-${type} alert-dismissible" role="alert">
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    $("#alert-div").append(html);
  },
  resetAlerts: function () {
    $("#alert-div").html("");
  },

  reset() {
    for (let target of this.allTargets)
      $(`#${target}`).html("");
  },

  // Work items appear in different providers and targets (tabs).
  // This gets an unique id that prepends the target and provider id to the work item id
  getId: function (target, providerId, uid) {
    return `${this.getIdPrefix(target, providerId)}${uid}`;
  },
  getIdPrefix: function (target, providerId) {
    return `${target}_${providerId}_`;
  },
  getPanelId: function (target, providerId) {
    return `wi-items-${this.getId(target, providerId, "all")}`;
  },

  selectActiveTarget: function () {
    return $(".tab-pane.active").attr("id");
  },

  renderWorkItems: function (target, models, highlightSince) {
    let sorting = $("#inputSort").val();
    let grouping = $("#checkGroup").is(':checked');
    // initial values of view filters (not all views allow selecting these filters from the ui)
    if (config.session.viewFilter[target] == undefined)
      config.session.viewFilter[target] = { authorMe: target != "unassigned", authorOthers: true };

    let html = `<div class="accordion" id="wi-providers-panel">`;
    html += wiHeaders.allProvidersHeader2html(target);

    for (let mod of models) {
      let header = mod.header;
      let items = mod.items;
      items = wiServices.merge(items);
      items = wiServices.sort(sorting, items);
      items = wiServices.filter(target, mod.header.uid, mod.header.user, items);
      items = wiServices.group(grouping, items);
      html += this.model2html(target, header, items, grouping, sorting, highlightSince);
    }
    html += `</div>`;
    $(`#${target}`).html(html);
    for (let mod of models) {
      this.updateBadges(target, mod.header.uid, true);
      $(`#${this.getPanelId(target, mod.header.uid)} .wi-status-icon`).tooltip({ delay: 200 });
      $(`#${this.getPanelId(target, mod.header.uid)} .wi-action-badge`).tooltip({ delay: 200 });
    }
  },

  model2html: function (target, header, items, grouping, sorting, highlightSince) {
    let provider = header.uid;
    let html = `
    <div class="accordion-item">
      <h4 class="accordion-header">
        <button id="wi-providers-panelbutton-${target}-${provider}" 
            wi-providers-panelbutton-provider="${provider}"
            class="${this.statePanelButton(target, provider)}"
            type="button" data-bs-toggle="collapse" 
            data-bs-target="#wi-providers-panel-${target}-${provider}" 
            aria-expanded="${this.statePanelAria(target, provider)}" 
            aria-controls="wi-providers-panel-${target}-${provider}">
          <p class="m-0">
            <span class='h4'>${wiRender.provider2html(header.provider)} ${header.provider} - ${header.user}</span>
            <span class='h6'>${header.url != "" ? " &nbsp; at " + header.url.replace("https://", "") : ""}</span>
            <span id="wi-badges-${this.getId(target, header.uid, "all")}" style='position:relative; bottom:4px;'></span>
            <span id="wi-spinner-${this.getId(target, header.uid, "all")}" style='position:relative; bottom:2px;'> ${target != "statuses" ? wiRender.spinnerIcon : ""}</span>
          </p>
        </button>
      </h4>
      <div id="wi-providers-panel-${target}-${provider}" 
          class="${this.statePanelBody(target, provider)}">
        <div class="accordion-body">
`;
    // adds the header (if applicable)
    html += wiHeaders.providerHeader2html(target, provider);

    // adds every row
    html += `<table id="wi-items-${this.getId(target, header.uid, "all")}" provider="${provider}" class='table table-sm table-borderless m-0'>`;
    html += this.rowsmodel2html(target, header, items, grouping, sorting, highlightSince);
    html += `</table>`;
    html += `</div></div></div>`;
    return html;
  },

  rowsmodel2html: function (target, header, items, grouping, sorting, highlightSince) {
    let html = "";
    if (items.length == 0)
      html += `<tr><td>No work items in this view. ${header.message}</td></tr>`;
    else {
      html += header.message;
      for (let i = 0; i < items.length; i++) {
        let item = items[i];
        //set group if item group value is different from previous
        if ((i == 0 || this.groupValue(item, grouping, sorting) != this.groupValue(items[i - 1], grouping, sorting)))
          html += `<tr class="wi-status-class-header fs-5"><td colspan=4>
            ${grouping
              ? wiRender.repourl2html(item.repo_url, item.repo_name)
              : "<span class='text-secondary fw-bold'>" + this.groupValue(item, grouping, sorting) + "</span>"}
          <td><tr>`;
        html += this.rowmodel2html(target, header, item, grouping, highlightSince);
      }
    }
    return html;
  },
  rowmodel2html: function (target, header, item, grouping, highlightSince) {
    return `
    <tr id="wi-item-${this.getId(target, header.uid, item.uid)}" 
        itemrepo="${item.repo_name}"
        itemtype="${item.type}"
        itemiid="${item.iid}"
        class="wi-status-class-any wi-status-class-${wiRender.status2class(item.type, header.uid, item.uid)}">
      <td style="width:24px;" class="wi-item-column-clickable">${wiRender.status2html(item.type, header.uid, item.uid, this.getId(target, header.uid, item.uid))}</td>
      <td style="width:24px;" class="wi-item-column-clickable">${wiRender.type2html(item.type, new Date(item.updated_at) > highlightSince)}</td>
      <td style="width:24px; color:${wiRender.gitColor};" 
        class="wi-item-column-clickable wi-notifications-${this.getId(target, header.uid, 'all')}" 
        id="wi-notifications-${this.getId(target, header.uid, item.uid)}">
        ${wiRender.notifications2html(header.uid, item.uid)}
      </td>
      <td>
        ${wiRender.updateCheck2html(target, header.uid, item.repo_name, item.iid)}
        ${wiRender.actions2html(item.actions)}
        ${grouping ? "" : wiRender.repourl2html(item.repo_url, item.repo_name)}
        ${wiRender.branch2html(item.branch_url, item.branch_name)}
        <span class='wi-item-title ${item.type == "branch" ? "fw-normal" : "fw-bold"}'>${wiRender.url2html(item.url, item.title)}</span>
        <span class='text-secondary'>${item.iidstr}</span>
        <span class='text-primary'>${item.assignees}</span>
        <span class='text-secondary'>${wiServices.intervalToString(item.created_at, item.updated_at)}</span>
        ${wiRender.labels2html(item.repo_name, item.labels)}
      </td>
    </tr>
    `;
  },

  // Other low level content

  groupValue: function (item, grouping, sorting) {
    //grouping=true is to group by project name. If false, groups by date groups (today, week, month, older)
    let value = "";
    if (grouping)
      value = item.repo_name;
    else if (sorting.endsWith("updated_at"))
      value = wiServices.intervalPeriodAsString(new Date(item.updated_at), new Date()).toString();
    else if (sorting.endsWith("created_at"))
      value = wiServices.intervalPeriodAsString(new Date(item.created_at), new Date()).toString();
    return value;
  },

  //Callbacks called from asynchronous calls after the work items are rendered

  updateStatuses: function (statusesModel, providerId, allLabels) {
    for (let item of statusesModel.items) {
      if (item.type == "pr" || item.type == "branch")
        this.upateStatusIcon(item.status, providerId, item.uid);
      this.upateStatusClass(item.status, providerId, item.uid)
    }
    this.updateSpinnerEnd(providerId);
    this.updateBadges(providerId, false);
    this.updateStatusVisibility();
    $(`#${this.getPanelId(this.selectActiveTarget(), providerId)} .wi-status-icon`).tooltip({ delay: 200 });
  },
  upateStatusIcon: function (status, providerId, itemId) {
    const target = this.selectActiveTarget();
    const id = this.getId(target, providerId, itemId);
    const statusIcon = wiRender.statusIcon(status, false);
    let selector = $("#wi-status-" + id);
    if (selector.length) {
      selector.html(statusIcon);
    }
  },
  upateStatusClass: function (status, providerId, itemId) {
    const target = this.selectActiveTarget();
    const id = this.getId(target, providerId, itemId);
    let selector = $("#wi-item-" + id);
    if (selector.length) {
      selector.attr("class", "wi-status-class-any wi-status-class-" + status);
    }
  },
  updateStatusVisibility: function () {
    const status = $("#inputStatus").val();
    // First filter based on the status selected, global change without any iteration
    // Selected value encodes the statuses to show in binary, left bit is for issues.
    // Hide/show all items that belong to the appropriate class to match the selected status
    const classes = ["issue", "success", "failure", "pending", "notavailable", "undefined"];
    for (let i = 0; i < status.length; i++)
      this.showIf(".wi-status-class-" + classes[i], status.substring(i, i + 1) == "1")

    // Additional filters that require iterate over the work items
    for (let target of this.allTargets)
      for (let provider of config.data.providers)
        this.updateOtherFiltersVisibility(`wi-items-${target}_${provider.uid}_all`);
  },
  updateOtherFiltersVisibility: function (id) {
    // As the dom does not have a physical hierarchy, iterates from the end
    // to allow filter headers that do not contain any visible rows
    let target = $("#" + id).find("tbody tr");
    let repoFilter = $("#inputFilterRepo").val().trim().toLowerCase();
    let visibleCount = 0;
    for (let i = target.length - 1; i >= 0; i--) {
      let row = target[i];
      if (row.attributes.class != undefined) {
        visibleCount = this.updateRowVisibility(row, visibleCount, repoFilter);
      }
    }
  },
  updateRowVisibility: function(row, visibleCount, repoFilter) {
      // When a row is not a grouping (has a any status class) apply other filters
      if ($(row).hasClass("wi-status-class-any")) { //an item
        // Filter by repo name
        if (repoFilter != "" && !$(row).attr("itemrepo").trim().toLowerCase().includes(repoFilter))
            $(row).hide();

        // if visible, increment count in its group, to be used when processing a group header
        const style = $(row).attr("style") ?? "";
        if (!style.includes("display: none")) //is displayed
          visibleCount++;

      // When a row represents a grouping (class wi-status-class-header),
      // if all inner rows are hidden (display:none), it should be hidden too
      } else if ($(row).hasClass("wi-status-class-header")) { //a header, check visibleCount
        this.showIf(row, visibleCount != 0);
        visibleCount = 0; //begin next header
      }
      return visibleCount;
  },
  updateNotifications(providerId, thisMentions, allMentions) {
    const target = this.selectActiveTarget();
    let panel = `#${this.getPanelId(target, providerId)}`;
    let viewItems = $(panel).find(`.wi-notifications-${this.getId(target, providerId, "all")}`);
    let displayedMentions = 0;
    for (let viewItem of viewItems) {
      let viewId = $(viewItem).attr("id");
      let itemId = viewId.replace(`wi-notifications-${this.getIdPrefix(target, providerId)}`, "");
      let html = wiRender.notifications2html(providerId, itemId);
      $(viewItem).html(html);
      if (html.includes(wiRender.mentionIconClass)) // only increment if html displays a mention
        displayedMentions++;
    }
    $(`${panel} .wi-notification-icon`).tooltip({ delay: 200 });
    //In addition to the notifications of each item, updates the display of total notifications that are mentions
    //Note that although this display is shown in the involved tab, it is updated when displaying any other tab
    let notifHtml = allMentions == 0 ? "" : ` <i class="${wiRender.mentionIconClass}"></i><strong>${allMentions}</strong>`;
    $(`#wi-notifications-tab-badge`).html(notifHtml);
    //If mentions that are displayed is lower than mentions in this provider, displays a message (only if displaying involved tab)
    //PENDING: in a next iteration, include mentions of closed items in this view (need to refactor the merge of work items)
    if (target == "involved" && thisMentions > displayedMentions)
      $(`#wi-providers-target-header-${target}-${providerId}`)
       .html(`<div class="mb-0" style="color:${wiRender.gitColor}"><em>You have ${thisMentions-displayedMentions} mention(s) in closed work items not shown in this view.</em></div>`)
  },
  updateSpinnerEnd: function (provider) {
    const target = this.selectActiveTarget();
    // hide spinner at the provider header
    let spinnerAll = `#wi-spinner-${this.getId(target, provider, "all")}`;
    $(spinnerAll).hide();
    // convert spinner at each row into not available (it will be updted later if status is known)
    let panel = `#${this.getPanelId(target, provider)}`;
    let spinners = $(panel).find(`.${wiRender.spinnerClass}`);
    for (let spinner of spinners)
      $(spinner).parent().html(wiRender.unknownIcon);
  },
  updateBadges: function (provider, inProgress) {
    const target = this.selectActiveTarget();
    let panel = `wi-items-${this.getId(target, provider, "all")}`;
    let html = "";
    html = wiRender.headerbadge2html("Blue", $("#" + panel + " tbody tr.wi-status-class-any").length, "")
      + wiRender.headerbadge2html("DodgerBlue", $("#" + panel + " tbody tr.wi-status-class-issue").length, "issues")
      + wiRender.headerbadge2html("MediumSeaGreen", $("#" + panel + " tbody tr.wi-status-class-success").length, "success")
      + wiRender.headerbadge2html("Red", $("#" + panel + " tbody tr.wi-status-class-failure").length, "failed")
      + wiRender.headerbadge2html("Orange", $("#" + panel + " tbody tr.wi-status-class-pending").length, "pending")
    let header = `wi-badges-${this.getId(target, provider, "all")}`
    $("#" + header).html(" &nbsp; " + html);
  },
  updateLabelColors: function (providerId, allLabels) {
    if (allLabels == undefined) //refresh colors is only needed in GitLab
      return;
    const target = this.selectActiveTarget();
    const items = $(`#${this.getPanelId(target, providerId)}`).find(".badge-color-undefined");
    for (let item of items) {
      let key = $(item).attr("data-colorkey");
      if (allLabels[key] != undefined) {
        const color = allLabels[key].color.replace("#", "");
        $(item).attr("style", wiRender.getLabelStyle($(item).text(), color));
        $(item).removeClass("badge-color-undefined"); //do not check this again
      }
    }
  },

  showIf: function (selector, condition) {
    if (condition)
      $(selector).show();
    else
      $(selector).hide();
  },

  // Content of UI related with dependabot updates

  confirmUpdateClear: function () {
    $("#wi-update-header-confirm").html("");
  },
  confirmUpdate: function () {
    if (this.getUpdateCheckItems().length == 0)
      return;
    $("#wi-update-header-confirm").html(`
        <p class="text-danger">You are going to update ${this.getUpdateCheckItems().length} dependencies, please, press CONFIRM to start the update process<p>
        <button type="button" id="wi-btn-update-dispatch-confirm" class="btn btn-danger btn-sm">
        CONFIRM (takes a few seconds)
        <span id="wi-update-header-confirm-spinner"></span>
        </button>
      `);
  },
  confirmUpdateProgress: function () {
    //setTimeout(function() {
    $("#wi-update-header-confirm-spinner").html(`<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>`);
    //}, 0);
  },
  confirmUpdateEnd: function (logUrl, updateUrl) {
    $("#wi-update-header-confirm").html(`
        <p class="text-success"><strong>${this.getUpdateCheckItems().length} dependencies are being updated... &nbsp;
        <a href="${logUrl}" target="_blank">[See the logs at GitHub Actions]</a> &nbsp; 
        </strong><p>
      `);
    $("#tab-content").find(`.wi-update-check:checkbox:checked`).attr("disabled", true);
  },
  getUpdateCheckItems: function () { // all selected, but not disabled
    const items = $("#tab-content").find(`.wi-update-check:checkbox:checked`);
    let updates = [];
    for (let item of items)
      if (!$(item).attr("disabled")) //exclude previous updates (that have been disabled)
        updates.push({ provider: $(item).attr("provider"), repo: $(item).attr("repo"), iid: $(item).attr("iid") });
    return updates;
  },

  //Display at the follow-up form
  
  followUpSetValues: function (params) {
    $("#wi-follow-up-modal-server").text(params.server);
    $("#wi-follow-up-modal-user").text(params.user);
    $("#wi-follow-up-modal-repo").text(params.repo);
    $("#wi-follow-up-modal-type").text(params.type);
    $("#wi-follow-up-modal-type-label").text(params.type == "issue" ? "Issue number:" : "Pull Request number:");
    $("#wi-follow-up-modal-iid").text(params.iid);
    $("#wi-follow-up-modal-title").text(decodeURIComponent(params.title));
    $("#wi-follow-up-modal-days").val(params.days);
    // The own button stores the kind of operation to do on save
    $("#wi-follow-up-btn-save").html(params.exists ? "Update" : "Create");
    $("#wi-follow-up-modal-label").html(`<i class="fa-regular fa-flag"></i> ${params.exists ? "Update a follow up" : "Create a follow up"}`);
    $("#wi-follow-up-btn-save").show();
    if (params.exists)
      $("#wi-follow-up-btn-delete").show();
  },
  followUpGetValues: function () {
    return {
      server: $("#wi-follow-up-modal-server").text(),
      user: $("#wi-follow-up-modal-user").text(),
      repo: $("#wi-follow-up-modal-repo").text(),
      type: $("#wi-follow-up-modal-type").text(),
      iid: $("#wi-follow-up-modal-iid").text(),
      // Always encode title to allow non ascii characters be transformed into base64 to use the content rest api
      title: encodeURIComponent($("#wi-follow-up-modal-title").text()).replaceAll("%20", " "),
      days: $("#wi-follow-up-modal-days").val(),
    };
  },
  followUpProgress: function () {
    $("#wi-follow-up-btn-delete").hide();
    $("#wi-follow-up-btn-save").hide();
    $("#wi-follow-up-btn-progress").show();
    $("#wi-follow-up-btn-end").hide();
    $("#wi-follow-up-btn-end").text("");
    $("#wi-follow-up-btn-error").hide();
    $("#wi-follow-up-btn-error").text("");
  },
  followUpEnd: function (success, error) {
    $("#wi-follow-up-btn-progress").hide();
    $("#wi-follow-up-btn-cancel").text("Close");
    if (error == undefined || error == "") {
      $("#wi-follow-up-btn-end").text(success);
      $("#wi-follow-up-btn-end").show();
    } else {
      $("#wi-follow-up-btn-error").text(error);
      $("#wi-follow-up-btn-error").show();
    }
  },
  followUpClear: function () {
    this.followUpSetValues({ server: "", repo: "", type: "", iid: "", title: "" });
    $("#wi-follow-up-modal-label").text("Loading ...");
    $("#wi-follow-up-btn-cancel").text("Cancel");
    $("#wi-follow-up-btn-delete").hide();
    $("#wi-follow-up-btn-save").hide();
    $("#wi-follow-up-btn-progress").hide();
    $("#wi-follow-up-btn-end").hide();
    $("#wi-follow-up-btn-end").text("");
    $("#wi-follow-up-btn-error").hide();
    $("#wi-follow-up-btn-error").text("");
  },

  //Memoria de los paneles acordeon de cada target+provider
  saveStatePanel: function (id, expanded) {
    //el accordion se maneja cambiando tres atributos diferentes, por lo que no se puede
    //sincronizar facilmente el estado para todos los targets de un proveedor.
    //Obtengo el proveedor de un atributo anyadido en el markup para el id recibido
    //y sincronizo manualmente con todos los targets
    const collapsed = expanded != "true";
    const provider = $("#" + id).attr("wi-providers-panelbutton-provider");
    for (let target of this.allTargets)
      this.statesPanelAll(target, provider, collapsed);
  },
  statesPanelAll: function (target, provider, collapsed) {
    config.session.panelCollapsed[`wi-providers-panelbutton-${target}-${provider}`] = collapsed;
    $(`#wi-providers-panelbutton-${target}-${provider}`).attr("class", this.statePanelButton(target, provider));
    $(`#wi-providers-panelbutton-${target}-${provider}`).attr("aria-expanded", this.statePanelAria(target, provider));
    $(`#wi-providers-panel-${target}-${provider}`).attr("class", this.statePanelBody(target, provider));
  },
  statePanelBody: function (target, provider) {
    return config.session.panelCollapsed[`wi-providers-panelbutton-${target}-${provider}`] ? "accordion-collapse collapse" : "accordion-collapse collapse show";
  },
  statePanelAria: function (target, provider) {
    return config.session.panelCollapsed[`wi-providers-panelbutton-${target}-${provider}`] ? "false" : "true";
  },
  statePanelButton: function (target, provider) {
    return config.session.panelCollapsed[`wi-providers-panelbutton-${target}-${provider}`] ? "accordion-button collapsed" : "accordion-button";
  },

}

export { wiView };
