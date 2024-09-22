import { cache } from "./Cache.js"
import { config } from "./Config.js"

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

  successIcon: '<i class="wi-status-icon fa-solid fa-check" style="color:MediumSeaGreen" title="The build has completed succesfully"></i>',
  failureIcon: '<i class="wi-status-icon fa-solid fa-x" style="color:Red" title="The build has ended with failure"></i>',
  pendingIcon: '<i class="wi-status-icon fa-regular fa-circle" style="color:Orange" title="The build is executing or waiting to execute"></i>',
  unknownIcon: '<i class="wi-status-icon fa-regular fa-circle-question" style="color:#AAAAAA" title="The build status cannot be determined"></i>',
  spinnerIcon: `<span class="spinner-border spinner-border-sm text-secondary" style="opacity:50%" title="The build status is being determined"></span>`,
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
    let status = cache.getStatus(provider, uid);
    return status;
  },
  status2html: function (type, provider, uid, id) {
    if (type == "issue") //issues do not have status
      return "";
    // wraps the content (status icon) to later change the icon by id
    let status = cache.getStatus(provider, uid);
    return `<span id="wi-status-${id}">${wiRender.statusIcon(status)}</span>`;
  },
  type2html: function (type, highlight) {
    let titleSuffix = highlight ? " (new since last visit to this view)" : "";
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
    if (cache.notifCache[provider] == undefined)
      return "";
    let reason = cache.notifCache[provider][uid];
    if (reason == undefined)
      return "";
    let iconClass = reason == "mention" || reason == "mentioned" || reason == "directly_addressed" ? this.mentionIconClass : this.notificationIconClass;
    return `<i class="wi-notification-icon ${iconClass}" title="Unread notification, reason: ${reason}"></i>`;
  },

  updateCheck2html: function (target, providerId, repoName, iid) {
    if (config.data.enableManagerRepo && target == "dependabot") {
      console.log(`${providerId} ${repoName} ${iid}`)
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
      html += `<span class="wi-item-column-clickable badge text-dark bg-warning wi-action-badge" title="A review on this PR has been requested"><i class="fa-solid fa-magnifying-glass"></i> review</span> `;
    if (actions["follow_up"])
      html += `<span class="wi-item-column-clickable badge text-dark bg-warning wi-action-badge" title="This work item has been flagged for follow up"><i class="fa-regular fa-flag"></i> follow up</span> `;
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
      html += " " + this.gitlabel2html(repoName, label.name, label.color);
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
    let foreground = this.getColorLuma(color) > 140.0 ? "000000" : "ffffff";
    return `background-color:#${color}; color:#${foreground};`;
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
