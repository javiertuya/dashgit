import { Model } from './Model.js'

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
}

export { notifCache };
