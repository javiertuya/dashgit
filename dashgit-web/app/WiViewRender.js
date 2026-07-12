import { config } from "./core/Config.js"
import { notifCache } from "./core/NotifCache.js"
import { statusIndex } from "./core/StatusIndex.js"

/**
 * Primitive methods and constants to support generation of the html content from the work item view
 */
const wiRender = {
  gitHubIcon: '<i class="fa-brands fa-github"></i>',
  gitLabIcon: '<i class="fa-brands fa-square-gitlab"></i>',
  gitColor: '#F34F29',

  prIconClass: 'fa-solid fa-code-pull-request',
  issueIconClass: 'fa-regular fa-circle-dot',
  branchIconClass: 'fa-solid fa-code-branch',

  prIcon: '<i class="fa-solid fa-code-pull-request"></i>',
  forkIcon: '<i class="fa-solid fa-code-fork"></i>',

  successIcon: '<i class="wi-status-icon fa-solid fa-check" style="color:MediumSeaGreen" title="The build completed successfully"></i>',
  failureIcon: '<i class="wi-status-icon fa-solid fa-x" style="color:Red" title="The build ended with a failure"></i>',
  pendingIcon: '<i class="wi-status-icon fa-regular fa-circle" style="color:Orange" title="The build is running or waiting to run"></i>',
  unknownIcon: '<i class="wi-status-icon fa-regular fa-circle-question" style="color:#AAAAAA" title="The build status cannot be determined"></i>',
  spinnerIcon: `<span class="spinner-border spinner-border-sm text-secondary" style="opacity:15%" title="The build status is being determined"></span>`,
  spinnerClass: `spinner-border`,

  notificationIconClass: `fa-regular fa-bell`,
  mentionIconClass: `fa-solid fa-at`,

  //Primitive functions related to the display of single elements

  provider2html: function (provider) {
    if (provider.toLowerCase() == "github")
      return this.gitHubIcon;
    else if (provider.toLowerCase() == "gitlab")
      return this.gitLabIcon;
    else
      return '';
  },
  repourl2html: function (url, title) {
    return `<span><a href="${url}" target='_blank' class='fw-bold link-secondary link-underline-opacity-0 link-underline-opacity-100-hover'>${title}</a></span>`;
  },

  status2class: function (type, provider, uid) {
    //used to toggle visibility, issues are handled like a different status
    if (type == undefined)
      return "notavailable";
    if (type == "issue") //issues do not have status
      return "issue";
    let status = statusIndex.getStatus(provider, uid);
    return status;
  },
  status2html: function (type, provider, uid, id) {
    if (type == "issue") //issues do not have status
      return "";
    // wraps the content (status icon) to later change the icon by id
    let status = statusIndex.getStatus(provider, uid);
    return `<span id="wi-status-${id}">${wiRender.statusIcon(status)}</span>`;
  },
  type2html: function (type, highlight) {
  let titleSuffix = highlight ? " (new since your last visit to this view)" : "";
    if (type == "issue")
      return `<i class="${this.issueIconClass}" style="color:${highlight ? this.gitColor : "MediumSeaGreen"}" title="Issue${titleSuffix}"></i>`;
    else if (type == "pr")
      return `<i class="${this.prIconClass}" style="color:${highlight ? this.gitColor : "MediumSeaGreen"}" title="Pull Request${titleSuffix}"></i>`;
    else if (type == "branch")
      return `<i class="${this.branchIconClass}" style="color:${highlight ? this.gitColor : "DodgerBlue"}" title="Branch${titleSuffix}"></i>`;
    else
      return '';
  },
  notifications2html: function (provider, uid) {
    if (notifCache.getModel(provider) == undefined)
      return "";
    let reason = notifCache.getModel(provider)[uid];
    if (reason == undefined)
      return "";
    let iconClass = reason == "mention" || reason == "mentioned" || reason == "directly_addressed" ? this.mentionIconClass : this.notificationIconClass;
    return `<i class="wi-notification-icon ${iconClass}" title="Unread notification, reason: ${reason}"></i>`;
  },

  updateCheck2html: function (target, providerId, repoName, iid) {
    if (config.data.managerRepo.enabled && target == "dependabot") {
      // console.log(`${providerId} ${repoName} ${iid}`)
      return `<input class="form-check-input wi-update-check" type="checkbox" value="" aria-label="..."
          provider="${providerId}" repo="${repoName}" iid="${iid}"></input>&nbsp;`;
    }
    return "";
  },
  actions2html: function (actions) {
    if (actions == undefined)
      return "";
    let html = "";
    if (actions["review_request"])
  html += `<span class="wi-item-column-clickable badge text-dark bg-info wi-action-badge" title="A review has been requested for this PR"><i class="fa-solid fa-magnifying-glass"></i> review request</span> `;
    if (actions["changes_requested"])
  html += `<span class="wi-item-column-clickable badge text-light bg-primary wi-action-badge wi-action-changes-requested" title="A reviewer has commented and requested changes on this PR"><i class="fa-regular fa-comment"></i> changes requested</span> `;
    if (actions["pending_merge"])
  html += `<span class="wi-item-column-clickable badge text-light bg-success wi-action-badge" title="This PR is approved and pending merge"><i class="fa-solid fa-code-merge"></i> pending merge</span> `;
    if (actions["follow_up"]) {
      let message = actions["follow_up_message"];
      message = $("<p>").text(message).html(); //sanitized
  html += `<span class="wi-item-column-clickable badge text-dark bg-warning wi-action-badge" title="This work item has been flagged for follow-up"><i class="fa-regular fa-flag"></i> ${message}</span> `;
    }
    return html;
  },
  branch2html: function (url, name) {
    if (name !== undefined)
      return `<span class="badge badge-light fw-bold" style="color:black; background-color:#DDF4FF;"><a class="link-underline-light" target="_blank" href="${url}">${name}</a></span>`;
    return "";
  },
  url2html: function (url, title) {
    return `<a href="${url}" target='_blank' class='link-dark link-underline-opacity-0 link-underline-opacity-100-hover'>${title}</a>`;
  },
  labels2html: function (repoName, labels) {
    let html = "";
    for (let label of labels)
      html += " " + this.gitlabel2html(repoName, label.name, label.color, label.isIssueType === true, label.isPriority === true);
    return html;
  },

  statusIcon: function (status) {
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

  headerbadge2html: function (color, count, message) {
    if (count == undefined || count == 0)
      return "";
    return ` <span class="badge badge-primary" style="background-color:${color}">${count} ${message}</span>`;
  },

  statusBadgeColor: function (status) {
    if (status == "success")
      return `bg-success`;
    else if (status == "failure")
      return `bg-danger`;
    else if (status == "pending")
      return `bg-warning`;
    else
      return `bg-secondary`;
  },
  statusBadgeStyle: function (status) {
    if (status == "success")
      return `background-color:MediumSeaGreen!important`;
    else
      return `opacity:0.9`;
  },

  gitlabel2html: function (repoName, name, color, isIssueType = false, isPriority = false) {
    let cssClass = "badge rounded-pill";
    if (color == "") {
      color = "#888888"; //default if no color found
      cssClass += " badge-color-undefined"; //to be replaced later (only GitLab)
    }
    let normalizedColor = this.normalizeColor(color);
    let style;
    let displayName = name;
    if (isIssueType || isPriority) {
      // Issue types and priority (issue field) are rendered with a white background and a colored
      // border/text, each with its own set of known icons
      if (normalizedColor == "yellow") // to give more contrast with white background
        normalizedColor = "#ff5f1f"; // neon orange
      else if (normalizedColor == "pink") // pink is too light on white background
        normalizedColor = "#bf00ff"; // bright purple
      style = `background-color:#ffffff; color:${normalizedColor}; border:1px solid ${normalizedColor};`;

      const icon = isPriority ? this.knownPriorityIcon(name) : this.knownIssueTypeIcon(name);
      if (icon != "")
        displayName = icon + " " + name;
    } else {
      style = this.getLabelStyle(name, normalizedColor);
    }
    //a custom attribute colorkey is set to allow locate labels in data from cache
    return `<span class="${cssClass}" style="${style}" data-colorkey="${repoName}-${name}">${displayName}</span>`;
  },
  knownIssueTypeIcon: function(name) {
    if (name.toLowerCase() == "bug")
      return '<i class="fa-solid fa-bug"></i>';
    else if (name.toLowerCase() == "enhancement")
      return '<i class="fa-regular fa-square-plus"></i>';
    else if (name.toLowerCase() == "task")
      return '<i class="fa-regular fa-square-check"></i>';
    else if (name.toLowerCase() == "incident")
      return '<i class="fa-solid fa-triangle-exclamation"></i>';
    else
      return '';
  },
  knownPriorityIcon: function(name) {
    // Default GitHub Priority issue field options: Urgent, High, Medium, Low
    if (name.toLowerCase() == "urgent")
      return '<i class="fa-solid fa-angles-up"></i>';
    else if (name.toLowerCase() == "high")
      return '<i class="fa-solid fa-arrow-up"></i>';
    else if (name.toLowerCase() == "medium")
      return '<i class="fa-solid fa-equals"></i>';
    else if (name.toLowerCase() == "low")
      return '<i class="fa-solid fa-arrow-down"></i>';
    else
      return '';
  },
  normalizeColor: function (color) {
    if (color == undefined || color == null)
      return "#888888";
    if (typeof color !== "string")
      return "#888888";
    if (color.startsWith("#"))
      return color;
    if (/^[0-9A-Fa-f]{6}$/.test(color))
      return `#${color}`;
    return color;
  },
  getLabelStyle: function (name, color) {
    if (typeof color !== "string")
      color = "#888888";
    if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
      let foreground = this.getColorLuma(color.substring(1)) > 140 ? "000000" : "ffffff";
      return `background-color:${color}; color:#${foreground};`;
    }
    return `background-color:${color}; color:#000000;`;
  },
  getColorLuma: function (color) {
    //https://stackoverflow.com/questions/12043187/how-to-check-if-hex-color-is-too-black
    //The resulting luma value range is 0..255, where 0 is the darkest and 255 is the lightest. 
    //Values greater than 128 are considered light by tinycolor
    let c = color.substring(1);      // strip #
    let rgb = parseInt(c, 16);   // convert rrggbb to decimal
    let r = (rgb >> 16) & 0xff;  // extract red
    let g = (rgb >> 8) & 0xff;  // extract green
    let b = (rgb >> 0) & 0xff;  // extract blue
    return 0.2126 * r + 0.7152 * g + 0.0722 * b; // per ITU-R BT.709
  },

}

export { wiRender };
