import assert from 'assert';
import { Model } from "../app/Model.js"
import { wiServices } from "../app/WiServices.js"

/**
 * Main processing made in the view (sorting, grouping, filtering) and other basic functions
 * (could be moved to a different module)
 */
describe("TestView - Main processing in the view module", function () {

    it("Number of days between dates", function () {
        assert.equal("abc", "abc");
        assert.equal("0", wiServices.daysBetweenDates(new Date("2023-01-02"), new Date("2023-01-02")));
        assert.equal("1", wiServices.daysBetweenDates(new Date("2023-01-01"), new Date("2023-01-02")));
        assert.equal("5", wiServices.daysBetweenDates(new Date("2023-01-01"), new Date("2023-01-06")));

        //floor hours
        assert.equal("0", wiServices.daysBetweenDates(new Date("2023-01-01T10:00:00"), new Date("2023-01-01T20:00:00")));
        assert.equal("1", wiServices.daysBetweenDates(new Date("2023-01-01T10:00:00"), new Date("2023-01-02T01:00:00")));
        assert.equal("1", wiServices.daysBetweenDates(new Date("2023-01-01T10:00:00"), new Date("2023-01-02T20:00:00")));

        //boundaries
        assert.equal("0", wiServices.daysBetweenDates(new Date("2023-01-01T00:00:00"), new Date("2023-01-01T23:59:59")));
        assert.equal("1", wiServices.daysBetweenDates(new Date("2023-01-01T23:59:59"), new Date("2023-01-02T00:00:00")));

        //inverted args (negative number, future date)
        assert.equal("-2", wiServices.daysBetweenDates(new Date("2023-01-03"), new Date("2023-01-01")));
    });

    it("Date value as string", function () {
        //past dates
        assert.equal("now", wiServices.dateToString("2023-08-01T15:00:00", new Date("2023-08-01T15:00:01")));
        assert.equal("1 min", wiServices.dateToString("2023-08-01T15:00:00", new Date("2023-08-01T15:01:01")));
        assert.equal("59 min", wiServices.dateToString("2023-08-01T15:00:00", new Date("2023-08-01T15:59:59")));
        assert.equal("1 hr", wiServices.dateToString("2023-08-01T15:00:00", new Date("2023-08-01T16:00:00")));
        assert.equal("8 hr", wiServices.dateToString("2023-08-01T15:00:00", new Date("2023-08-01T23:59:59")));
        assert.equal("yesterday", wiServices.dateToString("2023-08-01T15:00:00", new Date("2023-08-02T00:00:00")));
        assert.equal("2 days", wiServices.dateToString("2023-08-01T15:00:00", new Date("2023-08-03T00:00:00")));
        assert.equal("7 days", wiServices.dateToString("2023-08-01T15:00:00", new Date("2023-08-08T00:00:00")));
        assert.equal("8 days", wiServices.dateToString("2023-08-01T15:00:00", new Date("2023-08-09T00:00:00")));
        assert.equal("39 days", wiServices.dateToString("2023-08-01T15:00:00", new Date("2023-09-09T00:00:00")));

        //future (entire days)
        assert.equal("today", wiServices.dateToString("2023-08-01T15:00:01", new Date("2023-08-01T15:00:00")));
        assert.equal("today", wiServices.dateToString("2023-08-01T16:00:06", new Date("2023-08-01T15:00:00")));
        assert.equal("today", wiServices.dateToString("2023-08-01T23:59:59", new Date("2023-08-01T15:00:00")));
        assert.equal("tomorrow", wiServices.dateToString("2023-08-02T00:00:00", new Date("2023-08-01T15:00:00")));
        assert.equal("in 2 days", wiServices.dateToString("2023-08-03T00:00:00", new Date("2023-08-01T15:00:00")));
        assert.equal("in 39 days", wiServices.dateToString("2023-09-09T00:00:00", new Date("2023-08-01T15:00:00")));
    });

    it("Date interval as string", function () {
        assert.equal("[yesterday - now]", wiServices.intervalToString("2023-08-01", "2023-08-02", new Date("2023-08-02")));
        assert.equal("[2 days - now]", wiServices.intervalToString("2023-08-01", "2023-08-03", new Date("2023-08-03")));
        assert.equal("[4 days - 2 days]", wiServices.intervalToString("2023-08-01", "2023-08-03", new Date("2023-08-05")));
        //Equal dates
        assert.equal("[now]", wiServices.intervalToString("2023-08-01", "2023-08-01", new Date("2023-08-01")));
        assert.equal("[2 days]", wiServices.intervalToString("2023-08-01", "2023-08-01", new Date("2023-08-03")));
        //Undefined dates
        assert.equal("[yesterday]", wiServices.intervalToString("2023-08-01", undefined, new Date("2023-08-02")));
        assert.equal("[yesterday]", wiServices.intervalToString(undefined, "2023-08-01", new Date("2023-08-02")));
        assert.equal("[n/a]", wiServices.intervalToString(undefined, undefined, new Date("2023-08-01")));
    });

    //Ascending/descending by creation/update date. Uses a function to get the models such that: 
    //even items are swapped when sort descending by created date, Reverse order by updated date
    it("Sort model items by created date (ascending/descending)", function () {
        let items = wiServices.sort("descending,created_at", getSortModelItems());
        assert.deepEqual(["first", "second", "third", "fourth"], items.map(a => a.title));

        items = wiServices.sort("ascending,created_at", getSortModelItems());
        assert.deepEqual(["fourth", "third", "second", "first"], items.map(a => a.title));
    });
    it("Sort model items by updated date (ascending/descending)", function () {
        let items = wiServices.sort("descending,updated_at", getSortModelItems());
        assert.deepEqual(["fourth", "third", "second", "first"], items.map(a => a.title));

        items = wiServices.sort("ascending,updated_at", getSortModelItems());
        assert.deepEqual(["first", "second", "third", "fourth"], items.map(a => a.title));
    });
    let getSortModelItems = function () {
        let mod = new Model().setHeader("GitHub", "0-github", "", "");
        mod.addItem({ repo_name: "repo1", type: "branch", iid: "001", title: "third", created_at: "2023-06-06", updated_at: "2023-07-03" });
        mod.addItem({ repo_name: "repo2", type: "issue", iid: "002", title: "fourth", created_at: "2023-06-08", updated_at: "2023-07-01" });
        mod.addItem({ repo_name: "repo3", type: "pr", iid: "003", title: "first", created_at: "2023-06-02", updated_at: "2023-07-07" });
        mod.addItem({ repo_name: "repo1", type: "branch", iid: "004", title: "second", created_at: "2023-06-04", updated_at: "2023-07-05" });
        return mod.items;
    }

    it("Group model items by repo name", function () {
        let items = wiServices.group(true, getGroupModelItems());
        assert.deepEqual(["first", "fourth", "sixth", "second", "fifth", "third"], items.map(a => a.title));

        items = wiServices.group(false, getGroupModelItems());
        assert.deepEqual(["first", "second", "third", "fourth", "fifth", "sixth"], items.map(a => a.title));
    });
    let getGroupModelItems = function () {
        let mod = new Model().setHeader("GitHub", "0-github", "", "");
        mod.addItem({ repo_name: "repo1", type: "branch", iid: "001", title: "first" });
        mod.addItem({ repo_name: "repo2", type: "issue", iid: "002", title: "second" });
        mod.addItem({ repo_name: "repo3", type: "pr", iid: "003", title: "third" });
        mod.addItem({ repo_name: "repo1", type: "branch", iid: "004", title: "fourth" });
        mod.addItem({ repo_name: "repo2", type: "issue", iid: "005", title: "fifth" });
        mod.addItem({ repo_name: "repo1", type: "issue", iid: "005", title: "sixth" });
        return mod.items;
    }

    it("Merge duplicates item models baseline", function () {
        //MCDC values of id sources (base choice repo, type, iid)
        //Merge issues/prs/branches
        //duplcate is adjacent/non adjacent
        let mod = new Model().setHeader("GitHub", "0-github", "", "");
        mod.addItem({ repo_name: "repo1", type: "issue", iid: "001", branch_name: "", title: "item11" });
        mod.addItem({ repo_name: "repo1", type: "issue", iid: "001", branch_name: "", title: "item12-merged" });
        mod.addItem({ repo_name: "repo1x", type: "pr", iid: "001", branch_name: "", title: "item13" });
        mod.addItem({ repo_name: "repo1", type: "pr", iid: "001", branch_name: "", title: "item14" });
        mod.addItem({ repo_name: "repo1", type: "issue", iid: "002", branch_name: "", title: "item15" });
        mod.addItem({ repo_name: "repo1", type: "pr", iid: "001", branch_name: "", title: "item15-merged" });

        mod.addItem({ repo_name: "repo2", type: "issue", iid: "001", branch_name: "", title: "item21" });
        mod.addItem({ repo_name: "repo2", type: "pr", iid: "001", branch_name: "", title: "item22" });
        mod.addItem({ repo_name: "repo2", type: "issue", iid: "001", branch_name: "", title: "item23-merged" });

        mod.addItem({ repo_name: "repo3", type: "branch", iid: "", branch_name: "branch-one", title: "item31" });
        mod.addItem({ repo_name: "repo3x", type: "branch", iid: "", branch_name: "branch-one", title: "item32" });
        mod.addItem({ repo_name: "repo3", type: "issue", iid: "", branch_name: "branch-one", title: "item33" });
        mod.addItem({ repo_name: "repo3", type: "branch", iid: "", branch_name: "branch-onex", title: "item34" });
        mod.addItem({ repo_name: "repo3", type: "branch", iid: "", branch_name: "branch-one", title: "item35-merged" });

        let items = wiServices.merge(mod.items);
        assert.deepEqual(['item11', 'item13', 'item14', 'item15', 'item21', 'item22', 'item31', 'item32', 'item33', 'item34'], items.map(a => a.title));
    });

    it("Merge duplicates with action badges should aggregate all action values", function () {
        // merged items first with action/second without, reverse, both with action
        let mod = new Model().setHeader("GitHub", "0-github", "", "");
        mod.addItem({ repo_name: "repo1", type: "pr", iid: "001", title: "item11" });
        mod.addItem({ repo_name: "repo1", type: "issue", iid: "001", title: "item21", actions: { request_review2: true } });
        mod.addItem({ repo_name: "repo1", type: "pr", iid: "002", title: "item31", actions: { request_review3: true } });

        mod.addItem({ repo_name: "repo1", type: "pr", iid: "001", title: "item12", actions: { request_review1: true } });
        mod.addItem({ repo_name: "repo1", type: "issue", iid: "001", title: "item22" });
        mod.addItem({ repo_name: "repo1", type: "pr", iid: "002", title: "item32", actions: { request_review4: true } });

        let items = wiServices.merge(mod.items);
        assert.deepEqual(['item11', 'item21', 'item31'], items.map(a => a.title));
        assert.deepEqual(items[0].actions, { request_review1: true });
        assert.deepEqual(items[1].actions, { request_review2: true });
        assert.deepEqual(items[2].actions, { request_review3: true, request_review4: true });
    });

    it("Merge duplicates with follow-up action badges should preseve all values except dates", function () {
        // regular item before/after the follow-up, with this order
        // item1 follow-up2 follow-up1 item2
        let mod = new Model().setHeader("GitHub", "0-github", "", "");
        mod.addItem({ //item1
            repo_name: "repo1", type: "pr", iid: "001", title: "regular item 1", author: "me1", assignees: "you1",
            created_at: "2023-06-01", updated_at: "2023-06-10"
        });
        mod.addLastItemLabel("lbl1", "111111");
        mod.addItem({ //follow-up2
            repo_name: "repo2", type: "pr", iid: "002", title: "follow-up title 2", author: "", assignees: "",
            created_at: "2023-07-02", updated_at: "2023-07-02", actions: { follow_up: true }
        });
        mod.addItem({ //follow-up1
            repo_name: "repo1", type: "pr", iid: "001", title: "follow-up title 1", author: "", assignees: "",
            created_at: "2023-07-01", updated_at: "2023-07-01", actions: { follow_up: true }
        });
        mod.addItem({ //item2
            repo_name: "repo2", type: "pr", iid: "002", title: "regular item 2", author: "me2", assignees: "you2",
            created_at: "2023-06-02", updated_at: "2023-06-20"
        });
        mod.addLastItemLabel("lbl2", "222222");
        let items = wiServices.merge(mod.items);

        // expected change dates and add an action, independently of the order of merged items
        let expected1 = {
            uid: "repo1_pr_001",
            repo_name: "repo1", type: "pr", iid: "001", title: "regular item 1", author: "me1", assignees: "you1", labels: [{ name: "lbl1", color: "111111" }],
            created_at: "2023-07-01", updated_at: "2023-07-01", actions: { follow_up: true },
        };
        let expected2 = {
            uid: "repo2_pr_002",
            repo_name: "repo2", type: "pr", iid: "002", title: "regular item 2", author: "me2", assignees: "you2", labels: [{ name: "lbl2", color: "222222" }],
            created_at: "2023-07-02", updated_at: "2023-07-02", actions: { follow_up: true },
        };
        assert.deepEqual(expected1, mod.items[0]);
        assert.deepEqual(expected2, mod.items[1]);
    });

    it("Filter model items by contained label", function () {
        //filtered model fist/last, filtered label first/last, filtered label matches this/other provider,
        //no labels to filter, empty labels
        let mod = new Model().setHeader("GitHub", "0-github", "", "");
        mod.addItem({ repo_name: "repo1", type: "pr", iid: "001", title: "pr001-filtered" }); //first filtered & label
        mod.addLastItemLabel("lbl0", "000000");
        mod.addLastItemLabel("lbl1", "ffffff");
        mod.addItem({ repo_name: "repo2", type: "pr", iid: "002", title: "pr002-nofilter" });
        mod.addLastItemLabel("lbl1", "111111"); //matches other provider, do not filter
        mod.addItem({ repo_name: "repo1", type: "issue", iid: "003", title: "pr003-filtered" });
        mod.addLastItemLabel("lbl0", "000000"); //this provider, filter
        mod.addItem({ repo_name: "repo2", type: "issue", iid: "004", title: "pr004-nofilter" }); //emtpy labels
        mod.addItem({ repo_name: "repo1", type: "pr", iid: "005", title: "pr005-nofilter" }); //no labels to filter
        mod.addLastItemLabel("lbl9", "999999");
        mod.addItem({ repo_name: "repo2", type: "pr", iid: "006", title: "pr006-filtered" }); //last filtered & label
        mod.addLastItemLabel("lbl1", "ffffff");
        mod.addLastItemLabel("lbl0", "000000");
        let items = wiServices.filterBy("assigned", new Date(), 0, "lbl0", mod.items); //TODO use filter (requires config)
        let actual = items.map(a => a.title);
        assert.deepEqual(['pr002-nofilter', 'pr004-nofilter', 'pr005-nofilter'], actual);
    });

    it("Filter model items by age if non zero", function () {
        //age not set/updated<=age/upadted>age/created>age(no filter)
        //duplicate equal id, others different/different id, others equal (not filtered)
        //author: dependabot/dependa[bot]/other pr/issue
        let mod = new Model().setHeader("GitHub", "0-github", "", "");
        mod.addItem({ repo_name: "repo1", type: "pr", iid: "001", title: "pr001", updated_at: "2023-08-10", created_at: "2023-08-10" });
        mod.addItem({ repo_name: "repo1", type: "pr", iid: "002", title: "pr002", updated_at: "2023-08-02", created_at: "2023-08-10" });
        mod.addItem({ repo_name: "repo1", type: "pr", iid: "003", title: "pr003", updated_at: "2023-08-10", created_at: "2023-08-02" });
        let modStr = JSON.stringify(mod);

        let items = wiServices.filterBy("assigned", new Date("2023-08-10"), 8, "", JSON.parse(modStr).items);
        assert.deepEqual(['pr001', 'pr002', 'pr003'], items.map(a => a.title));
        items = wiServices.filterBy("assigned", new Date("2023-08-10"), 7, "", JSON.parse(modStr).items);
        assert.deepEqual(['pr001', 'pr003'], items.map(a => a.title));
        items = wiServices.filterBy("assigned", new Date("2023-08-10"), 0, "", JSON.parse(modStr).items);
        assert.deepEqual(['pr001', 'pr002', 'pr003'], items.map(a => a.title));
    });

    it("Filter dependabot authored only at unassigned target", function () {
        //author: dependabot/dependa[bot]/other, pr/issue(no filter), target=unassigned/other(no filter)
        let mod = new Model().setHeader("GitHub", "0-github", "", "");
        mod.addItem({ repo_name: "repo1", type: "branch", iid: "001", title: "pr001", author: "me" });
        mod.addItem({ repo_name: "repo1", type: "pr", iid: "002", title: "pr002", author: "dependabot[bot]" });
        mod.addItem({ repo_name: "repo2", type: "pr", iid: "003", title: "pr003", author: "me" });
        mod.addItem({ repo_name: "repo2", type: "pr", iid: "004", title: "pr004", author: "Dependabot" });
        mod.addItem({ repo_name: "repo3", type: "issue", iid: "005", title: "is005", author: "Dependabot" });
        let modStr = JSON.stringify(mod);

        let items = wiServices.filterBy("unassigned", new Date(), 0, "", JSON.parse(modStr).items);
        assert.deepEqual(['pr001', 'pr003', 'is005'], items.map(a => a.title));

        items = wiServices.filterBy("assigned", new Date(), 0, "", JSON.parse(modStr).items);
        assert.deepEqual(['pr001', 'pr002', 'pr003', 'pr004', 'is005'], items.map(a => a.title));
        items = wiServices.filterBy("statuses", new Date(), 0, "", JSON.parse(modStr).items);
        assert.deepEqual(['pr001', 'pr002', 'pr003', 'pr004', 'is005'], items.map(a => a.title));
    });

});