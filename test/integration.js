var chrome = require('selenium-webdriver/chrome'),
    firefox = require('selenium-webdriver/firefox'),
    webdriver = require('selenium-webdriver'),
    test = require('selenium-webdriver/testing'),
    assert = require('selenium-webdriver/testing/assert'),
    until = require('selenium-webdriver/lib/until'),
    fileUrl = require('file-url'),
    fs = require('fs')

var wd;

test.before(function(done) {
       var chromeOptions = new chrome.Options().addArguments("load-extension=keepassxc-browser/");
       var firefoxOptions = new firefox.Options();     // None set yet. Use only chrome for now.

       wd = new webdriver.Builder()
               .forBrowser('chrome')
               .setChromeOptions(chromeOptions)
               .setFirefoxOptions(firefoxOptions)
               .build();

    done();
});

test.after(function() {
       wd.quit();
});

// Internal test pages
test.describe('Testing internal test pages', function() {
    test.it('Test basic input fields', function() {
        wd.get(fileUrl('test/basic1.html'));
        test.verifyFields();
    });

    test.it('Test only username field', function() {
        wd.get(fileUrl('test/basic2.html'));

        wd.findElement({name: 'loginField'}).getAttribute('data-cip-id').then(function(loginField) {
            assert(loginField).contains('jQuery');
        });
    });

    test.it('Test only password field', function() {
        wd.get(fileUrl('test/basic3.html'));

        wd.findElement({name: 'passwordField'}).getAttribute('data-cip-id').then(function(passwordField) {
            assert(passwordField).contains('jQuery');
        });
    });

    test.it('Test previously hidden input fields', function() {
        wd.get(fileUrl('test/div1.html'));
        wd.actions().click(wd.findElement({id: 'toggle'})).perform().then(function() {
            test.verifyFields();
        });

        test.hideAndShowAgain();
    });

    test.it('Test previously hidden input fields with more complicated hidden div', function() {
        wd.get(fileUrl('test/div2.html'));
        wd.actions().click(wd.findElement({id: 'toggle'})).perform().then(function() {
            test.verifyFields();
        });

        test.hideAndShowAgain();
    });

    test.it('Test previously hidden input fields with dynamically created div', function() {
        wd.get(fileUrl('test/div3.html'));
        wd.actions().click(wd.findElement({id: 'toggle'})).perform().then(function() {
            test.verifyFields();
        });

        test.hideAndShowAgain();
    });

    test.it('Test previously hidden input fields with more complex dynamically created div', function() {
        wd.get(fileUrl('test/div4.html'));
        wd.actions().click(wd.findElement({id: 'toggle'})).perform().then(function() {
            test.verifyFields();
        });

        test.hideAndShowAgain();
    });

    test.it('Test password fields outside of the page', function() {
        wd.get(fileUrl('test/hidden_fields1.html'));

        wd.findElement({name: 'outsideLeft'}).getAttribute('data-cip-id').then(function(outsideLeft) {
            assert(outsideLeft).isNull();
        });

        wd.findElement({name: 'outsideTop'}).getAttribute('data-cip-id').then(function(outsideTop) {
            assert(outsideTop).isNull();
        });
    });

    test.it('Test hidden password fields', function() {
        wd.get(fileUrl('test/hidden_fields2.html'));

        wd.findElement({name: 'zeroSize'}).getAttribute('data-cip-id').then(function(elem) {
            assert(elem).isNull();
        });

        wd.findElement({name: 'oneSize'}).getAttribute('data-cip-id').then(function(elem) {
            assert(elem).isNull();
        });

        wd.findElement({name: 'ariaHidden'}).getAttribute('data-cip-id').then(function(elem) {
            assert(elem).isNull();
        });

        wd.findElement({name: 'visibilityHidden'}).getAttribute('data-cip-id').then(function(elem) {
            assert(elem).isNull();
        });

        wd.findElement({name: 'visibilityCollapse'}).getAttribute('data-cip-id').then(function(elem) {
            assert(elem).isNull();
        });

        wd.findElement({name: 'displayNone'}).getAttribute('data-cip-id').then(function(elem) {
            assert(elem).isNull();
        });

        wd.findElement({name: 'hiddenOne'}).getAttribute('data-cip-id').then(function(elem) {
            assert(elem).isNull();
        });

        wd.findElement({name: 'normal'}).getAttribute('data-cip-id').then(function(elem) {
            assert(elem).contains('jQuery');
        });
    });

    // Clicks the toggle button to hide login form and clicks it again. Input fields should be identified.
    test.hideAndShowAgain = function() {
        wd.actions().click(wd.findElement({id: 'toggle'})).perform().then(function() {
            wd.actions().click(wd.findElement({id: 'toggle'})).perform().then(function() {
                test.verifyFields();
            });
        });
    };

    // Used in the end of every test
    test.verifyFields = function() {
        wd.findElement({name: 'loginField'}).getAttribute('data-cip-id').then(function(loginField) {
            assert(loginField).contains('jQuery');
        });

        wd.findElement({name: 'passwordField'}).getAttribute('data-cip-id').then(function(passwordField) {
            assert(passwordField).contains('jQuery');
        });
    };
});