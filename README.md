[![Status](https://github.com/javiertuya/dashgit/actions/workflows/test.yml/badge.svg)](https://github.com/javiertuya/dashgit/actions)
[![Run DashGit](https://img.shields.io/badge/%20-Run_DashGit-orange)](https://javiertuya.github.io/dashgit)

# DashGit - A Dashboard for GitHub and GitLab repos

This dashboard provides a consolidated view of your latest work items 
(open issues, pull requests, review requests, branches, dependabot updates) 
along with build statuses and notifications for multiple GitHub and GitLab repositories.

It works entirely in the browser and is hosted on the GitHub Pages of this repo at
[https://javiertuya.github.io/dashgit](https://javiertuya.github.io/dashgit).
The only data sent outside of the browser is the
required to request the repositories to get your work items.

This is an example view of DashGit configured to manage two GitHub and one GitLab repositories:

![dashgit-image](dashgit-web/app/assets/image.png "DashGit image")

## Quick Start

To start, enter into DashGit at [https://javiertuya.github.io/dashgit](https://javiertuya.github.io/dashgit),
go to the Configure tab and specify a GitHub provider by setting your username and an access token.
You can omit the token, but this is subject to lower rate limits and does not allow you to view the branches tab, build statuses and notifications.

The configuration is stored in the local browser memory. 
To protect the tokens you can encrypt them with a password that will be requested when you open a new DashGit browser tab.

## Features and Configuration

The different *views* (tabs) shown in the UI display the open *work items* (issues, pull requests, etc.) in a collapsible panel for each *provider*.
A provider is defined by a repository type (GitHub, GitLab), an *user* and an access *token* to authenticate the requests. 
You can define any combination (e.g. providers with the same username but different token, or different username but same token).

### Api acces token encryption
As mentioned before, the configuration is stored in the browser local memory and all processing occours in the browser.
To protect sensistive information (the access tokens) the user is given the option to encrypt the tokens using a password.
If you set a password, the next time that you open DashGit you will be asked for the password.

If you forgot the password, you are given with the option of skip. In that case you may notice that api calls fail, you should go
to the configuration to reset the tokens to an empty value.
Note that once a token is encrypted, you can't decrypt it, only reset.

### Selecting, sorting and grouping
The user can customize how the work items are sorted and organized by setting the controls that appear at the top of the header.
This settings are no stored in the configuration.

### Scope configuration
The username is the reference user for which the work items are displayed (assigned to, created by, etc.)
and the token defines the scope of the request that determines what items are displayed.
Note that the username can be someone other the token owner.

- The scope of Assigned, Involved and Created views is whatever repository visible for the token.
- The scope of Unassigned and Dependabot views is restricted to the repository of the token owner. 
  If you need include other users or organizations, you must include them in the `Add owners to unassigned`
  or `Add owners to dependabot` parameters, respectively.
- The scope of Branches view is handled differently, as data is obtained by the GraphQL API requests insetead of the REST API.
  On GitHub you will specify one or more than the following scopes: OWNER, ORGANIZATION_MEMBER or COLLABORATOR.

### Filtering
The requests made against the repositories get the most recent work items that fit on a single response page,
that is enough for the most common use case to display the open work items regarding the user.
Moreover the data displayed can be restricted by setting any of the following parameters:
- `Max age`: Filters out the work items that are older than the days specified.
- `Filter if Label`: Filters out the work items that contain the label specified.

### Status cache
Requests to the GraphQL API to get the branches and build statuses are expensive if they retrieve data
from many repositories and are subject to more restrictive rate limits than REST API.
To mitigate potential problems with API rate limits and improve the UI response times, these calls are cached and managed
by two parameters (measured in seconds):
- `Status Cache Update Time`: During this period, any call to get statuses returns the cached data.
  This is to avoid making API calls when the user moves from a view to another in a short period of time.
  When this period of time expires, the cache will be incrementally updated by requesting 
  data only from the latest updated projects.
- `Status Cache Refresh Time`: It specifies a much longer period than `Status Cache Update Time`.
  When this period of time expires, the cache is fully refreshed.

## Contributing

This repository follows the general contribution policies and guidelines at the giis-uniovi org:
[CONTRIBUTING.md](https://github.com/giis-uniovi/.github/blob/main/profile/CONTRIBUTING.md)

If you plan to make any contribution, please, first create an issue to discuss the approach before starting development.
