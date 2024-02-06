import { config } from "./Config.js"
import { wiController } from "./WiController.js"
import { wiView } from "./WiView.js"
import { configView } from "./ConfigView.js"

/**
 * Manages the dialog at the config tab
 */
$(document).on('click', '#inputEncryptButton', function (e) {
  if ($('#inputEncryptPassword').val().length > 0) {
    config.xtoken = $("#inputEncryptPassword").val();
    config.data.encrypted = true;
    config.encryptTokens(config.data.providers, config.xtoken);
    config.save();
    $(this).closest("form")[0].reset();
    e.preventDefault()
    configController.updateTab();
  } else {
    $('#inputEncryptPassword')[0].setCustomValidity("Please, enter a password to encrypt the token");
    $('#inputEncryptPassword')[0].reportValidity();
    $(this).closest("form")[0].reset();
    e.preventDefault()
  }
});

$(document).on('click', '#inputDecryptButton', function (e) {
  for (let provider of config.data.providers)
    provider.token = "";
  config.data.encrypted = false;
  config.save();
  configController.updateTab();
  e.preventDefault();
});

$(document).on('click', '#buttonConfigSave', function () {
  console.log("Save config");
  try {
    config.updateFromString($("#configJson").val());
    configController.updateTab();
    //to have a refresh effect when changing later to another tab
    wiController.reset(true);
    wiView.reset();
  } catch (error) {
    wiView.renderAlert("danger", error);
  }
});

const configController = {
  updateTab: function () {
    configView.render();
    if (config.data.encrypted)
      this.encryptedMode();
    else
      this.decryptedMode();

    //Display message if any GitHub provider does not specify token.
    $("#config-unauthenticated-message").hide();
    for (let provider of config.data.providers)
      if (provider.provider == "GitHub" && provider.token == "")
        $("#config-unauthenticated-message").show();
  },
  encryptedMode: function () {
    $("#config-encrypt").hide();
    $("#config-decrypt").show();
  },
  decryptedMode: function () {
    $("#config-encrypt").show();
    $("#config-decrypt").hide();
  }

}

export { configController };
