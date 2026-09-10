import { Model } from "./Model.js"
import { surrogates } from "./Surrogates.js"

/**
 * Stores notifications that are obtained asynchronously to get displayed by the UI.
 * Structure of cached data: { provider: { repo_name: ..., type: ..., iid: ..., reason: ... }} 
 */
const notifCache = {
  data: {},
  reset: function () {
    this.data = {};
  },
  saveNotifications: function (provider, notif) {
    let mod = new Model(); //to acces  internal methods
    let items = {};
    for (let i = notif.length - 1; i >= 0; i--) //reverse to keep latest if more than one
      items[mod.getModelUid(notif[i].repo_name, notif[i].type, notif[i].iid, "")] = notif[i].reason; //do not collect from branches
    this.data[provider] = items; //replace content
  },
  //Notification reasons that are considered a mention of the user.
  //GitHub: mention (directly mentioned), team_mention (mentioned through a team the user belongs to).
  //GitLab: mentioned (name at the end), directly_addressed (name at the beginning)
  mentionReasons: ["mention", "team_mention", "mentioned", "directly_addressed"],
  isMention: function (reason) {
    return this.mentionReasons.includes(reason);
  },
  getModel: function (provider) {
    if (surrogates.hasSurrogate(provider)) {
      let origin = surrogates.getSurrogate(provider);
      return this.data[origin];
    }
    return this.data[provider];
  },
}

export { notifCache };
