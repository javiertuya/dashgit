import { config } from "./Config.js"

/**
 * UI independent processing made in the view
 */
const wiServices = {

  sort: function (sorting, mod) {
    if (sorting == "descending,updated_at")
      mod.sort((a, b) => a.updated_at?.localeCompare(b.updated_at));
    else if (sorting == "ascending,updated_at")
      mod.sort((a, b) => b.updated_at?.localeCompare(a.updated_at));
    else if (sorting == "descending,created_at")
      mod.sort((a, b) => a.created_at?.localeCompare(b.created_at));
    else //default ascending,created_at
      mod.sort((a, b) => b.created_at?.localeCompare(a.created_at));
    return mod;
  },

  group: function (grouping, items) {
    if (!grouping)
      return items;
    let newItems = [];
    let processed = Array(items.length).fill(false);
    for (let i = 0; i < items.length; i++) {
      if (!processed[i]) {
        processed[i] = true;
        newItems.push(items[i]);
        for (let j = i + 1; j < items.length; j++) {
          if (items[i].repo_name == items[j].repo_name) {
            processed[j] = true;
            newItems.push(items[j]);
          }
        }
      }
    }
    return newItems;
  },

  filter: function (target, providerUid, items) {
    let label = config.getProviderByUid(providerUid).filterIfLabel
    return this.filterBy(target, new Date(), config.data.maxAge, label, items)
  },
  filterBy: function (target, today, maxAge, labelToFilter, items) {
    for (let i = items.length - 1; i >= 0; i--) {
      let item = items[i];
      //filter by age
      if (maxAge > 0 && this.daysBetweenDates(new Date(item.updated_at), today) > maxAge) {
        //console.log(`Filtering item by date: ${item.repo_name} ${item.title}`)
        items.splice(i, 1);
      } else if (target == "unassigned" && item.type == "pr" //do not repeat what is in dependabot target
        && item.author.toLowerCase().startsWith("dependabot")) {
        //console.log(`Filtering unassigned item authored by dependabot: ${item.repo_name} ${item.title}`)
        items.splice(i, 1);
      } else if (labelToFilter != "") { //filter by label
        for (let label of item.labels)
          if (label.name == labelToFilter) {
            //console.log(`Filtering item by label [${label.name}]: ${item.repo_name} ${item.title}`)
            items.splice(i, 1);
            break;
          }
      }
    }
    return items;
  },

  merge: function (items) {
    let mergedItems = [];
    let mergedIds = {}; //direct access to avoid nested iteration
    for (let item of items) {
      if (mergedIds[item.uid] == undefined) { // not yet in items, add
        mergedItems.push(item);
        mergedIds[item.uid] = item;
      } else { // duplicate
        this.mergeItem(item, mergedIds[item.uid]);
      }
    }
    return mergedItems;
  },
  mergeItem: function (source, target) {
    // Most of the time source and target come from the REST api and have equal values, it is enough to merge only the actions in the target.
    // But if an item is a follow-up, it has less values and the merge must preserve the values of the other item
    if (target.actions.follow_up || source.actions.follow_up) {
      if (target.actions.follow_up) { // source is regular item, overwrite the other of attributes
        target.created_at = source.created_at;
        target.title = source.title;
        target.author = source.author;
        target.assignees = source.assignees;
        target.labels = source.labels;
      }
      // the exception is the update date, that must be always the highest
      if (source.updated_at > target.updated_at)
        target.updated_at = source.updated_at;
    }
    // add all actions from source to target (actions are always in the form name=true)
    target.actions = { ...target.actions, ...source.actions };
  },

  // Date conversions and display (relative to now)

  intervalToString: function (sdate2, sdate1, today) {
    if (today == undefined)
      today = new Date();
    if (sdate1 == undefined || sdate1 == null || sdate1 == "")
      sdate1 = sdate2;
    if (sdate2 == undefined || sdate2 == null || sdate2 == "")
      sdate2 = sdate1;
    if (sdate1 == undefined || sdate1 == null || sdate1 == "")
      return `[n/a]`;
    const d2 = this.dateToString(sdate2, today);
    const d1 = this.dateToString(sdate1, today);
    return d1 == d2 ? `[${d2}]` : `[${d2} - ${d1}]`;
  },

  dateToString: function (sdate, today) {
    if (today == undefined)
      today = new Date();
    let days = this.daysBetweenDates(new Date(sdate), today).toString();
    if (days == 0) {
      let seconds = this.secondsBetweenDates(new Date(sdate), today).toString();
      if (seconds < 0)
        return "today"; // future
      else if (seconds < 60)
        return "now";
      else if (seconds < 3600)
        return Math.floor(seconds / 60).toString() + " min";
      else
        return Math.floor(seconds / 3600).toString() + " hr";
    } else if (days == 1)
      return "yesterday";
    else if (days == -1)
      return "tomorrow";
    else if (days > 1)
      return days + " days";
    else
      return "in " + (-days) + " days";
  },

  intervalPeriodAsString: function (d1, d2) {
    let days = this.daysBetweenDates(d1, d2);
    if (days == 0)
      return "Today";
    else if (days > 0) {
      if (days <= 1)
        return "Yesterday";
      else if (days <= 7)
        return "Last week";
      else if (days <= 30)
        return "Last month";
      else
        return "Older";
    } else {
      if (days >= -1) // NOSONAR false positive
        return "Tomorrow";
      else if (days >= -7)
        return "Next week";
      else if (days >= -30)
        return "Next month";
      else
        return "More than a month";
    }
  },

  daysBetweenDates: function (d1, d2) {
    let d1int = new Date(d1);
    let d2int = new Date(d2);
    d1int.setHours(0, 0, 0, 0);
    d2int.setHours(0, 0, 0, 0);
    let timeDiff = (d2int.getTime() - d1int.getTime());
    return Math.floor(timeDiff / (1000 * 3600 * 24));
  },
  secondsBetweenDates: function (d1, d2) {
    let timeDiff = (d2.getTime() - d1.getTime());
    return Math.floor(timeDiff / (1000));
  },

  dateAfterDays: function(days) {
    let today = new Date();
    today.setHours(0, 0, 0, 0);
    let afterDays = today.getTime() + (1000 * 3600 * 24) * days;
    return new Date(afterDays);
  },

  daysToDate: function(dateStr) {
    let date = new Date(dateStr);
    let today = new Date();
    today.setHours(0, 0, 0, 0);
    let days = Math.round((date.getTime() - today.getTime()) / (1000 * 3600 * 24));
    return days;
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

export { wiServices };
