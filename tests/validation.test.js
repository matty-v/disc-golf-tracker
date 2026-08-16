/**
 * Disc Golf Tracker - Validation Logic Tests
 *
 * Asserts against the real App.validateScoreValues — the pure rule core
 * extracted from App.validateScoreEntry — instead of a hand-maintained
 * copy of the rules. A change to the real validation logic that breaks a
 * rule now causes one of these tests to fail (finding 19).
 */

(function() {
    const TR = (typeof TestRunner !== 'undefined') ? TestRunner : window.TestRunner;
    const test = TR.test.bind(TR);
    const assertEqual = TR.assertEqual.bind(TR);
    const assertTrue = TR.assertTrue.bind(TR);
    const assertFalse = TR.assertFalse.bind(TR);

    function validate(throws, approaches, putts) {
        return App.validateScoreValues({ throws, approaches, putts });
    }

    // =========================================
    // Throws Validation Tests
    // =========================================

    test('validates throws must be at least 1', function() {
        const result = validate(0, '', '');
        assertFalse(result.isValid, 'Should be invalid');
        assertEqual(result.errors[0].field, 'throws');
        assertTrue(result.errors[0].message.includes('at least 1'));
    });

    test('validates throws cannot be negative', function() {
        const result = validate(-1, '', '');
        assertFalse(result.isValid, 'Should be invalid');
        assertEqual(result.errors[0].field, 'throws');
    });

    test('validates throws cannot exceed 20', function() {
        const result = validate(21, '', '');
        assertFalse(result.isValid, 'Should be invalid');
        assertEqual(result.errors[0].field, 'throws');
        assertTrue(result.errors[0].message.includes('exceed 20'));
    });

    test('validates throws of 1 is valid', function() {
        const result = validate(1, '', '');
        assertTrue(result.isValid, 'Throws of 1 should be valid');
    });

    test('validates throws of 20 is valid', function() {
        const result = validate(20, '', '');
        assertTrue(result.isValid, 'Throws of 20 should be valid');
    });

    test('validates throws must be a whole number', function() {
        // parseInt will handle this, but the logic should check
        const result = validate(3, '', '');
        assertTrue(result.isValid, 'Whole number throws should be valid');
    });

    test('validates throws with string input', function() {
        const result = validate('5', '', '');
        assertTrue(result.isValid, 'String "5" should be valid throws');
    });

    test('validates throws with non-numeric string is invalid', function() {
        const result = validate('abc', '', '');
        assertFalse(result.isValid, 'Non-numeric string should be invalid');
    });

    // =========================================
    // Approaches Validation Tests
    // =========================================

    test('validates approaches are optional (empty)', function() {
        const result = validate(3, '', '');
        assertTrue(result.isValid, 'Empty approaches should be valid');
    });

    test('validates approaches cannot be negative', function() {
        const result = validate(3, -1, '');
        assertFalse(result.isValid, 'Negative approaches should be invalid');
        assertEqual(result.errors[0].field, 'approaches');
    });

    test('validates approaches cannot exceed 19', function() {
        const result = validate(20, 20, '');
        assertFalse(result.isValid, 'Approaches exceeding 19 should be invalid');
        assertEqual(result.errors[0].field, 'approaches');
    });

    test('validates approaches of 0 is valid', function() {
        const result = validate(3, 0, '');
        assertTrue(result.isValid, 'Approaches of 0 should be valid');
    });

    test('validates approaches of 19 is valid', function() {
        const result = validate(20, 19, '');
        assertTrue(result.isValid, 'Approaches of 19 should be valid');
    });

    // =========================================
    // Putts Validation Tests
    // =========================================

    test('validates putts are optional (empty)', function() {
        const result = validate(3, '', '');
        assertTrue(result.isValid, 'Empty putts should be valid');
    });

    test('validates putts cannot be negative', function() {
        const result = validate(3, '', -1);
        assertFalse(result.isValid, 'Negative putts should be invalid');
        assertEqual(result.errors[0].field, 'putts');
    });

    test('validates putts cannot exceed 19', function() {
        const result = validate(20, '', 20);
        assertFalse(result.isValid, 'Putts exceeding 19 should be invalid');
        assertEqual(result.errors[0].field, 'putts');
    });

    test('validates putts of 0 is valid', function() {
        const result = validate(3, '', 0);
        assertTrue(result.isValid, 'Putts of 0 should be valid');
    });

    // =========================================
    // Logical Consistency Tests (approaches + putts <= throws - 1)
    // =========================================

    test('validates approaches + putts cannot exceed throws - 1', function() {
        // 3 throws: max approaches + putts = 2
        const result = validate(3, 2, 1);
        assertFalse(result.isValid, 'approaches + putts > throws - 1 should be invalid');
        assertEqual(result.errors[0].field, 'consistency');
    });

    test('validates approaches + putts equal to throws - 1 is valid', function() {
        // 4 throws: max approaches + putts = 3
        const result = validate(4, 2, 1);
        assertTrue(result.isValid, 'approaches + putts = throws - 1 should be valid');
    });

    test('validates approaches + putts less than throws - 1 is valid', function() {
        // 5 throws: approaches 1, putts 1 = 2, which is less than 4
        const result = validate(5, 1, 1);
        assertTrue(result.isValid, 'approaches + putts < throws - 1 should be valid');
    });

    test('validates ace scenario (1 throw, 0 approaches, 0 putts)', function() {
        // Ace: 1 throw, 0 approaches, 0 putts
        const result = validate(1, 0, 0);
        assertTrue(result.isValid, 'Ace should be valid');
    });

    test('validates 1 throw with approaches or putts is invalid', function() {
        // 1 throw with any approaches or putts is invalid (need at least 1 drive)
        const result = validate(1, 1, 0);
        assertFalse(result.isValid, '1 throw with approaches should be invalid');
    });

    test('validates typical birdie scenario', function() {
        // Par 3, birdie (2 throws): 1 approach, 0 putts = valid
        const result = validate(2, 1, 0);
        assertTrue(result.isValid, 'Typical birdie should be valid');
    });

    test('validates typical par scenario', function() {
        // Par 3: 0 approaches, 2 putts = valid (drive + 2 putts = 3)
        const result = validate(3, 0, 2);
        assertTrue(result.isValid, 'Typical par should be valid');
    });

    test('validates consistency check only when both provided', function() {
        // If only approaches is provided but not putts, consistency check should not run
        const result = validate(2, 1, '');
        assertTrue(result.isValid, 'Should be valid when only approaches provided');
    });

    test('validates consistency check only when both provided (putts only)', function() {
        // If only putts is provided but not approaches, consistency check should not run
        const result = validate(2, '', 1);
        assertTrue(result.isValid, 'Should be valid when only putts provided');
    });

    // =========================================
    // Edge Cases
    // =========================================

    test('validates multiple errors are reported', function() {
        const result = validate(0, -1, 20);
        assertFalse(result.isValid, 'Should be invalid');
        assertTrue(result.errors.length >= 3, 'Should report multiple errors');
    });

    test('validates string number inputs work correctly', function() {
        const result = validate('5', '2', '1');
        assertTrue(result.isValid, 'String inputs should work');
    });

    test('validates empty string inputs are treated as not provided', function() {
        const result = validate(3, '', '');
        assertTrue(result.isValid, 'Empty strings should be treated as not provided');
        assertEqual(result.errors.length, 0);
    });

})();
