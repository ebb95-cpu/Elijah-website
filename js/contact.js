(function () {
  'use strict';
  var returnFocus;
  window.openSiteDialog = function (id) {
    var dialog = document.getElementById(id);
    returnFocus = document.activeElement;
    dialog.showModal();
    var input = dialog.querySelector('input, button');
    if (input) input.focus();
  };
  document.querySelectorAll('[data-dialog]').forEach(function (trigger) {
    trigger.addEventListener('click', function (event) {
      event.preventDefault(); window.openSiteDialog(trigger.dataset.dialog);
    });
  });
  document.querySelectorAll('.site-dialog').forEach(function (dialog) {
    dialog.querySelector('.dialog-close').addEventListener('click', function () { dialog.close(); });
    dialog.addEventListener('close', function () {
      document.getElementById('rbtn').click();
      if (returnFocus && returnFocus.isConnected) returnFocus.focus();
    });
  });
  var form = document.getElementById('contact-form');
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!form.reportValidity()) return;
    var fields = new FormData(form);
    if (fields.get('website')) return;
    var name = fields.get('name').trim();
    var company = fields.get('company').trim();
    var body = 'Name: ' + name + '\nCompany: ' + (company || 'Not provided') +
      '\nEmail: ' + fields.get('email').trim() + '\n\n' + fields.get('message').trim();
    var subject = 'Website inquiry from ' + name + (company ? ' - ' + company : '');
    var status = document.getElementById('contact-status');
    status.textContent = 'Finish sending in your email app. If no draft opens, use the email link below. Your message has not been sent by this website.';
    window.location.href = 'mailto:crushedcrib19@gmail.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  });
})();
