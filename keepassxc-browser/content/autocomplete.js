'use strict'

var kpxcAutocomplete = {};
kpxcAutocomplete.elements = [];

kpxcAutocomplete.create = function(input, showListInstantly = false) {
    let _index = -1;

    input.addEventListener('click', function(e) {
        if (input.value !== '') {
            input.select();
        }
        showList(input);
    });

    input.addEventListener('keypress', keyPress);
    input.setAttribute('autocomplete', 'off');

    if (showListInstantly) {
        showList(input);
    } 

    function showList(input) {
        closeList();
        const div = kpxcUI.createElement('div', 'kpxcAutocomplete-items', {'id': 'kpxcAutocomplete-list'});

        // Element position
        const rect = input.getBoundingClientRect();
        div.style.top = String((rect.top + document.body.scrollTop) + input.offsetHeight) + 'px';
        div.style.left = String((rect.left + document.body.scrollLeft)) + 'px';
        div.style.minWidth = String(input.offsetWidth) + 'px';
        div.style.zIndex = '2147483646';
        document.body.append(div);

        for (const c of kpxcAutocomplete.elements) {
            const item = document.createElement('div');
            item.textContent += c.label;
            const itemInput = kpxcUI.createElement('input', '', {'type': 'hidden', 'value': c.value});
            item.append(itemInput);
            item.addEventListener('click', function(e) {
                // Save index for combination.loginId
                const index = Array.prototype.indexOf.call(e.currentTarget.parentElement.childNodes, e.currentTarget);
                input.value = this.getElementsByTagName('input')[0].value;
                fillPassword(input.value, index);
                closeList();
                input.focus();
            });

            // These events prevent the double hover effect if both keyboard and mouse are used
            item.addEventListener('mouseover', function(e) {
                removeItem(getAllItems());
                item.classList.add('kpxcAutocomplete-active');
                _index = Array.from(div.childNodes).indexOf(item);
            });
            item.addEventListener('mouseout', function(e) {
                item.classList.remove('kpxcAutocomplete-active');
            });

            div.appendChild(item);
        }

        // Activate the first item automatically
        const items = getAllItems();
        _index = 0;
        activateItem(items);
    };

    function activateItem(item) {
        if (!item) {
            return;
        }

        removeItem(item);
        if (_index >= item.length) {
            _index = 0;
        }

        if (_index < 0) {
            _index = item.length - 1;
        }

        if (item[_index] !== undefined) {
            item[_index].classList.add('kpxcAutocomplete-active');
        }
    };

    function removeItem(items) {
        for (const item of items) {
            item.classList.remove('kpxcAutocomplete-active');
        }
    };

    function closeList(elem) {
        const items = document.getElementsByClassName('kpxcAutocomplete-items');
        for (const item of items) {
            if (elem !== item && input) {
                item.parentNode.removeChild(item);
            }
        }
    };

    function getAllItems() {
        const list = document.getElementById('kpxcAutocomplete-list');
        if (!list) {
            return [];
        }
        return list.getElementsByTagName('div');
    };

    function keyPress(e) {
        const item = getAllItems();
        if (e.key === 'ArrowDown') {
            ++_index;
            activateItem(item);
        } else if (e.key === 'ArrowUp') {
             --_index;
            activateItem(item);
        } else if (e.key === 'Enter') {
            if (input.value === '') {
                e.preventDefault();
            }

            if (_index >= 0 && item && item[_index] !== undefined) {
                item[_index].click();
            }
        } else if (e.key === 'Escape' || e.key === 'Tab') {
            closeList();
        } else if ((e.key === 'Backspace' || e.key === 'Delete') && input.value === '') {
            // Show menu when input field has no value and backspace is pressed
            _index = -1;
            showList(input);
        }
    };

    function fillPassword(value, index) {
        const fieldId = input.getAttribute('data-kpxc-id');
        cipFields.prepareId(fieldId);
        const combination = cipFields.getCombination('username', fieldId);
        combination.loginId = index;
   
        cip.fillInCredentials(combination, true, false);
        input.setAttribute('fetched', true);
    };

    // Detect click outside autocomplete
    document.addEventListener('click', function(e) {
        const list = document.getElementById('kpxcAutocomplete-list');
        if (!list) {
            return;
        }

        if (e.target !== input) {
            closeList(e.target);
        }
    });
};