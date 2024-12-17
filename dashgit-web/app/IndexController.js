import { config } from "./Config.js"
import { wiView } from "./WiView.js"
import { wiController } from "./WiController.js"
import { wiControllerUpdate } from "./WiControllerUpdate.js" // NOSONAR to install jquery events
import { wiControllerFollowUp } from "./WiControllerFollowUp.js" // NOSONAR to install jquery events
import { configController } from "./ConfigController.js"

/**
 * Manages the top level elements visibility and actions (header and tabs).
 * Enters one of two modes depending on the token encription configuration.
 * 
 * Note: The index.html cannot import this module with src, on chromium causes this error:
 * Error with Permissions-Policy header: Origin trial controlled feature not enabled: 'interest-cohort'.
 * Solution is to define an inline module in index.html that initializes jquery and imports this controller
 */

//In login mode, enter and validate password
$(document).on('click', '#inputPasswordButton', function (e) {
  if ($('#inputPassword').val().length > 0) {
    config.xtoken = $("#inputPassword").val();
    if (config.isValidPassword(config.data.providers, config.xtoken)) {
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

$('button[data-bs-toggle="tab"]').on('shown.bs.tab', async function (e) {
  indexController.render();
});

$(document).on('click', '#reloadIcon', async function () {
  indexController.reload();
});
$(document).on('change', '#inputSort', async function () {
  indexController.render();
});
$(document).on('change', '#checkGroup', async function () {
  indexController.render();
});
$(document).on('change', '#inputStatus', async function () {
  wiView.updateStatusVisibility();
});
$(document).on('keyup', '#inputFilterRepo', async function () {
  wiView.updateStatusVisibility();
});
$(document).on('search', '#inputFilterRepo', async function () {
  wiView.updateStatusVisibility();
});
$(document).on('click', '.accordion-button', function () {
  wiView.saveStatePanel($(this).attr('id'), $(this).attr('aria-expanded'))
});
// Generic view header to perform additional filtering, 
// included here instead of wiController because behaviour is common for several views and causes rendering
$(document).on('change', '.wi-view-filter-clickable', async function () {
  let target = $(".nav-link.active").attr("aria-controls");
  // set values to the filters that have the corresponding element in the UI
  if ($(`#wi-view-filter-${target}-authorMe`).length > 0)
    config.session.viewFilter[target].authorMe = $(`#wi-view-filter-${target}-authorMe`).is(':checked');
  if ($(`#wi-view-filter-${target}-authorOthers`).length > 0)
    config.session.viewFilter[target].authorOthers = $(`#wi-view-filter-${target}-authorOthers`).is(':checked');
  if ($(`#wi-view-filter-${target}-compact`).length > 0)
    config.session.viewFilter[target].compact = $(`#wi-view-filter-${target}-compact`).is(':checked');
  indexController.render();
});

const indexController = {

  // Initial configuration to be run by jquery on document ready
  load: function() {
    config.loadFeatureFlags();
    config.load();
    $("#appVersion").text(config.appVersion);
    if (config.data.encrypted) {
      indexController.loginMode();
    } else {
      indexController.start();
    }
    $('[data-toggle="tooltip"]').tooltip({trigger:"hover", delay:600});
  },
  start: function() {
    wiController.reset(true);
    indexController.workMode();
    indexController.render();
  },
  reload: function() {
    wiController.reset(false);
    indexController.render();
  },

  //Rendering depends on the selected tab, calls the appropriate controller to update the UI
  render: function () {
    wiView.resetAlerts();
    if (config.appUpdateEvent())
      wiView.renderAlert("info", `Dashgit version has been updated to ${config.appVersion}. See the release notes at <a target="_blank" href="https://github.com/javiertuya/dashgit/releases">https://github.com/javiertuya/dashgit/releases</a>`);

    let target = $(".nav-link.active").attr("aria-controls");
    if (target == "config")
      configController.updateMainTarget();
    else
      wiController.updateTarget(target, $("#inputSort").val()); //display work items for the indicated target, with sort criterion
  },
  workMode: function () {
    $("#header-content").show();
    $("#header-authentication").hide();
    $("#tab-headers").show();
    $("#tab-content").show();
  },
  loginMode: function () {
    $("#header-content").hide();
    $("#header-authentication").show();
    $("#inputPassword").focus();
    $("#tab-headers").hide();
    $("#tab-content").hide();
  },

}
export { indexController };
