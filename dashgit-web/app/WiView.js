import { cache } from "./Cache.js"
import { config } from "./Config.js"
import { wiServices } from "./WiServices.js"

/**
 * Generates the html content for the work item view
 */
const wiView = {
  //only api-related target. Note that statuses is named Branches in the UI tab
  allTargets: ["assigned", "involved", "created", "unassigned", "dependabot", "statuses"],

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

  renderWorkItems: function (target, models) {
    let sorting = $("#inputSort").val();
    let grouping = $("#checkGroup").is(':checked');
    console.log(`Render Work Items, sort order: ${sorting}, grouping: ${grouping}`);
    let html = `<div class="accordion" id="wi-providers-panel">`;
    for (let mod of models) {
      let header = mod.header;
      let items = mod.items;
      items = wiServices.sort(sorting, items);
      items = wiServices.filter(target, mod.header.uid, items);
      items = wiServices.group(grouping, items);
      html += this.model2html(target, header, items, grouping, sorting);
    }
    html += `</div>`;
    $(`#${target}`).html(html);
    for (let mod of models) {
      this.updateBadges(target, mod.header.uid, true);
      $(`#${this.getPanelId(target, mod.header.uid)} .wi-status-icon`).tooltip({ delay: 200 });
      $(`#${this.getPanelId(target, mod.header.uid)} .wi-action-badge`).tooltip({ delay: 200 });
    }
  },

  model2html: function (target, header, items, grouping, sorting) {
    let provider = header.uid;
    let html = `
    <div class="accordion-item>
      <h4 class="accordion-header">
        <button id="wi-providers-panelbutton-${target}-${provider}" 
            wi-providers-panelbutton-provider="${provider}"
            class="${this.statePanelButton(target, provider)}"
            type="button" data-bs-toggle="collapse" 
            data-bs-target="#wi-providers-panel-${target}-${provider}" 
            aria-expanded="${this.statePanelAria(target, provider)}" 
            aria-controls="wi-providers-panel-${target}-${provider}">
          <p class="m-0">
            <span class='h4'>${this.provider2html(header.provider)} ${header.provider} - ${header.user}</span>
            <span class='h6'>${header.url != "" ? " &nbsp; at " + header.url.replace("https://", "") : ""}</span>
            <span id="wi-badges-${this.getId(target, header.uid, "all")}" style='position:relative; bottom:4px;'></span>
            <span id="wi-spinner-${this.getId(target, header.uid, "all")}" style='position:relative; bottom:2px;'> ${target != "statuses" ? this.spinnerIcon : ""}</span>
          </p>
        </button>
      </h4>
      <div id="wi-providers-panel-${target}-${provider}" 
          class="${this.statePanelBody(target, provider)}">
        <div class="accordion-body">
<table id="wi-items-${this.getId(target, header.uid, "all")}" class='table table-sm table-borderless m-0'>
`;
    // adds every row
    html += this.rowsmodel2html(target, header, items, grouping, sorting);
    html += `</table>`;
    html += `</div></div></div>`;
    return html;
  },

  rowsmodel2html: function (target, header, items, grouping, sorting) {
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
              ? this.repourl2html(item.repo_url, item.repo_name)
              : "<span class='text-secondary fw-bold'>" + this.groupValue(item, grouping, sorting) + "</span>"}
          <td><tr>`;
        html += this.rowmodel2html(target, header, item, grouping);
      }
    }
    return html;
  },
  rowmodel2html: function (target, header, item, grouping) {
    return `
    <tr id="wi-item-${this.getId(target, header.uid, item.uid)}" 
        class="wi-status-class-any wi-status-class-${this.status2class(item.type, header.uid, item.uid)}">
      <td style="width:24px;">${this.status2html(item.type, target, header.uid, item.uid)}</td>
      <td style="width:24px;">${this.type2html(item.type)}</td>
      <td style="width:24px; color:${this.gitColor};" 
        class="wi-notifications-${this.getId(target, header.uid, 'all')}" 
        id="wi-notifications-${this.getId(target, header.uid, item.uid)}">
        ${this.notification2html(header.uid, item.uid)}
      </td>
      <td>
        ${this.actions2html(item.actions)}
        ${grouping ? "" : this.repourl2html(item.repo_url, item.repo_name)}
        ${this.branch2html(item.branch_url, item.branch_name)}
        <span class='${item.type == "branch" ? "fw-normal" : "fw-bold"}'>${this.url2html(item.url, item.title)}</span>
        <span class='text-secondary'>${item.iidstr}</span>
        <span class='text-primary'>${item.assignees}</span>
        <span class='text-secondary'>${wiServices.intervalToString(item.created_at, item.updated_at)}</span>
        ${this.labels2html(item.repo_name, item.labels)}
      </td>
    </tr>
    `;
  },
  actions2html: function (actions) {
    if (actions == undefined)
      return "";
    let html = "";
    if (actions["review_request"])
      html += `<span class="badge text-dark bg-warning wi-action-badge" title="Review requested">review</span> `;
    return html;
  },

  groupValue: function (item, grouping, sorting) {
    //grouping=true is to group by project name. If false, groups by date groups (today, week, month, older)
    let value = "";
    if (grouping)
      value = item.repo_name;
    else if (sorting.endsWith("updated_at"))
      value = wiServices.intervalPeriodAsString(new Date(), new Date(item.updated_at)).toString();
    else if (sorting.endsWith("created_at"))
      value = wiServices.intervalPeriodAsString(new Date(), new Date(item.created_at)).toString();
    return value;
  },

  //Callbacks called from asynchronous calls after the work items are rendered

  updateStatuses: function (statusesModel, allLabels) {
    for (let item of statusesModel.items) {
      if (item.type == "pr" || item.type == "branch")
        this.upateStatusIcon(item.status, statusesModel.header.uid, item.uid);
      this.upateStatusClass(item.status, statusesModel.header.uid, item.uid)
    }
    let providerId = statusesModel.header.uid;
    this.updateSpinnerEnd(providerId);
    this.updateBadges(providerId, false);
    this.updateStatusVisibility();
    $(`#${this.getPanelId(this.selectActiveTarget(), statusesModel.header.uid)} .wi-status-icon`).tooltip({ delay: 200 });
  },
  upateStatusIcon: function (status, providerId, itemId) {
    const target = this.selectActiveTarget();
    const id = this.getId(target, providerId, itemId);
    const statusIcon = this.status2htmlContent(status, false);
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
    // Value encodes the statuses to show in binary, left bit is for issues.
    // Hide/show all items that belong to the appropriate class to match the selected status
    const classes = ["issue", "success", "failure", "pending", "notavailable", "undefined"];
    for (let i = 0; i < status.length; i++)
      this.showIf(".wi-status-class-" + classes[i], status.substring(i, i + 1) == "1")
    // When a row represents a grouping (class wi-status-class-header),
    // if all inner rows are hidden (display:none), it should be hidden too
    for (let target of this.allTargets)
      for (let provider of config.data.providers)
        this.updateEmptyGroupsVisibility(`wi-items-${target}_${provider.uid}_all`);
  },
  updateEmptyGroupsVisibility: function (id) {
    // As the dom does not have a physical hierarchy, iterates from the end
    // to find each header that does not contain any visible rows
    let target = $("#" + id).find("tbody tr");
    let visibleCount = 0;
    for (let i = target.length - 1; i >= 0; i--) {
      let row = target[i];
      if (row.attributes.class != undefined) {
        // note: requieres a single style with display: none or undefined
        if ($(row).hasClass("wi-status-class-any")) { //an item
          const style = $(row).attr("style") ?? "";
          if (!style.includes("display: none")) //is displayed
            visibleCount++;
        } else if ($(row).hasClass("wi-status-class-header")) { //a header, check visibleCount
          this.showIf(row, visibleCount != 0);
          visibleCount = 0; //begin next header
        }
      }
    }
  },
  updateNotifications(providerId, totalCount) {
    const target = this.selectActiveTarget();
    let panel = `#${this.getPanelId(target, providerId)}`;
    let viewItems = $(panel).find(`.wi-notifications-${this.getId(target, providerId, "all")}`);
    for (let viewItem of viewItems) {
      let viewId = $(viewItem).attr("id");
      let itemId = viewId.replace(`wi-notifications-${this.getIdPrefix(target, providerId)}`, "");
      $(viewItem).html(this.notification2html(providerId, itemId));
    }
    $(`${panel} .wi-notification-icon`).tooltip({ delay: 200 });
    //In addition to the notifications of each item, displays the total of notifications
    $(`#wi-notifications-tab-badge`).text(totalCount);
    $(`#wi-notifications-tab-count`).css("display", totalCount > 0 ? "inline" : "none");
  },
  updateSpinnerEnd: function (provider) {
    const target = this.selectActiveTarget();
    // hide spinner at the provider header
    let spinnerAll = `#wi-spinner-${this.getId(target, provider, "all")}`;
    $(spinnerAll).hide();
    // convert spinner at each row into not available (it will be updted later if status is known)
    let panel = `#${this.getPanelId(target, provider)}`;
    let spinners = $(panel).find(`.${this.spinnerClass}`);
    for (let spinner of spinners)
      $(spinner).parent().html(this.unknownIcon);
  },
  updateBadges: function (provider, inProgress) {
    const target = this.selectActiveTarget();
    let panel = `wi-items-${this.getId(target, provider, "all")}`;
    let html = "";
    html = this.headerbadge2html("Blue", $("#" + panel + " tbody tr.wi-status-class-any").length, "")
      + this.headerbadge2html("DodgerBlue", $("#" + panel + " tbody tr.wi-status-class-issue").length, "issues")
      + this.headerbadge2html("MediumSeaGreen", $("#" + panel + " tbody tr.wi-status-class-success").length, "success")
      + this.headerbadge2html("Red", $("#" + panel + " tbody tr.wi-status-class-failure").length, "failed")
      + this.headerbadge2html("Orange", $("#" + panel + " tbody tr.wi-status-class-pending").length, "pending")
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
        $(item).attr("style", this.getLabelStyle($(item).text(), allLabels[key].color.replace("#", "")));
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

  //Primitive functions related to the display of single elements

  labels2html: function (repoName, labels) {
    let html = "";
    for (let label of labels)
      html += " " + this.gitlabel2html(repoName, label.name, label.color);
    return html;
  },
  provider2html: function (provider) {
    if (provider.toLowerCase() == "github")
      return this.gitHubIcon;
    else if (provider.toLowerCase() == "gitlab")
      return this.gitLabIcon;
    else
      return '';
  },
  url2html: function (url, title) {
    return `<a href="${url}" target='_blank' class='link-dark link-underline-opacity-0 link-underline-opacity-100-hover'>${title}</a>`;
  },
  repourl2html: function (url, title) {
    return `<span><a href="${url}" target='_blank' class='fw-bold link-secondary link-underline-opacity-0 link-underline-opacity-100-hover'>${title}</a></span>`;
  },
  branch2html: function (url, name) {
    if (name !== undefined)
      return `<span class="badge badge-light fw-bold" style="color:black; background-color:#DDF4FF;"><a class="link-underline-light" target="_blank" href="${url}">${name}</a></span>`;
    return "";
  },
  status2class: function (type, provider, uid) {
    //used to toggle visibility, issues are handled like a different status
    if (type == undefined)
      return "notavailable";
    if (type == "issue") //issues do not have status
      return "issue";
    let status = cache.getStatus(provider, uid);
    return status;
  },
  status2html: function (type, target, provider, uid) {
    if (type == "issue") //issues do not have status
      return "";
    // wraps the content (status icon) to later change the icon by id
    let id = this.getId(target, provider, uid);
    let status = cache.getStatus(provider, uid);
    return `<span id="wi-status-${id}">${this.status2htmlContent(status)}</span>`;
  },
  status2htmlContent: function (status) {
    if (status == "success")
      return `${this.successIcon}`;
    else if (status == "failure")
      return `${this.failureIcon}`;
    else if (status == "pending")
      return `${this.pendingIcon}`;
    //There are three cases when the status is not known:
    // 1. Status has been determined as "notavailable", e.g. because there is no checks (GitHub) or pipelines (GitLab)
    // 2. Status has not been determined yet, e.g. at the beginnig, before calling the GraphQL api that determines the statuses
    // 3. Status can't be determined, e.g. the GraphQL api does not have access to the repo because of the query limits
    // Case 1 will display the unknown icon. Cases 2, 3 will display the spinner icon that will be replaced by unknown
    // just after the finish of the GraphQL call that determines the statuses
    else if (status == "notavailable")
      return `${this.unknownIcon}`;
    else
      return `${this.spinnerIcon}`;
  },
  type2html: function (type) {
    if (type == "issue")
      return `${this.issueIcon}`;
    else if (type == "pr")
      return `${this.prIcon}`;
    else if (type == "branch")
      return `${this.branchIcon}`;
    else
      return '';
  },
  notification2html: function (provider, uid) {
    if (cache.notifCache[provider] == undefined)
      return "";
    let reason = cache.notifCache[provider][uid];
    return reason == undefined ? "" : `<i class="wi-notification-icon fa-regular fa-circle-check" title="Unread notification, reason: ${reason}"></i>`;
  },
  headerbadge2html: function (color, count, message) {
    if (count == undefined || count == 0)
      return "";
    return ` <span class="badge badge-primary" style="background-color:${color}">${count} ${message}</span>`;
  },

  gitlabel2html: function (repoName, name, color) {
    let cssClass = "badge rounded-pill";
    if (color == "") {
      color = "888888"; //default if no color found
      cssClass += " badge-color-undefined"; //to be replaced later (only GitLab)
    }
    //a custom attribute colorkey is set to allow locate labels in data from cache
    return `<span class="${cssClass}" style="${this.getLabelStyle(name, color)}" data-colorkey="${repoName}-${name}">${name}</span>`;
  },
  getLabelStyle: function (name, color) {
    let foreground = wiServices.getColorLuma(color) > 140.0 ? "000000" : "ffffff";
    return `background-color:#${color}; color:#${foreground};`;
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

  gitHubIcon: '<i class="fa-brands fa-github"></i>',
  gitLabIcon: '<i class="fa-brands fa-square-gitlab"></i>',
  gitColor: '#F34F29',

  prIcon: '<i class="fa-solid fa-code-pull-request" style="color:MediumSeaGreen" title="Pull Request"></i>',
  issueIcon: '<i class="fa-regular fa-circle-dot" style="color:MediumSeaGreen" title="Issue"></i>',
  branchIcon: '<i class="fa-solid fa-code-branch" style="color:DodgerBlue" title="Branch"></i>',

  successIcon: '<i class="wi-status-icon fa-solid fa-check" style="color:MediumSeaGreen" title="The build has completed succesfully"></i>',
  failureIcon: '<i class="wi-status-icon fa-solid fa-x" style="color:Red" title="The build has ended with failure"></i>',
  pendingIcon: '<i class="wi-status-icon fa-regular fa-circle" style="color:Orange" title="The build is executing or waiting to execute"></i>',
  unknownIcon: '<i class="wi-status-icon fa-regular fa-circle-question" style="color:#AAAAAA" title="The build status cannot be determined"></i>',
  spinnerIcon: `<span class="spinner-border spinner-border-sm text-secondary" style="opacity:50%" title="The build status is being determined"></span>`,
  spinnerClass: `spinner-border`,
}

export { wiView };
