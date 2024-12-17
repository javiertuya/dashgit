import assert from 'assert';
import fs from "fs"
import { gitHubAdapter } from "../app/GitHubAdapter.js"

beforeEach(function() {
    if (!fs.existsSync("actual")){
        fs.mkdirSync("actual");
    }});

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

    //Data about follow ups is stored in the manager repository, but it is transformed to models as it if where from the GitHub api
    it("Transform GitHub Follow up results from GitStoreApi", function () {
        let input = JSON.parse(fs.readFileSync("./input/gitstore-follow-up-result.json"));
        let provider = { provider: "GitHub", uid: "0-github", user: "usr1", url: 'https://github.com', api: 'https://api.github.com' };
        let actual = gitHubAdapter.workitems2model(provider, input.followUp);
        fs.writeFileSync("./actual/gitstore-follow-up-github-model.json", JSON.stringify(actual, null, 2)); //to allow extenal diff
        let expected = JSON.parse(fs.readFileSync("./expected/gitstore-follow-up-github-model.json"));
        assert.deepEqual(expected, actual);
    });

    // GraphQL API
    [
        // Basic (use a first repo: testrepo), deprecated version V1
        // - pr with branch (63), branch without PR (develop)
        // - all pr statuses: success, failure, pending, not available (63 61 60 59)
        // - branch without PR statuses: only existing (develop) and not available (main)
        // - title pr equal (63)/different (64) of commit (if different uses pr title)
        // - pr dates!=commit dates (all)
        // Focus on other features (different repo: testrepo2)
        // - pr status OPEN(alredy covered)/CLOSED(79)/other(78) (any different to OPEN is managed as a branch)
        { input: "github-graphql-result1.json", expected: "github-graphql-model1.json", graphqlV2: false },

        // Version V2. Uses the same expected model than the previous,
        // but the input is adapted to have the PRs as siblings of the branches
        { input: "github-graphqlV2-result1.json", expected: "github-graphql-model1.json", graphqlV2: true },

        // PR from a fork (baseRepo!=headRepo -> branchUrl is at the forked repo (head) and branchName with fork icon)
        // - no matching branch (fork20)
        // - matching branch by name and title (match20) with PR in my repo (match20) -> show PR and branch
        { input: "github-graphqlV2-result2.json", expected: "github-graphql-model2.json", graphqlV2: true },
    ].forEach(function (item) {
        it(`Transform GitHub GraphQL API results from ${item.input}`, function () {
            let input = JSON.parse(fs.readFileSync(`./input/${item.input}`));
            let actual = gitHubAdapter.statuses2model({ provider: "GitHub", uid: "0-github", user: "usr1" }, input, item.graphqlV2);
            fs.writeFileSync(`./actual/${item.expected}`, JSON.stringify(actual, null, 2)); //to allow extenal diff
            let expected = JSON.parse(fs.readFileSync(`./expected/${item.expected}`));
            assert.deepEqual(expected, actual);
        });
    });

    // Matching Status coverage of 
    // - all statusCheckRollup values at: https://docs.github.com/en/graphql/reference/enums#statusstate
    // - not defined or not matching any value
    [
        { input: null, expected: "notavailable" },
        { input: undefined, expected: "notavailable" },
        { input: "XXXXX", expected: "notavailable" },
        { input: "ERROR", expected: "failure" },
        { input: "EXPECTED", expected: "pending" },
        { input: "FAILURE", expected: "failure" },
        { input: "PENDING", expected: "pending" },
        { input: "SUCCESS", expected: "success" }
    ].forEach(function (item) {
        it(`GitHub StatusCheckRollup state conversion: ${item.input} to ${item.expected}`, function () {
            assert.equal(item.expected, gitHubAdapter.transformStatus(item.input));
            assert.equal(item.expected, gitHubAdapter.transformStatus(item.input??"".toLowerCase()));
        });
    });

});