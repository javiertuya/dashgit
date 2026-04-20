/**
 * Performs custom bootstrap validation of the config UI.
 * 
 * Bootstrap validation with was-validated in the form is immediate, but modifies all styling in valid fields and 
 * adds unnecesary checks. This module performs something similar, but keeping the styles: Controls the change events and 
 * sets the custom validity (to remove html5 messages) and the attribute is-invalid to the inputs (to add bootstrap message).
 * 
 * This works well, but because of everything is inside col-auto divs, the error messages enlarge the inputs by a length 
 * equal to the message length. To avoid this, we get rid of the bootstrap invalid-feedback divs and instead we place a div 
 * outside the input group and control the hide and display transitions
 */
const configValidation = {

  // Prepares all validation of inputs. Called after render, at load or when a new provider is added
  // Note: Requires the form have novalidate to override the defaults and allow this customization
  installValidation: function () {
    const form = $("#config-form");

    // Reset al validation states and performs the initial validation

    form.find("input").each(function () {
      const input = $(this);
      input[0].setCustomValidity("");   // clean HTML5 state
      input.removeClass("is-invalid");  // clean bootstrap visual state
    });
    form.find("input").each(function () {
      configValidation.validateInput($(this));
    });

    // Install validation events when every input changes
    form.off("keyup", "input"); // avoid duplicates
    form.on("keyup", "input", function () {
      configValidation.validateInput($(this));
    });
  },

  // Central point to process the validation of each input
  validateInput: function (input) {

    // Special validation of match criterion inputs. These fields are not required, but the markup
    // includes pattern=".*" to activate the html5 control of validation that prevents the form be submitted if no valid
    if (input.attr("id").startsWith("config-providers-match-user-") || input.attr("id").startsWith("config-providers-match-org-")) {
      this.validateMatchCriterion(input);
      return;
    }

    // General purpose validation according to the html5 validation indicated in the markup, only if there is a validation in html
    const hasRulesToValidate = input.prop("required") || input.attr("pattern")
      || input.attr("minlength") || input.attr("maxlength") || input.attr("min") || input.attr("max");
    if (!hasRulesToValidate)
      return;

    // Evitar mensajes HTML5
    //input[0].setCustomValidity("");

    // 1) Special case to consider blank spaces as empty (that html5 considers as non empty)
    if (input.val().trim() === "") {
      this.setInputValidation(input, false);
      return;
    }

    // 2) HTML5 validation
    input[0].setCustomValidity(""); // reset
    this.setInputValidation(input, input[0].checkValidity());
  },

  setInputValidation: function (input, valid) {
    if (valid) {
      input[0].setCustomValidity(""); // valid, html5 validation
      input.removeClass("is-invalid"); // valid, hide bootstrap validation message
      input.parent().next().addClass("d-none"); // replacement of the invalid-feedback bootstrap div
    } else {
      input[0].setCustomValidity(" "); // considers invalid, but without html5 message
      input.addClass("is-invalid");
      input.parent().next().removeClass("d-none");
    }
  },

  // Inputs that change the visibility state require calling the below methods on hide/show, respectively.
  // Currently, the validation attribute is not parametrized, only required is supported
  onHideUninstallValidation: function (input) {
    input.removeAttr('required');
    input.removeClass('is-invalid');
    // This is specially important to prevent messages like "An invalid form control with name='' is not focusable"
    // that are difficut to debug: When the object is hidden with an error message the html5 errors must be cleared
    // to allow submitting the form even if the hidden value is invalid
    input[0].setCustomValidity("");
  },
  onShowInstallValidation: function (input) {
    input.attr('required', '');
    this.validateInput(input);
  },

  // Special validation of match criterion with several related inputs
  validateMatchCriterion: function (input) {
    const id = input.attr("id").split("-").at(-1); // last item in array
    const criterion = $("#config-providers-match-criterion-" + id).val();
    const users = $("#config-providers-match-user-" + id);
    const orgs = $("#config-providers-match-org-" + id);
    const usersVal = users.val().trim();
    const orgsVal = orgs.val().trim();

    if (criterion == "exclude") { // this has not restrictions
      this.setInputValidation(users, true);
      this.setInputValidation(orgs, true);
      return;
    }
    // Only a single input with only one value (without spaces)
    if (usersVal != "" && orgsVal != "") {
      this.setInputValidation(users, false);
      this.setInputValidation(orgs, false);
    } else if (usersVal != "" && usersVal.split(" ").length > 1) {
      this.setInputValidation(users, false);
      this.setInputValidation(orgs, true);
    } else if (orgsVal != "" && orgsVal.split(" ").length > 1) {
      this.setInputValidation(users, true);
      this.setInputValidation(orgs, false);
    } else {
      this.setInputValidation(users, true);
      this.setInputValidation(orgs, true);
    }
  },

}

export { configValidation };
