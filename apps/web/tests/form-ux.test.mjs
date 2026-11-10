import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { installFormUX, prepareModalUX } from '../src/form-ux.js';
import { bindAccountValidation, emailError } from '../src/account-validation.js';

function fixture(markup) {
  const {document,window} = parseHTML(`<html><body>${markup}</body></html>`);
  const form = document.querySelector('form');
  // linkedom supplies the DOM; emulate the native constraint interface only.
  for (const field of document.querySelectorAll('input,select,textarea')) {
    let custom = '';
    Object.defineProperties(field, {
      form: {value:form}, willValidate: {value:true},
      required: {get:()=>field.hasAttribute('required'),set:value=>field.toggleAttribute('required',value)},
      validity: {get:()=>({customError:Boolean(custom),valid:!custom && (!field.required || Boolean(field.value))})},
      validationMessage: {get:()=>custom || (field.required && !field.value ? 'Please fill out this field.' : '')}
    });
    field.setCustomValidity = value => { custom = value; };
    field.reportValidity = () => field.validity.valid;
    field.focus = () => { field.focused = true; };
  }
  installFormUX(form);
  const fire = (node,type) => node.dispatchEvent(new window.Event(type,{bubbles:true,cancelable:true}));
  return {document,form,fire};
}

test('spaces cannot submit a required field, and correcting it clears linked inline feedback', () => {
  const {document,form,fire} = fixture('<form><label>Name<input name="name" required value="   "></label><button>Save</button></form>');
  const field = document.querySelector('input'); let saves = 0;
  form.onsubmit = () => saves++;
  assert.equal(fire(form,'submit'),false);
  assert.equal(saves,0); assert.equal(field.focused,true);
  assert.equal(field.getAttribute('aria-invalid'),'true');
  assert.match(document.getElementById(field.getAttribute('aria-describedby')).textContent,/spaces alone/);
  field.value='Maria'; fire(field,'input');
  assert.equal(field.hasAttribute('aria-invalid'),false);
  assert.equal(document.querySelector('.field-error').hidden,true);
  fire(form,'submit'); assert.equal(saves,1);
});

test('domain validation survives shared validation and QR requires a reference while cash does not', () => {
  const {document,form,fire} = fixture('<form><label>Method<select name="paymentMethod"><option value="QR" selected>QR</option><option value="CASH">Cash</option></select></label><label>Reference<input name="reference"></label></form>');
  const reference=document.querySelector('input'),method=document.querySelector('select');
  assert.equal(fire(form,'submit'),false); assert.equal(reference.required,true);
  reference.value='ABC123'; reference.setCustomValidity('This reference was already used.');
  fire(reference,'input'); assert.equal(reference.validationMessage,'This reference was already used.');
  reference.setCustomValidity(''); reference.value='';
  method.querySelector('option[value=QR]').removeAttribute('selected');
  method.querySelector('option[value=CASH]').setAttribute('selected','');
  fire(method,'change'); assert.equal(reference.required,false);
  assert.equal(fire(form,'submit'),true);
});

test('modal preparation is idempotent and keeps Cancel and Back while removing redundant Close', () => {
  const {document}=parseHTML('<html><body><dialog><div class="modal-heading"><button id="close-modal">×</button></div><form><label>Full name<input required><small>As shown on the ID</small></label><div class="form-actions"><button data-close>Close</button><button data-close>Cancel</button><button data-close>Back</button></div></form></dialog></body></html>');
  const modal=document.querySelector('dialog'); prepareModalUX(modal); prepareModalUX(modal);
  assert.equal(modal.querySelectorAll('.field-label').length,1);
  const buttons=[...modal.querySelectorAll('[data-close]')];
  assert.equal(buttons[0].hidden,true); assert.equal(buttons[1].hidden,false); assert.equal(buttons[2].hidden,false);
  assert.equal(modal.querySelector('input').getAttribute('aria-required'),'true');
  assert.equal(modal.querySelector('small').textContent,'As shown on the ID');
});

test('fields bound with account validation do not produce duplicate field-error elements', () => {
  const {document,form,fire} = fixture('<form><label for="email">Email address</label><input id="email" name="email" type="email" required></form>');
  const emailInput = document.querySelector('#email');
  bindAccountValidation(form, { email: emailError });
  emailInput.value = 'rentandplay@ gmail.com';
  fire(emailInput, 'input');
  let errors = document.querySelectorAll('.field-error');
  assert.equal(errors.length, 1, 'Only one field-error element should exist');
  assert.equal(errors[0].textContent, 'Email addresses cannot contain spaces.');
  assert.equal(errors[0].hidden, false);

  // Submitting the form must not generate a duplicate error from form-ux either
  fire(form, 'submit');
  errors = document.querySelectorAll('.field-error');
  assert.equal(errors.length, 1, 'Still only one field-error element after submit');
  assert.equal(errors[0].textContent, 'Email addresses cannot contain spaces.');

  emailInput.value = 'rentandplay@gmail.com';
  fire(emailInput, 'input');
  assert.equal(document.querySelectorAll('.field-error').length, 1);
  assert.equal(errors[0].hidden, true);
});

test('switching form controls immediately clears stale errors on fields that become valid or ineligible', () => {
  const {document,form,fire} = fixture('<form><label>Method<select name="paymentMethod"><option value="QR" selected>QR</option><option value="CASH">Cash</option></select></label><label>Reference<input name="reference"></label></form>');
  const reference = document.querySelector('input');
  const method = document.querySelector('select');

  // Submit to trigger required error on reference
  fire(form, 'submit');
  assert.equal(reference.getAttribute('aria-invalid'), 'true');
  const errorEl = document.querySelector(`[data-field-error="${reference.dataset.uxField}"]`);
  assert.ok(errorEl);
  assert.equal(errorEl.hidden, false);

  // Switch to CASH: reference is no longer required, so it becomes valid
  method.querySelector('option[value=QR]').removeAttribute('selected');
  method.querySelector('option[value=CASH]').setAttribute('selected', '');
  fire(method, 'change');

  assert.equal(reference.hasAttribute('aria-invalid'), false, 'aria-invalid must be removed');
  assert.equal(errorEl.hidden, true, 'error feedback must be hidden');
});
