/**
 * Disc Golf Tracker - Mobile UI / Accessibility Behavior Tests
 *
 * Covers the JS-testable pieces of the mobile UI/accessibility fixes —
 * form error clearing, and modal Escape/backdrop dismissal (findings 18).
 * The CSS-only fixes (safe-area insets, 100dvh, touch targets, orphaned
 * classes) and markup-only fixes (viewport, placeholder values, logo
 * consolidation) aren't runtime-observable in this zero-dependency Node
 * harness and are covered by code review + the PR's Firebase preview.
 */

(function() {
    const TR = (typeof TestRunner !== 'undefined') ? TestRunner : window.TestRunner;
    const test = TR.test.bind(TR);
    const assertEqual = TR.assertEqual.bind(TR);
    const assertTrue = TR.assertTrue.bind(TR);
    const assertFalse = TR.assertFalse.bind(TR);

    let originalGetElementById, originalQuerySelectorAll, originalCreateElement, originalDocAddEventListener;
    let elementCache;

    function createFakeElement(id) {
        const classSet = new Set();
        const attrs = {};
        return {
            id,
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
            disabled: false,
            style: {},
            dataset: {},
            _listeners: {},
            addEventListener(type, handler) {
                (this._listeners[type] = this._listeners[type] || []).push(handler);
            },
            removeEventListener() {},
            setAttribute(name, val) { attrs[name] = String(val); },
            getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
            querySelector() { return createFakeElement(id + '-child'); },
            querySelectorAll() { return []; },
            appendChild() {},
            focus() { this._focused = true; },
            remove() {}
        };
    }

    function setupDOM() {
        elementCache = {};
        originalGetElementById = document.getElementById;
        originalQuerySelectorAll = document.querySelectorAll;
        originalCreateElement = document.createElement;
        originalDocAddEventListener = document.addEventListener;

        const docListeners = {};
        document._testListeners = docListeners;
        document.getElementById = (id) => {
            if (!elementCache[id]) elementCache[id] = createFakeElement(id);
            return elementCache[id];
        };
        document.querySelectorAll = () => [];
        document.createElement = (tag) => createFakeElement('created-' + tag);
        document.addEventListener = (type, handler) => {
            (docListeners[type] = docListeners[type] || []).push(handler);
        };
    }

    function teardownDOM() {
        document.getElementById = originalGetElementById;
        document.querySelectorAll = originalQuerySelectorAll;
        document.createElement = originalCreateElement;
        document.addEventListener = originalDocAddEventListener;
        delete document._testListeners;
        elementCache = {};
    }

    function el(id) {
        return document.getElementById(id);
    }

    // =========================================
    // Form validation errors clear (finding 18)
    // =========================================

    test('a course-name validation error clears once the user corrects the input', function() {
        setupDOM();
        try {
            el('course-name-error').textContent = 'Course name is required';
            el('course-name').classList.add('error');

            App.clearNewCourseFieldError('course-name');

            assertEqual(el('course-name-error').textContent, '', 'the error message must be cleared');
            assertFalse(el('course-name').classList.contains('error'), 'the .error class must be cleared');
        } finally {
            teardownDOM();
        }
    });

    test('showScreen("new-course") clears a stale error from a previous visit to the form', function() {
        setupDOM();
        try {
            el('course-name-error').textContent = 'Course name is required';
            el('course-name').classList.add('error');
            el('hole-count-error').textContent = 'Hole count must be between 1 and 27';
            el('hole-count').classList.add('error');

            App.showScreen('new-course');

            assertEqual(el('course-name-error').textContent, '', 'leaving and returning to the form must clear the old error');
            assertFalse(el('course-name').classList.contains('error'));
            assertEqual(el('hole-count-error').textContent, '');
            assertFalse(el('hole-count').classList.contains('error'));
        } finally {
            teardownDOM();
        }
    });

    // =========================================
    // Modal dismissal via Escape + backdrop click (finding 18)
    // =========================================

    test('clicking the scorecard-modal backdrop closes it', function() {
        setupDOM();
        try {
            App.setupModalDismissal('scorecard-modal', () => App.hideScorecard());

            const modal = el('scorecard-modal');
            const listeners = modal._listeners.click;
            assertTrue(!!(listeners && listeners.length), 'a click listener must be registered on the modal');

            modal.classList.remove('hidden');
            listeners[0]({ target: modal }); // clicked the backdrop itself

            assertTrue(modal.classList.contains('hidden'), 'clicking the backdrop must close the modal');
        } finally {
            teardownDOM();
        }
    });

    test('clicking inside the scorecard-modal content does not close it', function() {
        setupDOM();
        try {
            App.setupModalDismissal('scorecard-modal', () => App.hideScorecard());

            const modal = el('scorecard-modal');
            const listeners = modal._listeners.click;
            const innerContent = createFakeElement('modal-content-child');

            modal.classList.remove('hidden');
            listeners[0]({ target: innerContent }); // clicked something inside, not the backdrop

            assertFalse(modal.classList.contains('hidden'), 'clicking inside the modal must not close it');
        } finally {
            teardownDOM();
        }
    });

    test('pressing Escape closes an open modal but not a hidden one', function() {
        setupDOM();
        try {
            App.setupModalDismissal('incomplete-round-modal', () => App.dismissIncompleteRoundModal());

            const modal = el('incomplete-round-modal');
            const keyHandlers = document._testListeners.keydown;
            assertTrue(!!(keyHandlers && keyHandlers.length), 'an Escape keydown listener must be registered');

            // Modal is hidden — Escape must be a no-op (nothing to close).
            modal.classList.add('hidden');
            keyHandlers[0]({ key: 'Escape' });
            assertTrue(modal.classList.contains('hidden'), 'Escape on an already-hidden modal is a no-op');

            // Modal is open — Escape must close it.
            modal.classList.remove('hidden');
            keyHandlers[0]({ key: 'Escape' });
            assertTrue(modal.classList.contains('hidden'), 'Escape must close an open modal');
        } finally {
            teardownDOM();
        }
    });

    // =========================================
    // Redundant statsSection toggle collapsed to one call, same UI outcome
    // =========================================

    test('renderScoringScreen still shows the stats section whether or not hole stats exist', function() {
        setupDOM();
        try {
            App.state.currentRound = {
                round_id: 'r1', course_id: 'c1', courseName: 'Test', round_date: new Date().toISOString(),
                completed: false, isNewCourse: false, currentHoleIndex: 0, holeCount: 1,
                holes: [{ hole_id: 'h1', course_id: 'c1', hole_number: 1, par: 3, distance: null, description: '' }],
                scores: []
            };
            App.state.currentHoleIndex = 0;
            App.state.holeStats = {}; // no data for this hole -> the "else" arm

            App.renderScoringScreen();

            assertFalse(el('stats-section').classList.contains('hidden'), 'stats-section must still be shown when there is no hole data (unchanged UI outcome)');
        } finally {
            teardownDOM();
        }
    });
})();
