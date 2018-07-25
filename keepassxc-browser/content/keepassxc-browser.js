'use strict';

// contains already called method names
var _called = {};
_called.retrieveCredentials = false;
_called.clearLogins = false;
_called.manualFillRequested = 'none';
let _loginId = -1;
let _singleInputEnabledForPage = false;
const _maximumInputs = 100;

// Count of detected form fields on the page
var _detectedFields = 0;

// Element id's containing input fields detected by MutationObserver
var _observerIds = [];

// Document URL
let _documentURL = document.location.href;

browser.runtime.onMessage.addListener(function(req, sender) {
    if ('action' in req) {
        if (req.action === 'fill_user_pass_with_specific_login') {
            if (cip.credentials[req.id]) {
                let combination = null;
                if (cip.u) {
                    cip.setValueWithChange(cip.u, cip.credentials[req.id].login);
                    combination = cipFields.getCombination('username', cip.u.getAttribute('data-kpxc-id'));
                    browser.runtime.sendMessage({
                        action: 'page_set_login_id', args: [req.id]
                    });
                    cip.u.focus();
                }
                if (cip.p) {
                    cip.setValueWithChange(cip.p, cip.credentials[req.id].password);
                    browser.runtime.sendMessage({
                        action: 'page_set_login_id', args: [req.id]
                    });
                    combination = cipFields.getCombination('password', cip.p.getAttribute('data-kpxc-id'));
                }

                let list = [];
                if (cip.fillInStringFields(combination.fields, cip.credentials[req.id].stringFields, list)) {
                    cipForm.destroy(false, {'password': list.list[0], 'username': list.list[1]});
                }
            }
        } else if (req.action === 'fill_user_pass') {
            _called.manualFillRequested = 'both';
            cip.receiveCredentialsIfNecessary().then((response) => {
                cip.fillInFromActiveElement(false);
            });
        } else if (req.action === 'fill_pass_only') {
            _called.manualFillRequested = 'pass';
            cip.receiveCredentialsIfNecessary().then((response) => {
                cip.fillInFromActiveElement(false, true); // passOnly to true
            });
        } else if (req.action === 'fill_totp') {
            cip.receiveCredentialsIfNecessary().then((response) => {
                cip.fillInFromActiveElementTOTPOnly(false);
            });
        } else if (req.action === 'activate_password_generator') {
            cip.initPasswordGenerator(cipFields.getAllFields());
        } else if (req.action === 'remember_credentials') {
            cip.contextMenuRememberCredentials();
        } else if (req.action === 'choose_credential_fields') {
            kpxcDefine.init();
        } else if (req.action === 'clear_credentials') {
            cipEvents.clearCredentials();
            return Promise.resolve();
        } else if (req.action === 'activated_tab') {
            cipEvents.triggerActivatedTab();
            return Promise.resolve();
        } else if (req.action === 'redetect_fields') {
            browser.runtime.sendMessage({
                action: 'load_settings',
            }).then((response) => {
                cip.settings = response;
                cip.initCredentialFields(true);
            });
        } else if (req.action === 'ignore-site') {
            cip.ignoreSite(req.args);
        }
        else if (req.action === 'check_database_hash' && 'hash' in req) {
            cip.detectDatabaseChange(req.hash);
        }
    }
});

function _f(fieldId) {
    const inputs = document.querySelectorAll('input[data-kpxc-id=\''+fieldId+'\']');
    return inputs.length > 0 ? inputs[0] : null;
}

function _fs(fieldId) {
    const inputs = document.querySelectorAll('input[data-kpxc-id=\''+fieldId+'\'], select[data-kpxc-id=\''+fieldId+'\']');
    return inputs.length > 0 ? inputs[0] : null;
}


var cipForm = {};

cipForm.init = function(form, credentialFields) {
    if (!form.getAttribute('cipForm-initialized') && (credentialFields.password || credentialFields.username)) {
        form.setAttribute('cipForm-initialized', true);
        cipForm.setInputFields(form, credentialFields);
        form.addEventListener('submit', cipForm.onSubmit);
    }
};

cipForm.destroy = function(form, credentialFields) {
    if (form === false && credentialFields) {
        const field = _f(credentialFields.password) || _f(credentialFields.username);
        if (field) {
            form = field.closest('form');
        }
    }

    if (form && form.length > 0) {
        form.onsubmit = null;
    }
};

cipForm.setInputFields = function(form, credentialFields) {
    form.setAttribute('cipUsername', credentialFields.username);
    form.setAttribute('cipPassword', credentialFields.password);
};

cipForm.onSubmit = function() {
    const usernameId = this.getAttribute('cipUsername');
    const passwordId = this.getAttribute('cipPassword');

    let usernameValue = '';
    let passwordValue = '';

    const usernameField = _f(usernameId);
    const passwordField = _f(passwordId);

    if (usernameField) {
        usernameValue = usernameField.value;
    }
    if (passwordField) {
        passwordValue = passwordField.value;
    }

    cip.rememberCredentials(usernameValue, passwordValue);
};


var cipFields = {};

cipFields.inputQueryPattern = 'input[type=\'text\'], input[type=\'email\'], input[type=\'password\'], input[type=\'tel\'], input[type=\'number\'], input:not([type])';
// unique number as new IDs for input fields
cipFields.uniqueNumber = 342845638;
// objects with combination of username + password fields
cipFields.combinations = [];

cipFields.setUniqueId = function(field) {
    if (field && !field.getAttribute('data-kpxc-id')) {
        // use ID of field if it is unique
        // yes, it should be, but there are many bad developers outside...
        const fieldId = field.getAttribute('id');
        if (fieldId) {
            const foundIds = document.querySelectorAll('input#' + cipFields.prepareId(fieldId));
            if (foundIds.length === 1) {
                field.setAttribute('data-kpxc-id', fieldId);
                return;
            }
        }

        // create own ID if no ID is set for this field
        cipFields.uniqueNumber += 1;
        field.setAttribute('data-kpxc-id', 'kpxcpw'+String(cipFields.uniqueNumber));
    }
};

cipFields.prepareId = function(id) {
    return id.replace(/[:#.,\[\]\(\)' "]/g, function(m) { return '\\'+m; });
};

/**
 * Returns the first parent element satifying the {@code predicate} mapped by {@code resultFn} or else {@code defaultVal}.
 * @param {HTMLElement} element     The start element (excluded, starting with the parents)
 * @param {function} predicate      Matcher for the element to find, type (HTMLElement) => boolean
 * @param {function} resultFn       Callback function of type (HTMLElement) => {*} called for the first matching element
 * @param {fun} defaultValFn        Fallback return value supplier, if no element matching the predicate can be found
 */
cipFields.traverseParents = function(element, predicate, resultFn = () => true, defaultValFn = () => false) {
    for (let f = element.parentElement; f !== null; f = f.parentElement) {
        if (predicate(f)) {
            return resultFn(f);
        }
    }
    return defaultValFn();
};

cipFields.getAriaHidden = function(field) {
    // Check the main element
    const val = field.getAttribute('aria-hidden');
    if (val) {
        return val;
    }

    const ariaFunc = f => f.getAttribute('aria-hidden');
    return cipFields.traverseParents(field, ariaFunc, ariaFunc, () => 'false');
};

cipFields.getOverflowHidden = function(field) {
    return cipFields.traverseParents(field, f => f.style.overflow === 'hidden');
};

// Checks if input field is a search field. Attributes or form action containing 'search', or parent element holding
// role="search" will be identified as a search field.
cipFields.isSearchField = function(target) {
    const attributes = target.attributes;

    // Check element attributes
    for (const attr of attributes) {
        if ((attr.value && (attr.value.toLowerCase().includes('search')) || attr.value === 'q')) {
            return true;
        }
    }

    // Check closest form
    const closestForm = target.closest('form');
    if (closestForm) {
        // Check form action
        const formAction = closestForm.getAttribute('action');
        if (formAction && (formAction.toLowerCase().includes('search') && 
            !formAction.toLowerCase().includes('research'))) {
            return true;
        }

        // Check form class and id
        const closestFormId = closestForm.getAttribute('id');
        const closestFormClass = closestForm.className;
        if (closestFormClass && (closestForm.className.toLowerCase().includes('search') || 
            (closestFormId && closestFormId.toLowerCase().includes('search') && !closestFormId.toLowerCase().includes('research')))) {
            return true;
        }
    }

    // Check parent elements for role="search"
    const roleFunc = f => f.getAttribute('role');
    const roleValue = cipFields.traverseParents(target, roleFunc, roleFunc, () => null);
    if (roleValue && roleValue === 'search') {
        return true;
    }

    return false;
};

cipFields.isVisible = function(field) {
    const rect = field.getBoundingClientRect();

    // Check CSS visibility
    const fieldStyle = getComputedStyle(field);
    if (fieldStyle.visibility && (fieldStyle.visibility === 'hidden' || fieldStyle.visibility === 'collapse')) {
        return false;
    }

    // Check element position and size
    if (rect.x < 0 || rect.y < 0 || rect.width < 8 || rect.height < 8) {
        return false;
    }

    // Check aria-hidden property
    if (cipFields.getAriaHidden(field) !== 'false') {
        return false;
    }

    return true;
};

cipFields.getAllFields = function() {
    let fields = [];
    const inputs = cipObserverHelper.getInputs(document);
    for (const i of inputs) {
        if (cipFields.isVisible(i) && !cipFields.isSearchField(i)) {
            cipFields.setUniqueId(i);
            fields.push(i);
        }
    }

    _detectedFields = fields.length;
    return fields;
};

cipFields.prepareVisibleFieldsWithID = function(pattern) {
    const patterns = document.querySelectorAll(pattern);
    for (const i of patterns) {
        if (cipFields.isVisible(i) && i.style.visibility !== 'hidden' && i.style.visibility !== 'collapsed') {
           cipFields.setUniqueId(i);
        }
    }
};

cipFields.getAllCombinations = function(inputs) {
    let fields = [];
    let uField = null;

    for (const i of inputs) {
        if (i) {
            if (i.getAttribute('type') && i.getAttribute('type').toLowerCase() === 'password') {
                const uId = (!uField || uField.length < 1) ? null : uField.getAttribute('data-kpxc-id');

                const combination = {
                    username: uId,
                    password: i.getAttribute('data-kpxc-id')
                };
                fields.push(combination);

                // reset selected username field
                uField = null;
            }
            else {
                // username field
                uField = i;
            }
        }
    }

    if (_singleInputEnabledForPage && fields.length === 0 && uField) {
        const combination = {
            username: uField.getAttribute('data-kpxc-id'),
            password: null
        };
        fields.push(combination);
    }

    return fields;
};

cipFields.getCombination = function(givenType, fieldId) {
    if (cipFields.combinations.length === 0) {
        if (cipFields.useDefinedCredentialFields()) {
            return cipFields.combinations[0];
        }
    }
    // use defined credential fields (already loaded into combinations)
    const location = cip.getDocumentLocation();
    if (cip.settings['defined-custom-fields'] && cip.settings['defined-custom-fields'][location]) {
        return cipFields.combinations[0];
    }

    for (let c of cipFields.combinations) {
        if (c[givenType] === fieldId) {
            return c;
        }
    }

    // find new combination
    let combination = {
        username: null,
        password: null
    };

    let newCombi = false;
    if (givenType === 'username') {
        const passwordField = cipFields.getPasswordField(fieldId, true);
        let passwordId = null;
        if (passwordField && passwordField.value.length > 0) {
            passwordId = cipFields.prepareId(passwordField.getAttribute('data-kpxc-id'));
        }
        combination = {
            username: fieldId,
            password: passwordId
        };
        newCombi = true;
    }
    else if (givenType === 'password') {
        const usernameField = cipFields.getUsernameField(fieldId, true);
        let usernameId = null;
        if (usernameField && usernameField.value.length > 0) {
            usernameId = cipFields.prepareId(usernameField.getAttribute('data-kpxc-id'));
        }
        combination = {
            username: usernameId,
            password: fieldId
        };
        newCombi = true;
    }

    if (combination.username || combination.password) {
        cipFields.combinations.push(combination);
    }

    if (combination.username) {
        if (cip.credentials.length > 0) {
            cip.preparePageForMultipleCredentials(cip.credentials);
        }
    }

    if (newCombi) {
        combination.isNew = true;
    }
    return combination;
};

/**
* return the username field or null if it not exists
*/
cipFields.getUsernameField = function(passwordId, checkDisabled) {
    const passwordField = _f(passwordId);
    if (!passwordField) {
        return null;
    }

    const form = passwordField.closest('form');
    let usernameField = null;

    // search all inputs on this one form
    if (form) {
        const inputs = form.querySelectorAll(cipFields.inputQueryPattern);
        for (const i of inputs) {
            cipFields.setUniqueId(i);
            if (i.getAttribute('data-kpxc-id') === passwordId) {
                return false;
            }

            if (i.getAttribute('type') && i.getAttribute('type').toLowerCase() === 'password') {
                // continue
                return true;
            }

            usernameField = i;
        }
    }
    // search all inputs on page
    else {
        const inputs = cipFields.getAllFields();
        cip.initPasswordGenerator(inputs);
        for (const i of inputs) {
            if (i.getAttribute('data-kpxc-id') === passwordId) {
                break;
            }

            if (i.getAttribute('type') && i.getAttribute('type').toLowerCase() === 'password') {
                continue;
            }

            usernameField = i;
        }
    }

    if (usernameField && !checkDisabled) {
        const usernameId = usernameField.getAttribute('data-kpxc-id');
        // check if usernameField is already used by another combination
        for (const c of cipFields.combinations) {
            if (c.username === usernameId) {
                usernameField = null;
                break;
            }
        }
    }

    cipFields.setUniqueId(usernameField);
    return usernameField;
};

/**
* return the password field or null if it not exists
*/
cipFields.getPasswordField = function(usernameId, checkDisabled) {
    const usernameField = _f(usernameId);
    if (!usernameField) {
        return null;
    }

    const form = usernameField.closest('form');
    let passwordField = null;

    // search all inputs on this one form
    if (form) {
        const inputs = form.querySelectorAll('input[type=\'password\']');
        if (inputs.length > 0) {
            passwordField = inputs[0];
        }
        if (passwordField && passwordField.length < 1) {
            passwordField = null;
        }

        if (cip.settings.usePasswordGenerator) {
            kpxcPassword.init();
            kpxcPassword.initField(passwordField);
        }
    }
    // search all inputs on page
    else {
        const inputs = cipFields.getAllFields();
        cip.initPasswordGenerator(inputs);

        let active = false;
        for (const i of inputs) {
            if (i.getAttribute('data-kpxc-id') === usernameId) {
                active = true;
            }
            if (active && i.getAttribute('type') && i.getAttribute('type').toLowerCase() === 'password') {
                passwordField = i;
                break;
            }
        }
    }

    if (passwordField && !checkDisabled) {
        const passwordId = passwordField.getAttribute('data-kpxc-id');
        // check if passwordField is already used by another combination
        for (const c of cipFields.combinations) {
            if (c.password === passwordId) {
                passwordField = null;
                break;
            }
        }
    }

    cipFields.setUniqueId(passwordField);
    return passwordField;
};

cipFields.prepareCombinations = function(combinations) {
    for (const c of combinations) {
        const pwField = _f(c.password);
        // needed for auto-complete: don't overwrite manually filled-in password field
        if (pwField && !pwField.getAttribute('cipFields-onChange')) {
            pwField.setAttribute('cipFields-onChange', true);
            pwField.onchange = function() {
                this.setAttribute('unchanged', false);
            }
        }

        // initialize form-submit for remembering credentials
        const fieldId = c.password || c.username;
        const field = _f(fieldId);
        if (field) {
            const form = field.closest('form');
            if (form && form.length > 0) {
                cipForm.init(form, c);
            }
        }
    }
};

cipFields.useDefinedCredentialFields = function() {
    const location = cip.getDocumentLocation();
    if (cip.settings['defined-credential-fields'] && cip.settings['defined-credential-fields'][location]) {
        const creds = cip.settings['defined-credential-fields'][location];

        let found = _f(creds.username) || _f(creds.password);
        for (const i of creds.fields) {
            if (_fs(i)) {
                found = true;
                break;
            }
        }

        if (found) {
            let fields = {
                username: creds.username,
                password: creds.password,
                fields: creds.fields
            };
            cipFields.combinations = [];
            cipFields.combinations.push(fields);

            return true;
        }
    }

    return false;
};

var cipObserverHelper = {};
cipObserverHelper.inputTypes = [
    'text',
    'email',
    'password',
    'tel',
    'number',
    null    // Input field can be without any type. Include these to the list.
];

// Ignores all nodes that doesn't contain elements
cipObserverHelper.ignoredNode = function(target) {
    if (target.nodeType === Node.ATTRIBUTE_NODE ||
        target.nodeType === Node.TEXT_NODE || 
        target.nodeType === Node.CDATA_SECTION_NODE ||
        target.nodeType === Node.PROCESSING_INSTRUCTION_NODE ||
        target.nodeType === Node.COMMENT_NODE ||
        target.nodeType === Node.DOCUMENT_TYPE_NODE ||
        target.nodeType === Node.NOTATION_NODE) {
        return true;
    }
    return false;
};

cipObserverHelper.getInputs = function(target) {
    // Ignores target element if it's not an element node
    if (cipObserverHelper.ignoredNode(target)) {
        return [];
    }

    // Filter out any input fields with type 'hidden' right away
    let inputFields = [];
    Array.from(target.getElementsByTagName('input')).forEach(e => { 
        if (e.type !== 'hidden') {
            inputFields.push(e);
        }
    });

    // Do not allow more visible inputs than _maximumInputs (default value: 100)
    if (inputFields.length === 0 || inputFields.length > _maximumInputs) {
        return [];
    }

    // Only include input fields that match with cipObserverHelper.inputTypes
    let inputs = [];
    for (const i of inputFields) {
        let type = i.getAttribute('type');
        if (type) {
            type = type.toLowerCase();
        }

        if (cipObserverHelper.inputTypes.includes(type)) {
            inputs.push(i);
        }
    }
    return inputs;
};

cipObserverHelper.getId = function(target) {
    return target.classList.length === 0 ? target.id : target.classList;
};

cipObserverHelper.ignoredElement = function(target) {
    // Ignore elements that do not have a className (including SVG)
    if (typeof target.className !== 'string') {
        return true;
    }

    // Ignore KeePassXC-Browser classes
    if (target.className && target.className !== undefined && 
        (target.className.includes('kpxc') || target.className.includes('ui-helper'))) {
        return true;
    }

    return false;
};

cipObserverHelper.handleObserverAdd = function(target) {
    if (cipObserverHelper.ignoredElement(target)) {
        return;
    }

    const inputs = cipObserverHelper.getInputs(target);
    if (inputs.length === 0) {
        return;
    }

    const neededLength = _detectedFields === 1 ? 0 : 1;
    const id = cipObserverHelper.getId(target);
    if (inputs.length > neededLength && !_observerIds.includes(id)) {
        // Save target element id for preventing multiple calls to initCredentialsFields()
        _observerIds.push(id);
        
        // Sometimes the settings haven't been loaded before new input fields are detected
        if (Object.keys(cip.settings).length === 0) {
            cip.init();
        } else {
            cip.initCredentialFields(true);
        }
    }
};

cipObserverHelper.handleObserverRemove = function(target) {
    if (cipObserverHelper.ignoredElement(target)) {
        return;
    }

    const inputs = cipObserverHelper.getInputs(target);
    if (inputs.length === 0) {
        return;
    }

    // Remove target element id from the list
    const id = cipObserverHelper.getId(target);
    if (_observerIds.includes(id)) {
        const index = _observerIds.indexOf(id);
        if (index >= 0) {
            _observerIds.splice(index, 1);
        }
    }
};

cipObserverHelper.detectURLChange = function() {
    if (_documentURL !== document.location.href) {
        _documentURL = document.location.href;
        cipEvents.clearCredentials();
        cip.initCredentialFields(true);
    }
};

MutationObserver = window.MutationObserver || window.WebKitMutationObserver;

// Detects DOM changes in the document
let observer = new MutationObserver(function(mutations, observer) {
    if (document.visibilityState === 'hidden') {
        return;
    }

    for (const mut of mutations) {
        // Skip text nodes
        if (mut.target.nodeType === Node.TEXT_NODE) {
            continue;
        }

        // Check document URL change and detect new fields
        cipObserverHelper.detectURLChange();

        // Handle attributes only if CSS display is modified
        if (mut.type === 'attributes') {
            const newValue = mut.target.getAttribute(mut.attributeName);
            if (newValue && (newValue.includes('display') || newValue.includes('z-index'))) {
                if (mut.target.style.display !== 'none') {
                    cipObserverHelper.handleObserverAdd(mut.target);
                } else {
                    cipObserverHelper.handleObserverRemove(mut.target);
                }
            }
        } else if (mut.type === 'childList') {
            cipObserverHelper.handleObserverAdd((mut.addedNodes.length > 0) ? mut.addedNodes[0] : mut.target);
            cipObserverHelper.handleObserverRemove((mut.removedNodes.length > 0) ? mut.removedNodes[0] : mut.target);
        }
    }
});

// define what element should be observed by the observer
// and what types of mutations trigger the callback
observer.observe(document, {
    subtree: true,
    attributes: true,
    childList: true,
    characterData: true,
    attributeFilter: ['style']
});

var cip = {};
cip.settings = {};
cip.u = null;
cip.p = null;
cip.url = null;
cip.submitUrl = null;
cip.credentials = [];

const initcb = function() {
    browser.runtime.sendMessage({
        action: 'load_settings',
    }).then((response) => {
        cip.settings = response;
        cip.initCredentialFields();
    });
};

if (document.readyState === 'complete' || (document.readyState !== 'loading' && !document.documentElement.doScroll)) {
    initcb();
} else {
    document.addEventListener('DOMContentLoaded', initcb);
}

cip.init = function() {
    initcb();
};

// Switch credentials if database is changed or closed
cip.detectDatabaseChange = function(response) {
    if (document.visibilityState !== 'hidden') {
        if (response.new === '' && response.old !== '') {
            cipEvents.clearCredentials();

            browser.runtime.sendMessage({
                action: 'page_clear_logins'
            });

            // Switch back to default popup
            browser.runtime.sendMessage({
                action: 'get_status',
                args: [ true ]    // Set polling to true, this is an internal function call
            });
        } else if (response.new !== '' && response.new !== response.old) {
            _called.retrieveCredentials = false;
            browser.runtime.sendMessage({
                action: 'load_settings',
            }).then((response) => {
                cip.settings = response;
                cip.initCredentialFields(true);

                // If user has requested a manual fill through context menu the actual credential filling
                // is handled here when the opened database has been regognized. It's not a pretty hack.
                if (_called.manualFillRequested && _called.manualFillRequested !== 'none') {
                    cip.fillInFromActiveElement(false, _called.manualFillRequested === 'pass');
                    _called.manualFillRequested = 'none';
                }
            });
        }
    }
};

cip.initCredentialFields = function(forceCall) {
    if (_called.initCredentialFields && !forceCall) {
        return;
    }
    _called.initCredentialFields = true;

    browser.runtime.sendMessage({ 'action': 'page_clear_logins', args: [_called.clearLogins] }).then(() => {
        _called.clearLogins = true;

        // Check site preferences
        cip.initializeSitePreferences();
        if (cip.settings.sitePreferences) {
            for (const site of cip.settings.sitePreferences) {
                if (site.url === document.location.href || siteMatch(site.url, document.location.href)) {
                    if (site.ignore === IGNORE_FULL) {
                        return;
                    }

                    _singleInputEnabledForPage = site.usernameOnly;
                }
            }
        }

        const inputs = cipFields.getAllFields();
        if (inputs.length === 0) {
            return;
        }

        cipFields.prepareVisibleFieldsWithID('select');
        cip.initPasswordGenerator(inputs);

        if (!cipFields.useDefinedCredentialFields()) {
            // get all combinations of username + password fields
            cipFields.combinations = cipFields.getAllCombinations(inputs);
        }
        cipFields.prepareCombinations(cipFields.combinations);

        if (cipFields.combinations.length === 0 && inputs.length === 0) {
            browser.runtime.sendMessage({
                action: 'show_default_browseraction'
            });
            return;
        }

        cip.url = document.location.origin;
        cip.submitUrl = cip.getFormActionUrl(cipFields.combinations[0]);

        // Get submitUrl for a single input
        if (!cip.submitUrl && cipFields.combinations.length === 1 && inputs.length === 1) {
            cip.submitUrl = cip.getFormActionUrlFromSingleInput(inputs[0]);
        } 

        if (cip.settings.autoRetrieveCredentials && _called.retrieveCredentials === false && (cip.url && cip.submitUrl)) {
            //_called.retrieveCredentials = true;
            browser.runtime.sendMessage({
                action: 'retrieve_credentials',
                args: [ cip.url, cip.submitUrl ]
            }).then(cip.retrieveCredentialsCallback).catch((e) => {
                console.log(e);
            });
        } else if (_singleInputEnabledForPage) {
            cip.preparePageForMultipleCredentials(cip.credentials);
        }
    });
};

cip.initPasswordGenerator = function(inputs) {
    if (cip.settings.usePasswordGenerator) {
        kpxcPassword.init();

        for (let i = 0; i < inputs.length; i++) {
            if (inputs[i] && inputs[i].getAttribute('type') && inputs[i].getAttribute('type').toLowerCase() === 'password') {
                kpxcPassword.initField(inputs[i], inputs, i);
            }
        }
    }
};

cip.receiveCredentialsIfNecessary = function() {
    return new Promise((resolve, reject) => {
        if (cip.credentials.length === 0 && _called.retrieveCredentials === false) {
            browser.runtime.sendMessage({
                action: 'retrieve_credentials',
                args: [ cip.url, cip.submitUrl, false, true ] // Sets triggerUnlock to true
            }).then((credentials) => {
                // If the database was locked, this is scope never met. In these cases the response is met at cip.detectDatabaseChange
                _called.manualFillRequested = 'none';
                cip.retrieveCredentialsCallback(credentials, false);
                resolve(credentials);
            });
        } else {
            resolve(cip.credentials);
        }
    });
};

cip.retrieveCredentialsCallback = function(credentials, dontAutoFillIn) {
    if (cipFields.combinations.length > 0) {
        cip.u = _f(cipFields.combinations[0].username);
        cip.p = _f(cipFields.combinations[0].password);
    }

    if (credentials && credentials.length > 0) {
        cip.credentials = credentials;
        cip.prepareFieldsForCredentials(!Boolean(dontAutoFillIn));
        _called.retrieveCredentials = true;
    }
};

cip.prepareFieldsForCredentials = function(autoFillInForSingle) {
    // only one login for this site
    if (autoFillInForSingle && cip.settings.autoFillSingleEntry && cip.credentials.length === 1) {
        let combination = null;
        if (!cip.p && !cip.u && cipFields.combinations.length > 0) {
            cip.u = _f(cipFields.combinations[0].username);
            cip.p = _f(cipFields.combinations[0].password);
            combination = cipFields.combinations[0];
        }
        if (cip.u) {
            cip.setValueWithChange(cip.u, cip.credentials[0].login);
            combination = cipFields.getCombination('username', cip.u);
        }
        if (cip.p) {
            cip.setValueWithChange(cip.p, cip.credentials[0].password);
            combination = cipFields.getCombination('password', cip.p);
        }

        if (combination) {
            let list = [];
            if (cip.fillInStringFields(combination.fields, cip.credentials[0].stringFields, list)) {
                cipForm.destroy(false, {'password': list.list[0], 'username': list.list[1]});
            }
        }

        // generate popup-list of usernames + descriptions
        browser.runtime.sendMessage({
            action: 'popup_login',
            args: [[cip.credentials[0].login + ' (' + cip.credentials[0].name + ')']]
        });
    }
    //multiple logins for this site
    else if (cip.credentials.length > 1 || (cip.credentials.length > 0 && (!cip.settings.autoFillSingleEntry || !autoFillInForSingle))) {
        cip.preparePageForMultipleCredentials(cip.credentials);
    }
};

cip.preparePageForMultipleCredentials = function(credentials) {
    // add usernames + descriptions to autocomplete-list and popup-list
    let usernames = [];
    kpxcAutocomplete.elements = [];
    let visibleLogin;
    for (let i = 0; i < credentials.length; i++) {
        visibleLogin = (credentials[i].login.length > 0) ? credentials[i].login : tr('credentialsNoUsername');
        usernames.push(visibleLogin + ' (' + credentials[i].name + ')');
        const item = {
            label: visibleLogin + ' (' + credentials[i].name + ')',
            value: credentials[i].login,
            loginId: i
        };
        kpxcAutocomplete.elements.push(item);
    }

    // generate popup-list of usernames + descriptions
    browser.runtime.sendMessage({
        action: 'popup_login',
        args: [usernames]
    });

    // initialize autocomplete for username fields
    if (cip.settings.autoCompleteUsernames) {
        for (const i of cipFields.combinations) {
            // Both username and password fields are visible
            if (_detectedFields >= 2) {
                if (_f(i.username)) {
                    kpxcAutocomplete.create(_f(i.username));
                }
            } else if (_detectedFields == 1) {
                if (_f(i.username)) {
                    kpxcAutocomplete.create(_f(i.username));
                }
                if (_f(i.password)) {
                    kpxcAutocomplete.create(_f(i.password));
                }
            }
        }
    }
};

cip.getFormActionUrl = function(combination) {
    if (!combination) {
        return null;
    }

    const field = _f(combination.password) || _f(combination.username);
    if (field === null) {
        return null;
    }

    const form = field.closest('form');
    let action = null;

    if (form && form.length > 0) {
        action = form[0].action;
    }

    if (typeof(action) !== 'string' || action === '') {
        action = document.location.origin + document.location.pathname;
    }

    return action;
};

cip.getFormActionUrlFromSingleInput = function(field) {
    if (!field) {
        return null;
    }

    let action = field.formAction;

    if (typeof(action) !== 'string' || action === '') {
        action = document.location.origin + document.location.pathname;
    }

    return action;
};

cip.fillInCredentials = function(combination, onlyPassword, suppressWarnings) {
    const action = cip.getFormActionUrl(combination);
    const u = _f(combination.username);
    const p = _f(combination.password);

    if (combination.isNew) {
        // initialize form-submit for remembering credentials
        const fieldId = combination.password || combination.username;
        const field = _f(fieldId);
        if (field) {
            const form2 = field.closest('form');
            if (form2 && form2.length > 0) {
                cipForm.init(form2, combination);
            }
        }
    }

    if (u) {
        cip.u = u;
    }
    if (p) {
        cip.p = p;
    }

    if (cip.url === document.location.origin && cip.submitUrl === action && cip.credentials.length > 0) {
        cip.fillIn(combination, onlyPassword, suppressWarnings);
    }
    else {
        cip.url = document.location.origin;
        cip.submitUrl = action;

        browser.runtime.sendMessage({
            action: 'retrieve_credentials',
            args: [ cip.url, cip.submitUrl, false, true ]
        }).then((credentials) => {
            cip.retrieveCredentialsCallback(credentials, true);
            cip.fillIn(combination, onlyPassword, suppressWarnings);
        });
    }
};

cip.fillInFromActiveElement = function(suppressWarnings, passOnly = false) {
    const el = document.activeElement;
    if (el.tagName.toLowerCase() !== 'input') {
        if (cipFields.combinations.length > 0) {
            cip.fillInCredentials(cipFields.combinations[0], false, suppressWarnings);
        }
        return;
    }

    cipFields.setUniqueId(el);
    const fieldId = cipFields.prepareId(el.getAttribute('data-kpxc-id'));
    let combination = null;
    if (el.getAttribute('type') === 'password') {
        combination = cipFields.getCombination('password', fieldId);
    }
    else {
        combination = cipFields.getCombination('username', fieldId);
    }

    if (passOnly) {
        if (!_f(combination.password)) {
            const message = tr('fieldsNoPasswordField');
            browser.runtime.sendMessage({
                action: 'show_notification',
                args: [message]
            });
            return;
        }
    }

    delete combination.loginId;

    cip.fillInCredentials(combination, passOnly, suppressWarnings);
};

cip.fillInFromActiveElementTOTPOnly = function(suppressWarnings) {
    const el = document.activeElement;
    cipFields.setUniqueId(el);
    const fieldId = cipFields.prepareId(el.getAttribute('data-kpxc-id'));

    browser.runtime.sendMessage({
        action: 'page_get_login_id'
    }).then((pos) => {
        if (pos >= 0 && cip.credentials[pos]) {
            // Check the value from stringFields (to be removed)
            const currentField = _fs(fieldId);
            if (cip.credentials[pos].stringFields && cip.credentials[pos].stringFields.length > 0) {
                const stringFields = cip.credentials[pos].stringFields;
                for (const s of stringFields) {
                    const val = s["KPH: {TOTP}"];
                    if (val) {
                        cip.setValue(currentField, val);
                    }
                }
            } else if (cip.credentials[pos].totp && cip.credentials[pos].totp.length > 0) {
                cip.setValue(currentField, cip.credentials[pos].totp);
            }
        }
    });    
};

cip.setValue = function(field, value) {
    if (field.matches('select')) {
        value = value.toLowerCase().trim();
        const options = field.querySelectorAll('option');
        for (const o of options) {
            if (o.test().toLowerCase().trim() === value) {
                cip.setValueWithChange(field, o.value);
                return false;
            }
        }
    }
    else {
        cip.setValueWithChange(field, value);
    }
};

cip.fillInStringFields = function(fields, stringFields, filledInFields) {
    let filledIn = false;

    filledInFields.list = [];
    if (fields && stringFields && fields.length > 0 && stringFields.length > 0) {
        for (let i = 0; i < fields.length; i++) {
            const currentField = _fs(fields[i]);
            const stringFieldValue = Object.values(stringFields[i]);
            if (currentField && stringFieldValue[0]) {
                cip.setValue(currentField, stringFieldValue[0]);
                filledInFields.list.push(fields[i]);
                filledIn = true;
            }
        }
    }

    return filledIn;
};

cip.setValueWithChange = function(field, value) {
    if (cip.settings.respectMaxLength === true) {
        const attribute_maxlength = field.getAttribute('maxlength');
        if (attribute_maxlength && !isNaN(attribute_maxlength) && attribute_maxlength > 0) {
            value = value.substr(0, attribute_maxlength);
        }
    }

    field.value = value;
    field.dispatchEvent(new Event('input', {'bubbles': true}));
    field.dispatchEvent(new Event('change', {'bubbles': true}));
};

cip.fillIn = function(combination, onlyPassword, suppressWarnings) {
    // no credentials available
    if (cip.credentials.length === 0 && !suppressWarnings) {
        const message = tr('credentialsNoLoginsFound');
        browser.runtime.sendMessage({
            action: 'show_notification',
            args: [message]
        });
        return;
    }

    const uField = _f(combination.username);
    const pField = _f(combination.password);

    // exactly one pair of credentials available
    if (cip.credentials.length === 1) {
        let filledIn = false;
        if (uField && (!onlyPassword || _singleInputEnabledForPage)) {
            cip.setValueWithChange(uField, cip.credentials[0].login);
            _loginId = 0;
            filledIn = true;
        }
        if (pField) {
            pField.setAttribute('type', 'password');
            cip.setValueWithChange(pField, cip.credentials[0].password);
            pField.setAttribute('unchanged', true);
            _loginId = 0;
            filledIn = true;
        }

        let list = [];
        if (cip.fillInStringFields(combination.fields, cip.credentials[0].stringFields, list)) {
            cipForm.destroy(false, {'password': list.list[0], 'username': list.list[1]});
            filledIn = true;
        }

        if (!filledIn) {
            if (!suppressWarnings) {
                const message = tr('fieldsFill');
                browser.runtime.sendMessage({
                    action: 'show_notification',
                    args: [message]
                });
            }
        }
    }
    // specific login id given
    else if (combination.loginId !== undefined && cip.credentials[combination.loginId]) {
        let filledIn = false;
        if (uField) {
            cip.setValueWithChange(uField, cip.credentials[combination.loginId].login);
            _loginId = combination.loginId;
            filledIn = true;
        }

        if (pField) {
            cip.setValueWithChange(pField, cip.credentials[combination.loginId].password);
            pField.setAttribute('unchanged', true);
            _loginId = combination.loginId;
            filledIn = true;
        }

        let list = [];
        if (cip.fillInStringFields(combination.fields, cip.credentials[combination.loginId].stringFields, list)) {
            cipForm.destroy(false, {'password': list.list[0], 'username': list.list[1]});
            filledIn = true;
        }

        if (!filledIn) {
            if (!suppressWarnings) {
                const message = tr('fieldsFill');
                browser.runtime.sendMessage({
                    action: 'show_notification',
                    args: [message]
                });
            }
        }
    }
    // multiple credentials available
    else {
        // check if only one password for given username exists
        let countPasswords = 0;

        if (uField) {
            let valPassword = '';
            let valUsername = '';
            let valStringFields = [];
            const valQueryUsername = uField.value.toLowerCase();

            // find passwords to given username (even those with empty username)
            for (const c of cip.credentials) {
                if (c.login.toLowerCase() === valQueryUsername) {
                    countPasswords += 1;
                    valPassword = c.password;
                    valUsername = c.login;
                    valStringFields = c.stringFields;
                }
            }

            // for the correct notification message: 0 = no logins, X > 1 = too many logins
            if (countPasswords === 0) {
                countPasswords = cip.credentials.length;
            }

            // only one mapping username found
            if (countPasswords === 1) {
                if (!onlyPassword) {
                    cip.setValueWithChange(uField, valUsername);
                }

                if (pField) {
                    cip.setValueWithChange(pField, valPassword);
                    pField.setAttribute('unchanged', true);
                }

                let list = [];
                if (cip.fillInStringFields(combination.fields, valStringFields, list)) {
                    cipForm.destroy(false, {'password': list.list[0], 'username': list.list[1]});
                }
            }

            // user has to select correct credentials by himself
            if (countPasswords > 1) {
                if (!suppressWarnings) {
                    const target = onlyPassword ? pField : uField;
                    kpxcAutocomplete.create(target, true);
                    target.focus();
                }
            }
            else if (countPasswords < 1) {
                if (!suppressWarnings) {
                    const message = tr('credentialsNoUsernameFound');
                    browser.runtime.sendMessage({
                        action: 'show_notification',
                        args: [message]
                    });
                }
            }
        }
        else {
            if (!suppressWarnings) {
                const target = onlyPassword ? pField : uField;
                kpxcAutocomplete.create(target);
                target.focus();
            }
        }
    }
};

cip.contextMenuRememberCredentials = function() {
    const el = document.activeElement;
    if (el.tagName.toLowerCase() !== 'input') {
        return;
    }

    cipFields.setUniqueId(el);
    const fieldId = cipFields.prepareId(el.getAttribute('data-kpxc-id'));
    let combination = null;
    if (el.getAttribute('type') === 'password') {
        combination = cipFields.getCombination('password', fieldId);
    }
    else {
        combination = cipFields.getCombination('username', fieldId);
    }

    let usernameValue = '';
    let passwordValue = '';

    const usernameField = _f(combination.username);
    const passwordField = _f(combination.password);

    if (usernameField) {
        usernameValue = usernameField.value;
    }
    if (passwordField) {
        passwordValue = passwordField.value;
    }

    if (!cip.rememberCredentials(usernameValue, passwordValue)) {
        const message = tr('rememberNothingChanged');
        browser.runtime.sendMessage({
            action: 'show_notification',
            args: [message]
        });
    }
};

cip.rememberCredentials = function(usernameValue, passwordValue) {
    // no password given or field cleaned by a site-running script
    // --> no password to save
    if (passwordValue === '') {
        return false;
    }

    let usernameExists = false;
    let nothingChanged = false;

    for (const c of cip.credentials) {
        if (c.login === usernameValue && c.password === passwordValue) {
            nothingChanged = true;
            break;
        }

        if (c.login === usernameValue) {
            usernameExists = true;
        }
    }

    if (!nothingChanged) {
        if (!usernameExists) {
            for (const c of cip.credentials) {
                if (c.login === usernameValue) {
                    usernameExists = true;
                    break;
                }
            }
        }
        let credentialsList = [];
        for (const c of cip.credentials) {
            credentialsList.push({
                login: c.login,
                name: c.name,
                uuid: c.uuid
            });
        }

        let url = this.action;
        if (!url) {
            url = cip.getDocumentLocation();
            if (url.indexOf('?') > 0) {
                url = url.substring(0, url.indexOf('?'));
                if (url.length < document.location.origin.length) {
                    url = document.location.origin;
                }
            }
        }

        browser.runtime.sendMessage({
            action: 'set_remember_credentials',
            args: [usernameValue, passwordValue, url, usernameExists, credentialsList]
        });

        return true;
    }

    return false;
};

cip.ignoreSite = function(sites) {
    if (!sites || sites.length === 0) {
        return;
    }

    let site = sites[0];
    cip.initializeSitePreferences();

    if (slashNeededForUrl(site)) {
        site += '/';
    }

    // Check if the site already exists
    let siteExists = false;
    for (const existingSite of cip.settings['sitePreferences']) {
        if (existingSite.url === site) {
            existingSite.ignore = IGNORE_NORMAL;
            siteExists = true;
        }
    }

    if (!siteExists) {
        cip.settings['sitePreferences'].push({
            url: site,
            ignore: IGNORE_NORMAL,
            usernameOnly: false
        });
    }

    browser.runtime.sendMessage({
        action: 'save_settings',
        args: [cip.settings]
    });
};

// Delete previously created Object if it exists. It will be replaced by an Array
cip.initializeSitePreferences = function() {
    if (cip.settings['sitePreferences'] !== undefined && cip.settings['sitePreferences'].constructor === Object) {
        delete cip.settings['sitePreferences'];
    }

    if (!cip.settings['sitePreferences']) {
        cip.settings['sitePreferences'] = [];
    }
};

cip.getDocumentLocation = function() {
    return cip.settings.saveDomainOnly ? document.location.origin : document.location.href;
};


var cipEvents = {};

cipEvents.clearCredentials = function() {
    cip.credentials = [];
    kpxcAutocomplete.elements = [];
    _called.retrieveCredentials = false;

    if (cip.settings.autoCompleteUsernames) {
        for (const c of cipFields.combinations) {
            const uField = _f(c.username);
            if (uField) {
                if (uField.classList.contains('ui-autocomplete-input')) {
                    uField.autocomplete('destroy');
                }
            }
        }
    }
};

cipEvents.triggerActivatedTab = function() {
    // doesn't run a second time because of _called.initCredentialFields set to true
    cip.init();

    // initCredentialFields calls also "retrieve_credentials", to prevent it
    // check of init() was already called
    if (_called.initCredentialFields && (cip.url && cip.submitUrl) && cip.settings.autoRetrieveCredentials) {
        browser.runtime.sendMessage({
            action: 'retrieve_credentials',
            args: [ cip.url, cip.submitUrl ]
        }).then(cip.retrieveCredentialsCallback).catch((e) => {
            console.log(e);
        });
    }
};
