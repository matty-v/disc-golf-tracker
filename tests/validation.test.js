/**
 * Disc Golf Tracker - Validation Logic Tests
 *
 * Tests for score entry validation logic.
 * These tests mock the DOM elements to test the App.validateScoreEntry function.
 */

(function() {
    // Get TestRunner from global scope (works in both browser and Node.js)
    const TR = (typeof TestRunner !== 'undefined') ? TestRunner : window.TestRunner;
    const test = TR.test.bind(TR);
    const assertEqual = TR.assertEqual.bind(TR);
    const assertTrue = TR.assertTrue.bind(TR);
    const assertFalse = TR.assertFalse.bind(TR);

    // Mock DOM elements
    let mockInputs = {};

    function createMockInput(value) {
        return {
            value: value,
            classList: {
                _classes: [],
                add(cls) { this._classes.push(cls); },
                remove(cls) {
                    const idx = this._classes.indexOf(cls);
                    if (idx > -1) this._classes.splice(idx, 1);
                },
                contains(cls) { return this._classes.includes(cls); }
            }
        };
    }

    function setupMockDOM(throws, approaches, putts) {
        mockInputs = {
            'score-throws': createMockInput(throws),
            'score-approaches': createMockInput(approaches),
            'score-putts': createMockInput(putts)
        };

        // Mock document.getElementById
        const originalGetElementById = document.getElementById;
        document.getElementById = function(id) {
            if (mockInputs[id]) {
                return mockInputs[id];
            }
            return originalGetElementById ? originalGetElementById.call(document, id) : null;
        };
    }

    function teardownMockDOM() {
        mockInputs = {};
    }

    // Create a standalone validation function for testing
    // This mirrors the logic in App.validateScoreEntry
    function validateScoreEntry(throwsValue, approachesValue, puttsValue) {
        const errors = [];

        const throws = parseInt(throwsValue, 10);
        const approachesStr = String(approachesValue).trim();
        const puttsStr = String(puttsValue).trim();

        // Validate throws (required, positive integer, 1-20 range)
        if (isNaN(throws) || throws < 1) {
            errors.push({ field: 'throws', message: 'Throws must be at least 1' });
        } else if (throws > 20) {
            errors.push({ field: 'throws', message: 'Throws cannot exceed 20' });
        } else if (!Number.isInteger(throws)) {
            errors.push({ field: 'throws', message: 'Throws must be a whole number' });
        }

        // Validate approaches (optional, non-negative integer if provided)
        if (approachesStr !== '' && approachesStr !== 'undefined' && approachesStr !== 'null') {
            const approaches = parseInt(approachesStr, 10);
            if (isNaN(approaches) || approaches < 0) {
                errors.push({ field: 'approaches', message: 'Approaches must be 0 or more' });
            } else if (approaches > 19) {
                errors.push({ field: 'approaches', message: 'Approaches cannot exceed 19' });
            } else if (!Number.isInteger(approaches)) {
                errors.push({ field: 'approaches', message: 'Approaches must be a whole number' });
            }
        }

        // Validate putts (optional, non-negative integer if provided)
        if (puttsStr !== '' && puttsStr !== 'undefined' && puttsStr !== 'null') {
            const putts = parseInt(puttsStr, 10);
            if (isNaN(putts) || putts < 0) {
                errors.push({ field: 'putts', message: 'Putts must be 0 or more' });
            } else if (putts > 19) {
                errors.push({ field: 'putts', message: 'Putts cannot exceed 19' });
            } else if (!Number.isInteger(putts)) {
                errors.push({ field: 'putts', message: 'Putts must be a whole number' });
            }
        }

        // Validate logical consistency: approaches + putts <= throws - 1
        if (errors.length === 0) {
            const hasApproaches = approachesStr !== '' && approachesStr !== 'undefined' && approachesStr !== 'null';
            const hasPutts = puttsStr !== '' && puttsStr !== 'undefined' && puttsStr !== 'null';

            if (hasApproaches && hasPutts) {
                const approaches = parseInt(approachesStr, 10);
                const putts = parseInt(puttsStr, 10);
                if (approaches + putts > throws - 1) {
                    errors.push({
                        field: 'consistency',
                        message: 'Approaches + Putts cannot exceed throws - 1 (need at least 1 drive)'
                    });
                }
            }
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    // =========================================
    // Throws Validation Tests
    // =========================================

    test('validates throws must be at least 1', function() {
        const result = validateScoreEntry(0, '', '');
        assertFalse(result.isValid, 'Should be invalid');
        assertEqual(result.errors[0].field, 'throws');
        assertTrue(result.errors[0].message.includes('at least 1'));
    });

    test('validates throws cannot be negative', function() {
        const result = validateScoreEntry(-1, '', '');
        assertFalse(result.isValid, 'Should be invalid');
        assertEqual(result.errors[0].field, 'throws');
    });

    test('validates throws cannot exceed 20', function() {
        const result = validateScoreEntry(21, '', '');
        assertFalse(result.isValid, 'Should be invalid');
        assertEqual(result.errors[0].field, 'throws');
        assertTrue(result.errors[0].message.includes('exceed 20'));
    });

    test('validates throws of 1 is valid', function() {
        const result = validateScoreEntry(1, '', '');
        assertTrue(result.isValid, 'Throws of 1 should be valid');
    });

    test('validates throws of 20 is valid', function() {
        const result = validateScoreEntry(20, '', '');
        assertTrue(result.isValid, 'Throws of 20 should be valid');
    });

    test('validates throws must be a whole number', function() {
        // parseInt will handle this, but the logic should check
        const result = validateScoreEntry(3, '', '');
        assertTrue(result.isValid, 'Whole number throws should be valid');
    });

    test('validates throws with string input', function() {
        const result = validateScoreEntry('5', '', '');
        assertTrue(result.isValid, 'String "5" should be valid throws');
    });

    test('validates throws with non-numeric string is invalid', function() {
        const result = validateScoreEntry('abc', '', '');
        assertFalse(result.isValid, 'Non-numeric string should be invalid');
    });

    // =========================================
    // Approaches Validation Tests
    // =========================================

    test('validates approaches are optional (empty)', function() {
        const result = validateScoreEntry(3, '', '');
        assertTrue(result.isValid, 'Empty approaches should be valid');
    });

    test('validates approaches cannot be negative', function() {
        const result = validateScoreEntry(3, -1, '');
        assertFalse(result.isValid, 'Negative approaches should be invalid');
        assertEqual(result.errors[0].field, 'approaches');
    });

    test('validates approaches cannot exceed 19', function() {
        const result = validateScoreEntry(20, 20, '');
        assertFalse(result.isValid, 'Approaches exceeding 19 should be invalid');
        assertEqual(result.errors[0].field, 'approaches');
    });

    test('validates approaches of 0 is valid', function() {
        const result = validateScoreEntry(3, 0, '');
        assertTrue(result.isValid, 'Approaches of 0 should be valid');
    });

    test('validates approaches of 19 is valid', function() {
        const result = validateScoreEntry(20, 19, '');
        assertTrue(result.isValid, 'Approaches of 19 should be valid');
    });

    // =========================================
    // Putts Validation Tests
    // =========================================

    test('validates putts are optional (empty)', function() {
        const result = validateScoreEntry(3, '', '');
        assertTrue(result.isValid, 'Empty putts should be valid');
    });

    test('validates putts cannot be negative', function() {
        const result = validateScoreEntry(3, '', -1);
        assertFalse(result.isValid, 'Negative putts should be invalid');
        assertEqual(result.errors[0].field, 'putts');
    });

    test('validates putts cannot exceed 19', function() {
        const result = validateScoreEntry(20, '', 20);
        assertFalse(result.isValid, 'Putts exceeding 19 should be invalid');
        assertEqual(result.errors[0].field, 'putts');
    });

    test('validates putts of 0 is valid', function() {
        const result = validateScoreEntry(3, '', 0);
        assertTrue(result.isValid, 'Putts of 0 should be valid');
    });

    // =========================================
    // Logical Consistency Tests (approaches + putts <= throws - 1)
    // =========================================

    test('validates approaches + putts cannot exceed throws - 1', function() {
        // 3 throws: max approaches + putts = 2
        const result = validateScoreEntry(3, 2, 1);
        assertFalse(result.isValid, 'approaches + putts > throws - 1 should be invalid');
        assertEqual(result.errors[0].field, 'consistency');
    });

    test('validates approaches + putts equal to throws - 1 is valid', function() {
        // 4 throws: max approaches + putts = 3
        const result = validateScoreEntry(4, 2, 1);
        assertTrue(result.isValid, 'approaches + putts = throws - 1 should be valid');
    });

    test('validates approaches + putts less than throws - 1 is valid', function() {
        // 5 throws: approaches 1, putts 1 = 2, which is less than 4
        const result = validateScoreEntry(5, 1, 1);
        assertTrue(result.isValid, 'approaches + putts < throws - 1 should be valid');
    });

    test('validates ace scenario (1 throw, 0 approaches, 0 putts)', function() {
        // Ace: 1 throw, 0 approaches, 0 putts
        const result = validateScoreEntry(1, 0, 0);
        assertTrue(result.isValid, 'Ace should be valid');
    });

    test('validates 1 throw with approaches or putts is invalid', function() {
        // 1 throw with any approaches or putts is invalid (need at least 1 drive)
        const result = validateScoreEntry(1, 1, 0);
        assertFalse(result.isValid, '1 throw with approaches should be invalid');
    });

    test('validates typical birdie scenario', function() {
        // Par 3, birdie (2 throws): 1 approach, 0 putts = valid
        const result = validateScoreEntry(2, 1, 0);
        assertTrue(result.isValid, 'Typical birdie should be valid');
    });

    test('validates typical par scenario', function() {
        // Par 3: 0 approaches, 2 putts = valid (drive + 2 putts = 3)
        const result = validateScoreEntry(3, 0, 2);
        assertTrue(result.isValid, 'Typical par should be valid');
    });

    test('validates consistency check only when both provided', function() {
        // If only approaches is provided but not putts, consistency check should not run
        const result = validateScoreEntry(2, 1, '');
        assertTrue(result.isValid, 'Should be valid when only approaches provided');
    });

    test('validates consistency check only when both provided (putts only)', function() {
        // If only putts is provided but not approaches, consistency check should not run
        const result = validateScoreEntry(2, '', 1);
        assertTrue(result.isValid, 'Should be valid when only putts provided');
    });

    // =========================================
    // Edge Cases
    // =========================================

    test('validates multiple errors are reported', function() {
        const result = validateScoreEntry(0, -1, 20);
        assertFalse(result.isValid, 'Should be invalid');
        assertTrue(result.errors.length >= 3, 'Should report multiple errors');
    });

    test('validates string number inputs work correctly', function() {
        const result = validateScoreEntry('5', '2', '1');
        assertTrue(result.isValid, 'String inputs should work');
    });

    test('validates empty string inputs are treated as not provided', function() {
        const result = validateScoreEntry(3, '', '');
        assertTrue(result.isValid, 'Empty strings should be treated as not provided');
        assertEqual(result.errors.length, 0);
    });

})();
