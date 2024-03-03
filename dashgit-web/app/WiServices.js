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
      if (maxAge > 0 && this.daysBetweenDates(today, new Date(item.updated_at)) > maxAge) {
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
    //in any case, remove duplicates of adjacent items (requires previous soting)
    items = this.removeDuplicates(items);
    return items;
  },
  removeDuplicates: function (items) {
    for (let i = items.length - 1; i >= 1; i--) {
      if (items[i].uid == items[i - 1].uid) {
        // before removing item i, aggregate actions of i into i-1
        items[i-1].actions = {...items[i].actions, ...items[i-1].actions};
        items.splice(i, 1);
      }
    }
    return items;
  },

  // Creates the model required for combined updates:
  // takes the list of selected items and produces a hierarchical structure by providers and repositories.
  // Keep in sync with the model creation from javascript in dashgit-updater: UpdaterModel.js
  getUpdatesModel: function (items, updateManagerRepo, updateManagerBranch, dryRun) {
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
    let days = this.daysBetweenDates(today, new Date(sdate)).toString();
    if (days == 0) {
      let seconds = this.secondsBetweenDates(today, new Date(sdate)).toString();
      if (seconds < 60)
        return "now";
      else if (seconds < 3600)
        return Math.floor(seconds / 60).toString() + " min";
      else
        return Math.floor(seconds / 3600).toString() + " hr";
    } else if (days == 1)
      return "yesterday";
    else
      return days + " days";
  },

  intervalPeriodAsString: function (d2, d1) {
    let days = this.daysBetweenDates(d2, d1);
    if (days < 1)
      return "Today";
    else if (days < 2)
      return "Yesterday";
    else if (days <= 7)
      return "This week";
    else if (days <= 30)
      return "This month"
    else
      return "Older";
  },

  daysBetweenDates: function (d2, d1) {
    let timeDiff = Math.abs(d2.getTime() - d1.getTime());
    return Math.floor(timeDiff / (1000 * 3600 * 24));
  },
  secondsBetweenDates: function (d2, d1) {
    let timeDiff = Math.abs(d2.getTime() - d1.getTime());
    return Math.floor(timeDiff / (1000));
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
