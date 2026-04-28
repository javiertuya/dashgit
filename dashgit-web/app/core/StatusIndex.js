import { surrogates } from "./Surrogates.js"

/**
 * Keeps an unique index of each work item id to access the value of the status (string).
 * This is populated from the StatusesCache and used to update the items in the view.
 */
const statusIndex = {

  data: {},
  reset: function () {
    this.data = {};
  },
  setStatus: function (provider, uid, status) {
    this.data[this.getUid(provider, uid)] = status;
  },
  getStatus: function (provider, uid) {
    if (surrogates.hasSurrogate(provider))
      provider = surrogates.getSurrogate(provider);
    return this.data[this.getUid(provider, uid)];
  },
  getUid: function (provider, uid) {
    return `${provider}_${uid}`;
  },

}

export { statusIndex };
