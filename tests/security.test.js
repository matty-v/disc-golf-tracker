/**
 * Disc Golf Tracker - Security Regression Tests
 *
 * Proves untrusted, Sheet-sourced course names can never be interpreted as
 * markup when rendered (finding 12).
 */

(function() {
    const TR = (typeof TestRunner !== 'undefined') ? TestRunner : window.TestRunner;
    const test = TR.test.bind(TR);
    const assertTrue = TR.assertTrue.bind(TR);
    const assertFalse = TR.assertFalse.bind(TR);

    function createTrackingElement(tag) {
        const classSet = new Set();
        const attrs = {};
        return {
            tag,
            _attrs: attrs,
            classList: {
                add(c) { classSet.add(c); },
                remove(c) { classSet.delete(c); },
                toggle(c, force) {
                    if (force === undefined) {
                        if (classSet.has(c)) { classSet.delete(c); return false; }
                        classSet.add(c); return true;
                    }
                    if (force) classSet.add(c); else classSet.delete(c);
                    return force;
                },
                contains(c) { return classSet.has(c); }
            },
            value: '',
            textContent: '',
            innerHTML: '',
            className: '',
            title: '',
            children: [],
            setAttribute(name, val) { attrs[name] = String(val); },
            getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
            addEventListener() {},
            removeEventListener() {},
            appendChild(child) { this.children.push(child); return child; },
            querySelector() { return null; },
            querySelectorAll() { return []; },
            focus() {},
            remove() {}
        };
    }

    test('the header title still navigates home via an addEventListener, not an inline onclick (CSP)', function() {
        const originalGetElementById = document.getElementById;

        const listeners = {};
        const registered = createTrackingElement('h1');
        registered.addEventListener = (type, handler) => {
            (listeners[type] = listeners[type] || []).push(handler);
        };

        document.getElementById = (id) => {
            if (id === 'header-title') return registered;
            return createTrackingElement('div');
        };
        const originalWindowAddEventListener = window.addEventListener;
        window.addEventListener = () => {};

        try {
            App.setupEventListeners();

            let navigatedHome = false;
            const originalShowScreen = App.showScreen;
            App.showScreen = (screen) => { if (screen === 'home') navigatedHome = true; };
            try {
                assertTrue(!!(listeners.click && listeners.click.length), 'a click listener must be registered on header-title in JS, not via an inline onclick attribute');
                listeners.click[0]();
                assertTrue(navigatedHome, 'clicking the header title must still navigate home');
            } finally {
                App.showScreen = originalShowScreen;
            }
        } finally {
            document.getElementById = originalGetElementById;
            window.addEventListener = originalWindowAddEventListener;
        }
    });

    test('renderCourseList never interpolates an untrusted course name into innerHTML', function() {
        const originalGetElementById = document.getElementById;
        const originalQuerySelectorAll = document.querySelectorAll;
        const originalCreateElement = document.createElement;

        const created = [];
        const container = createTrackingElement('div');
        const emptyMessage = createTrackingElement('div');

        document.getElementById = (id) => {
            if (id === 'course-list') return container;
            if (id === 'no-courses-message') return emptyMessage;
            return createTrackingElement('div');
        };
        document.querySelectorAll = () => [];
        document.createElement = (tag) => {
            const el = createTrackingElement(tag);
            created.push(el);
            return el;
        };

        try {
            // A course name arriving from syncFromSheets() is untrusted — the
            // Sheet is a hand-editable surface (see Obi-wan's architecture,
            // Security considerations). This payload would execute if it
            // ever landed inside an innerHTML assignment.
            const malicious = '<img src=x onerror=alert(1)>"><script>alert(2)</script>';

            App.state.courses = [
                { course_id: 'c1', course_name: malicious, hole_count: 18, last_played: null }
            ];

            App.renderCourseList();

            const leakedIntoMarkup = created.some(el => typeof el.innerHTML === 'string' && el.innerHTML.includes(malicious));
            assertFalse(leakedIntoMarkup, 'the untrusted course name must never be interpolated into innerHTML');

            const shownAsText = created.some(el => el.textContent === malicious);
            const shownAsAttr = created.some(el => el._attrs && el._attrs['aria-label'] && el._attrs['aria-label'].includes(malicious));
            assertTrue(shownAsText || shownAsAttr, 'the course name must still be displayed — just safely, via textContent or setAttribute');
        } finally {
            document.getElementById = originalGetElementById;
            document.querySelectorAll = originalQuerySelectorAll;
            document.createElement = originalCreateElement;
        }
    });
})();
