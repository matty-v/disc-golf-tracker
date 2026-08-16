/**
 * Disc Golf Tracker - Config Deep-Freeze Tests
 *
 * A flat Object.freeze(CONFIG) locks the top level and each direct child
 * object, but not what's nested underneath those — CONFIG.validation.
 * courseName and the sheetHeaders.* arrays were still mutable (finding 24).
 */

(function() {
    const TR = (typeof TestRunner !== 'undefined') ? TestRunner : window.TestRunner;
    const test = TR.test.bind(TR);
    const assertTrue = TR.assertTrue.bind(TR);
    const assertEqual = TR.assertEqual.bind(TR);

    test('CONFIG.validation.courseName (nested one level deep) cannot be mutated', function() {
        'use strict';
        let threw = false;
        try {
            CONFIG.validation.courseName.maxLength = 999;
        } catch (e) {
            threw = true;
        }
        assertTrue(threw || CONFIG.validation.courseName.maxLength !== 999, 'a nested config object must be frozen, not just the top level');
    });

    test('applyValidationBounds sets each input\'s min/max from CONFIG.validation, not a hardcoded copy', function() {
        const elements = {};
        function fakeEl(id) {
            if (!elements[id]) elements[id] = { id, min: null, max: null };
            return elements[id];
        }
        const originalGetElementById = document.getElementById;
        document.getElementById = fakeEl;
        try {
            App.applyValidationBounds();
            assertEqual(elements['score-throws'].min, CONFIG.validation.throws.min);
            assertEqual(elements['score-throws'].max, CONFIG.validation.throws.max);
            assertEqual(elements['hole-count'].min, CONFIG.validation.holeCount.min);
            assertEqual(elements['hole-count'].max, CONFIG.validation.holeCount.max);
            assertEqual(elements['edit-distance'].max, CONFIG.validation.distance.max);
        } finally {
            document.getElementById = originalGetElementById;
        }
    });

    test('CONFIG.sheetHeaders.courses (a nested array) cannot be mutated', function() {
        'use strict';
        let threw = false;
        try {
            CONFIG.sheetHeaders.courses.push('hacked');
        } catch (e) {
            threw = true;
        }
        assertTrue(threw, 'a nested array must be frozen too');
        assertEqual(CONFIG.sheetHeaders.courses.includes('hacked'), false);
    });
})();
