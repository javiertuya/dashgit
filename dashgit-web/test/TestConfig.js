//General notes:
//To execute from mocha under node, but source is ES6,
//requires to specify "type": "module" in package.json (both in tests and application)

//To execute from mocha in the browser, import js mocha and chai from node_modules
//and use chai.assert.* instead of assert.* (define a script in the html: let assert=chai.assert)
//Comment the 'assert' import as the imports are not modules

//Use mochawesome reporter that captures the detailed diffs when assert.deepEqual (same info than console)

import assert from 'assert';
import { config } from "../app/Config.js"

describe("TestConfig - Sanitizing config data", async function () {

    it("Set default config attributes when reading empty", function () {
        let expected = { version: 1, encrypted: false, statusCacheRefreshTime: 3600, statusCacheUpdateTime: 30, maxAge: 0, 
            enableCombinedUpdates: false, updateManagerRepo: "", updateManagerToken: "",
            providers: [] };
        assert.deepEqual(expected, config.parseAndSanitizeData(""));
        assert.deepEqual(expected, config.parseAndSanitizeData(null));
        assert.deepEqual(expected, config.parseAndSanitizeData(undefined));
    });

    it("Set default config attributes to GitHub provider", function () {
        let expected = {
            version: 1,
            encrypted: false, statusCacheRefreshTime: 3600, statusCacheUpdateTime: 60, maxAge: 0,
            enableCombinedUpdates: false, updateManagerRepo: "", updateManagerToken: "",
            providers: [{
                provider: 'GitHub', uid: '', user: '', token: '', enabled: true,
                url: 'https://github.com', api: 'https://api.github.com',
                enableNotifications: true,
                filterIfLabel: '', unassignedAdditionalOwner: [], dependabotAdditionalOwner: [],
                updates: { tokenSecret: "", userEmail: "" },
                graphql: { ownerAffiliations: ['OWNER'], maxProjects: 20, maxBranches: 10 }
            }]
        };
        assert.deepEqual(expected, config.parseAndSanitizeData(`{ "statusCacheUpdateTime": 60, "providers": [{"provider":"GitHub"}] }`));
    });

    it("No attributes are overriden by defaults if already set", function () {
        let expected = {
            version: 1,
            encrypted: false, statusCacheRefreshTime: 3600, statusCacheUpdateTime: 30, maxAge: 0,
            enableCombinedUpdates: false, updateManagerRepo: "", updateManagerToken: "",
            providers: [{
                provider: 'GitHub', uid: 'repo_user_id', user: 'user', token: 'XXXXXXXXXXXX', enabled: false,
                url: 'https://github.com', api: 'https://api.github.com',
                enableNotifications: true,
                filterIfLabel: 'lbl', unassignedAdditionalOwner: [], dependabotAdditionalOwner: ["org1", "org2"],
                updates: { tokenSecret: "DASHGIT_GITHUB_USER_TOKEN", userEmail: "" },
                graphql: { ownerAffiliations: ['OWNER', 'ORGANIZATION_MEMBER'], maxProjects: 10, maxBranches: 20 }
            }]
        };
        assert.deepEqual(expected, config.parseAndSanitizeData(JSON.stringify(expected)));
    });

});