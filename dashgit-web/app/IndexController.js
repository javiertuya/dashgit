import { config } from "./core/Config.js"
import { login } from "./login/Login.js"
import { loginController } from "./login/LoginController.js"
import { tokens } from "./login/Tokens.js"
import { wiView } from "./WiView.js"
import { wiController } from "./WiController.js"
import { wiControllerUpdate } from "./WiControllerUpdate.js" // NOSONAR to install jquery events
import { wiControllerFollowUp } from "./WiControllerFollowUp.js" // NOSONAR to install jquery events
import { configController } from "./ConfigController.js"

/**
 * Manages the top level elements visibility and actions (header and tabs).
 * Enters sequentially in one of three modes (that acctivate/deactivate elements in the UI depending on the authentication for configuration.
 * - patLoginMode: a simpler view to set the password before entering de application, used when the access tokens are encrypted with a password
 * - oauthLoginMode: to control the authentication of providers that require OAuth2 login and view the progress.
 *   If there is a provider that needs login, it calls the Login moduleController to handle the authorization request or the callback.
 *   Page can reenter loading several times until finishes all logins
 * - workMode: the main mode, with all elements visible. Performs the initial update and render of all work items.
 */

//In patLoginMode mode, enter and validate password
$(document).on('click', '#inputPasswordButton', function (e) {
  if ($('#inputPassword').val().length > 0) {
    const secret = $("#inputPassword").val();
    if (tokens.isValidPassword(config.data.providers, secret)) {
      tokens.setPatSecret(secret);
      indexController.start();
    } else {
      $('#inputPassword')[0].setCustomValidity("Password does not match with the one used to encrypt the access tokens");
      $('#inputPassword')[0].reportValidity();
    }
  } else {
    $('#inputPassword')[0].setCustomValidity("Enter you password");
    $('#inputPassword')[0].reportValidity();
  }
  $(this).closest("form")[0].reset();
  e.preventDefault()
});

$(document).on('click', '#inputSkipButton', function (e) {
  indexController.start();
  $(this).closest("form")[0].reset();
  e.preventDefault()
});

// click on a tab to change view
$('button[data-bs-toggle="tab"]').on('shown.bs.tab', async function (e) {
  const target = $(this).attr("aria-controls");
  await indexController.tabControlEntering(target);
});

$(document).on('click', '#reloadIcon', async function () {
  await indexController.reload();
});
$(document).on('change', '#inputSort', async function () {
  indexController.saveMainFilterState();
  indexController.updateAndRender();
});
$(document).on('change', '#checkGroup', async function () {
  indexController.saveMainFilterState();
  indexController.updateAndRender();
});
$(document).on('change', '#inputStatus', async function () {
  indexController.saveMainFilterState();
  wiView.updateStatusVisibility();
});
$(document).on('click', '#mainFilterDefaults', async function (e) {
  // override main filters to defaults and redisplays
  config.data.viewFilter.main = {};
  config.setMainFilterDefaults(config.data);
  config.save();
  indexController.updateAndRender();
  e.preventDefault();
});
$(document).on('click', '#oauth-reset-btn', async function () {
  login.removeFailedTokens();
  globalThis.location.href = "./"
});
$(document).on('click', '.accordion-button', function () {
  wiView.saveStatePanel($(this).attr('id'), $(this).attr('aria-expanded'))
});
// Generic view header to perform additional filtering, 
// included here instead of wiController because behaviour is common for several views and causes rendering
$(document).on('change', '.wi-view-filter-clickable', async function () {
  wiView.saveViewFilterState();
  indexController.updateAndRender();
});
// Generic view header to perform additional filtering with text input (search, exclude)
// Changes update the view dynamically without rendering again
// The current text persists in the configuration (main and view filters)
$(document).on('keyup', '.wi-view-filter-input', async function () { // on typing
  indexController.saveMainFilterState();
  wiView.updateStatusVisibility();
  wiView.saveViewFilterState();
});
$(document).on('search', '.wi-view-filter-input', async function () { // clearing the input with the cross button
  indexController.saveMainFilterState();
  wiView.updateStatusVisibility();
  wiView.saveViewFilterState();
});

const LAST_TAB = "dashgit-config-last-selected-tab"; // Store: last selected tab in the UI
const indexController = {

  // Main entry point invoked from index.html
  load: async function() {
    config.loadFeatureFlags();
    config.load();

    // Token decryption if applicable, 
    $("#appVersion").text(config.appVersion);
    if (config.data.encrypted && tokens.getPatSecret() == "") { 
      // A simpler view to set the password before entering the application
      indexController.patLoginMode();
      return;
    }

    // Ignore rest of page load if the feature flag 'disableoa' is enabled to have the posibility 
    // of entering into the configuration tab to fix wrong configs
    if (config.ff["disableoa"]) {
      indexController.start();
      return;
    }

    // Handle the callback in the OAuth2 flow for the current provider that is being set
    // Errors where written in the UI to let the user the opportunity of accknowledge the message and continue
    const params = new URLSearchParams(globalThis.location.search);
    const app = params.get("oapp")
    if (app) {
      indexController.oauthLoginMode(); // to show how the callback process is going on
      const callbackResult = await loginController.handleCallbackFromApp(app);
      if (callbackResult.error)
        return; // To acknowledge and continue (reload)
      // if everything ok for this provider, flow continues to get the next provider to log in
    }

    // Handle the request for authorization in the OAUth2 flow for the first provider that has not been already set
    indexController.oauthLoginMode(); // to show how the login process is going on
    const loginResult = await loginController.handleLoginOnLoad();
    if (loginResult.error || !loginResult.completed)
       return; // to wait for the callback or acknowledge and continue (reload)

    //Login procedure is finished, sets work mode and starts everything
    indexController.start();

    // Before finish, display permantent error message to show the providers that failed login and let the use retry
    if (!config.ff["disableoa"] && loginResult.failed) {
       console.log(loginResult.failed);
      $("#oauth-reset-message").text(loginResult.failed
        + " Please check the configuration or switch back to PAT authentication and retry.");
      $("#oauth-reset").show();
    } else {
      $("#oauth-reset-message").text("");
      $("#oauth-reset").hide();
    }
  },

  start: function() {
    $('[data-toggle="tooltip"]').tooltip({trigger:"hover", delay:600});
    wiController.reset(true);
    indexController.workMode();
    indexController.tabControlSelectLastOrDefault("assigned");
    // Do not need render because the entry event in the target tab already does it
  },
  reload: async function() {
    wiController.reset(false);
    await indexController.updateAndRender();
  },

  // Entering event executes when tab changes, either by user click or programmatically
  // Stores in the tab name in session to allow restoring it after a reload, and performs the update and rendering of the target tab
  tabControlEntering: async function (target) {
    console.log("*** Entering tab " + target);
    const lastTarget = sessionStorage.getItem(LAST_TAB);
    // Target is updated and rendered with one exception: when last selected tab is config, we need a full reload because
    // the configuration may have changed authentication or provider settings.
    if (lastTarget == "config" && target != "config") {
      sessionStorage.setItem(LAST_TAB, target); // to reload the target tab, not the last target
      globalThis.location.reload();
    } else {
      await indexController.updateAndRender();
    }
    sessionStorage.setItem(LAST_TAB, target);
  },
  // Select a tab programmatically, this triggers tabControlEntering
  tabControlSelect: async function (target) {
    console.log("*** Selecting tab " + target);
    const bsTab = new bootstrap.Tab("#" + target + "-tab");
    bsTab.show()
  },
  // if there is a lastTarget stored, select it, otherwise select the default target
  tabControlSelectLastOrDefault: async function (defaultTarget) {
    const lastTarget = sessionStorage.getItem(LAST_TAB);
    console.log("*** Selecting last tab, default " + defaultTarget + " last target " + lastTarget);
    this.tabControlSelect(lastTarget || defaultTarget);
  },

  // Manages the main filters that have persist in config
  renderMainFilters: function() {
    $("#inputStatus").val(config.data.viewFilter.main.status);
    $("#inputFilterRepoInclude").val(config.data.viewFilter.main.search);
    $("#inputSort").val(config.data.viewFilter.main.sort);
    $("#checkGroup").prop("checked", config.data.viewFilter.main.group);
  }, 
  saveMainFilterState: function() {
    config.data.viewFilter.main.status = $("#inputStatus").val();
    config.data.viewFilter.main.search =  $("#inputFilterRepoInclude").val();
    config.data.viewFilter.main.sort = $("#inputSort").val();
    config.data.viewFilter.main.group = $("#checkGroup").is(":checked");
    config.save();
  },

  //Info to updat in the view depends on the selected tab, calls the appropriate controller to 
  //generate the contents of target and update the UI in the appropriate tab
  updateAndRender: async function () {
    wiView.resetAlerts();
    if (config.appUpdateEvent())
      wiView.renderAlert("info", `Dashgit version has been updated to ${config.appVersion}. See the release notes at <a target="_blank" href="https://github.com/javiertuya/dashgit/releases">https://github.com/javiertuya/dashgit/releases</a>`);

    indexController.renderMainFilters();
    let target = $(".nav-link.active").attr("aria-controls");
    if (target == "config")
      configController.updateMainTarget();
    else {
      // Token renewal must be done here before dispatching and rendering because there are no page loads when switching form tabas
      await login.refreshTokensForAllProviders();
      wiController.updateTarget(target, $("#inputSort").val()); //display work items for the indicated target, with sort criterion
    }
  },

  clearMode: function () {
    $("#header-content").hide();
    $("#header-authentication").hide();
    $("#inputPassword").hide();
    $("#oauth-reset").hide();
    $("#oauth-content").hide();
    $("#tab-headers").hide();
    $("#tab-content").hide();
  },
  workMode: function () {
    this.clearMode();
    $("#header-content").show();
    $("#tab-headers").show();
    $("#tab-content").show();
  },
  patLoginMode: function () {
    this.clearMode();
    $("#header-authentication").show();
    $("#inputPassword").show();
    $("#inputPassword").focus();
  },
  oauthLoginMode: function () {
    this.clearMode();
    $("#oauth-content").show();
  },

}
export { indexController };
