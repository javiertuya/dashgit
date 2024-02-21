import assert from 'assert';
import fs from "fs"
import { gitHubAdapter } from "../app/GitHubAdapter.js"

/**
 * Test the (GitHub) adapters taking as input the provider api response from an external file.
 * Test inputs are created by getting real data, removing unneeded fields
 * and customized to represent the test situations.
 */
describe("TestGitHubAdapter - Model transformations from GitHub API results", function () {

    //Rest API
    // - pr assigned, pr reviewer(not assigned), issue
    // - 0,1,2 assignees
    // - 0,1,2 labels
    // - >1 repo, >1 organization
    it("Transform GitHub REST API results", function () {
        let input = JSON.parse(fs.readFileSync("./input/github-rest-result1.json"));
        let provider = { provider: "GitHub", uid: "0-github", user: "usr1", url: 'https://github.com', api: 'https://api.github.com' };
        let actual = gitHubAdapter.workitems2model(provider, input);
        fs.writeFileSync("./actual/github-rest-model1.json", JSON.stringify(actual, null, 2)); //to allow extenal diff
        let expected = JSON.parse(fs.readFileSync("./expected/github-rest-model1.json"));
        assert.deepEqual(expected, actual);
    });

    //Rest API with actions: Same as before, but calling the method to add the actions and then the transformation
    it("Transform GitHub REST API results with actions", function () {
        let input = JSON.parse(fs.readFileSync("./input/github-rest-result1.json"));
        gitHubAdapter.addActionToPullRequestItems(input, "review_request");
        gitHubAdapter.addActionToPullRequestItems(input, "other_action");
        let provider = { provider: "GitHub", uid: "0-github", user: "usr1", url: 'https://github.com', api: 'https://api.github.com' };
        let actual = gitHubAdapter.workitems2model(provider, input);
        fs.writeFileSync("./actual/github-rest-model1-actions.json", JSON.stringify(actual, null, 2)); //to allow extenal diff
        let expected = JSON.parse(fs.readFileSync("./expected/github-rest-model1-actions.json"));
        assert.deepEqual(expected, actual);
    });

    // GraphQL API, basic (use a first repo: testrepo)
    // - pr open, branch (does not have associatedPullRequests)
    // - status success, failure, pending, not available (does not have History)
    //   combine success/not available for pr/branch
    // - title pr equal/different commit (if different uses pr title)
    // - pr dates!=commit dates (get pr dates)
    // Focus on other features (different repo: testrepo2)
    // - pr status OPEN(alredy covered)/CLOSED/other (any different to OPEN is managed as a branch)
    // - Status coverage of all statusCheckRollup values at: https://docs.github.com/en/graphql/reference/enums#statusstate (in dedicated test)
    it("Transform GitHub GraphQL API results", function () {
        let input = JSON.parse(fs.readFileSync("./input/github-graphql-result1.json"));
        let actual = gitHubAdapter.statuses2model({ provider: "GitHub", uid: "0-github", user: "usr1" }, input);
        fs.writeFileSync("./actual/github-graphql-model1.json", JSON.stringify(actual, null, 2)); //to allow extenal diff
        let expected = JSON.parse(fs.readFileSync("./expected/github-graphql-model1.json"));
        assert.deepEqual(expected, actual);
    });

    [
        { input: "ERROR", expected: "failure" },
        { input: "EXPECTED", expected: "pending" },
        { input: "FAILURE", expected: "failure" },
        { input: "PENDING", expected: "pending" },
        { input: "SUCCESS", expected: "success" }
    ].forEach(function (item) {
        it(`GitHub StatusCheckRollup state conversion: ${item.input} to ${item.expected}`, function () {
            assert.equal(item.expected, gitHubAdapter.transformStatus(item.input));
            assert.equal(item.expected, gitHubAdapter.transformStatus(item.input.toLowerCase()));
        });
    });

});