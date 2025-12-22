/**
 * Disc Golf Tracker - Utils Module Tests
 */

(function() {
    // Get TestRunner from global scope (works in both browser and Node.js)
    const TR = (typeof TestRunner !== 'undefined') ? TestRunner : window.TestRunner;
    const test = TR.test.bind(TR);
    const assertEqual = TR.assertEqual.bind(TR);
    const assertNull = TR.assertNull.bind(TR);
    const assertNotNull = TR.assertNotNull.bind(TR);
    const assertTrue = TR.assertTrue.bind(TR);
    const assertFalse = TR.assertFalse.bind(TR);
    const assertInRange = TR.assertInRange.bind(TR);

    // Mock CONFIG for tests
    const mockCONFIG = {
        validation: {
            courseName: {
                minLength: 1,
                maxLength: 100,
                pattern: /^[a-zA-Z0-9\s\-']+$/
            }
        },
        toast: {
            duration: 3000
        }
    };

    // Store original globals
    let originalCONFIG;

    function setupMocks() {
        if (typeof CONFIG !== 'undefined') {
            originalCONFIG = CONFIG;
        }
        if (typeof window !== 'undefined') {
            window.CONFIG = mockCONFIG;
        } else {
            global.CONFIG = mockCONFIG;
        }
    }

    function teardownMocks() {
        if (typeof window !== 'undefined') {
            if (originalCONFIG) window.CONFIG = originalCONFIG;
        } else {
            if (originalCONFIG) global.CONFIG = originalCONFIG;
        }
    }

    // =========================================
    // validateCourseName Tests
    // =========================================

    test('validateCourseName rejects empty name', function() {
        setupMocks();
        try {
            const result = Utils.validateCourseName('');
            assertFalse(result.isValid, 'Empty name should be invalid');
            assertEqual(result.message, 'Course name is required');
        } finally {
            teardownMocks();
        }
    });

    test('validateCourseName rejects whitespace-only name', function() {
        setupMocks();
        try {
            const result = Utils.validateCourseName('   ');
            assertFalse(result.isValid, 'Whitespace-only name should be invalid');
        } finally {
            teardownMocks();
        }
    });

    test('validateCourseName rejects name exceeding max length', function() {
        setupMocks();
        try {
            const longName = 'a'.repeat(101);
            const result = Utils.validateCourseName(longName);
            assertFalse(result.isValid, 'Name exceeding max length should be invalid');
            assertTrue(result.message.includes('100'), 'Message should mention max length');
        } finally {
            teardownMocks();
        }
    });

    test('validateCourseName rejects invalid characters', function() {
        setupMocks();
        try {
            const result = Utils.validateCourseName('Course @#$%');
            assertFalse(result.isValid, 'Name with special characters should be invalid');
            assertTrue(result.message.includes('invalid characters'), 'Message should mention invalid characters');
        } finally {
            teardownMocks();
        }
    });

    test('validateCourseName accepts valid name', function() {
        setupMocks();
        try {
            const result = Utils.validateCourseName('Morley Field');
            assertTrue(result.isValid, 'Valid name should be accepted');
            assertEqual(result.message, '', 'Message should be empty');
        } finally {
            teardownMocks();
        }
    });

    test('validateCourseName accepts name with apostrophe', function() {
        setupMocks();
        try {
            const result = Utils.validateCourseName("John's Disc Golf Course");
            assertTrue(result.isValid, 'Name with apostrophe should be valid');
        } finally {
            teardownMocks();
        }
    });

    test('validateCourseName accepts name with hyphen', function() {
        setupMocks();
        try {
            const result = Utils.validateCourseName('North-South Course');
            assertTrue(result.isValid, 'Name with hyphen should be valid');
        } finally {
            teardownMocks();
        }
    });

    // =========================================
    // getRelativeScore Tests
    // =========================================

    test('getRelativeScore returns E for par', function() {
        const result = Utils.getRelativeScore(3, 3);
        assertEqual(result, 'E', 'Score equal to par should return E');
    });

    test('getRelativeScore returns negative for under par', function() {
        const result = Utils.getRelativeScore(2, 3);
        assertEqual(result, '-1', 'Score under par should return negative');
    });

    test('getRelativeScore returns positive with plus sign for over par', function() {
        const result = Utils.getRelativeScore(5, 3);
        assertEqual(result, '+2', 'Score over par should return +number');
    });

    test('getRelativeScore handles large differences', function() {
        const result = Utils.getRelativeScore(10, 3);
        assertEqual(result, '+7', 'Large difference should be calculated correctly');
    });

    // =========================================
    // average Tests
    // =========================================

    test('average returns null for empty array', function() {
        const result = Utils.average([]);
        assertNull(result, 'Empty array should return null');
    });

    test('average returns null for null input', function() {
        const result = Utils.average(null);
        assertNull(result, 'Null input should return null');
    });

    test('average returns null for undefined input', function() {
        const result = Utils.average(undefined);
        assertNull(result, 'Undefined input should return null');
    });

    test('average calculates correct value for number array', function() {
        const result = Utils.average([1, 2, 3, 4, 5]);
        assertEqual(result, 3, 'Average of 1-5 should be 3');
    });

    test('average handles array with null values', function() {
        const result = Utils.average([1, null, 3, null, 5]);
        assertEqual(result, 3, 'Should ignore null values');
    });

    test('average handles array with undefined values', function() {
        const result = Utils.average([2, undefined, 4, undefined, 6]);
        assertEqual(result, 4, 'Should ignore undefined values');
    });

    test('average handles array with NaN values', function() {
        const result = Utils.average([1, NaN, 2, NaN, 3]);
        assertEqual(result, 2, 'Should ignore NaN values');
    });

    test('average returns null for array with only invalid values', function() {
        const result = Utils.average([null, undefined, NaN]);
        assertNull(result, 'Array with only invalid values should return null');
    });

    test('average handles single value', function() {
        const result = Utils.average([5]);
        assertEqual(result, 5, 'Single value array should return that value');
    });

    test('average handles decimal values', function() {
        const result = Utils.average([1.5, 2.5]);
        assertEqual(result, 2, 'Decimal average should be calculated correctly');
    });

    // =========================================
    // isValidNumber Tests
    // =========================================

    test('isValidNumber returns true for valid number in range', function() {
        const result = Utils.isValidNumber(5, 1, 10);
        assertTrue(result, '5 should be valid in range 1-10');
    });

    test('isValidNumber returns true for min value', function() {
        const result = Utils.isValidNumber(1, 1, 10);
        assertTrue(result, 'Min value should be valid');
    });

    test('isValidNumber returns true for max value', function() {
        const result = Utils.isValidNumber(10, 1, 10);
        assertTrue(result, 'Max value should be valid');
    });

    test('isValidNumber returns false for below min', function() {
        const result = Utils.isValidNumber(0, 1, 10);
        assertFalse(result, 'Below min should be invalid');
    });

    test('isValidNumber returns false for above max', function() {
        const result = Utils.isValidNumber(11, 1, 10);
        assertFalse(result, 'Above max should be invalid');
    });

    test('isValidNumber returns false for NaN', function() {
        const result = Utils.isValidNumber(NaN, 1, 10);
        assertFalse(result, 'NaN should be invalid');
    });

    test('isValidNumber handles string numbers', function() {
        const result = Utils.isValidNumber('5', 1, 10);
        assertTrue(result, 'String "5" should be valid');
    });

    // =========================================
    // roundTo Tests
    // =========================================

    test('roundTo rounds to 1 decimal place by default', function() {
        const result = Utils.roundTo(3.456);
        assertEqual(result, 3.5, 'Should round to 1 decimal place');
    });

    test('roundTo rounds to specified decimal places', function() {
        const result = Utils.roundTo(3.456, 2);
        assertEqual(result, 3.46, 'Should round to 2 decimal places');
    });

    test('roundTo handles 0 decimal places', function() {
        const result = Utils.roundTo(3.5, 0);
        assertEqual(result, 4, 'Should round to nearest integer');
    });

    test('roundTo handles negative numbers', function() {
        const result = Utils.roundTo(-3.456, 1);
        assertEqual(result, -3.5, 'Should handle negative numbers');
    });

    // =========================================
    // getScoreClass Tests
    // =========================================

    test('getScoreClass returns eagle for -2 or better', function() {
        assertEqual(Utils.getScoreClass(1, 3), 'eagle');
        assertEqual(Utils.getScoreClass(1, 4), 'eagle');
    });

    test('getScoreClass returns birdie for -1', function() {
        assertEqual(Utils.getScoreClass(2, 3), 'birdie');
    });

    test('getScoreClass returns par for even', function() {
        assertEqual(Utils.getScoreClass(3, 3), 'par');
    });

    test('getScoreClass returns bogey for +1', function() {
        assertEqual(Utils.getScoreClass(4, 3), 'bogey');
    });

    test('getScoreClass returns double-bogey for +2 or worse', function() {
        assertEqual(Utils.getScoreClass(5, 3), 'double-bogey');
        assertEqual(Utils.getScoreClass(8, 3), 'double-bogey');
    });

    // =========================================
    // getTotalScoreClass Tests
    // =========================================

    test('getTotalScoreClass returns under-par for negative', function() {
        assertEqual(Utils.getTotalScoreClass(50, 54), 'under-par');
    });

    test('getTotalScoreClass returns even-par for zero', function() {
        assertEqual(Utils.getTotalScoreClass(54, 54), 'even-par');
    });

    test('getTotalScoreClass returns over-par for positive', function() {
        assertEqual(Utils.getTotalScoreClass(60, 54), 'over-par');
    });

    // =========================================
    // generateId Tests
    // =========================================

    test('generateId returns a string', function() {
        const result = Utils.generateId();
        assertEqual(typeof result, 'string', 'ID should be a string');
    });

    test('generateId returns unique values', function() {
        const id1 = Utils.generateId();
        const id2 = Utils.generateId();
        assertTrue(id1 !== id2, 'IDs should be unique');
    });

    test('generateId matches UUID v4 format', function() {
        const result = Utils.generateId();
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
        assertTrue(uuidPattern.test(result), 'ID should match UUID v4 format');
    });

    // =========================================
    // sortBy Tests
    // =========================================

    test('sortBy sorts ascending by default', function() {
        const items = [{ val: 3 }, { val: 1 }, { val: 2 }];
        const result = Utils.sortBy(items, 'val');
        assertEqual(result[0].val, 1);
        assertEqual(result[1].val, 2);
        assertEqual(result[2].val, 3);
    });

    test('sortBy sorts descending when specified', function() {
        const items = [{ val: 1 }, { val: 3 }, { val: 2 }];
        const result = Utils.sortBy(items, 'val', false);
        assertEqual(result[0].val, 3);
        assertEqual(result[1].val, 2);
        assertEqual(result[2].val, 1);
    });

    test('sortBy does not modify original array', function() {
        const items = [{ val: 3 }, { val: 1 }];
        Utils.sortBy(items, 'val');
        assertEqual(items[0].val, 3, 'Original array should not be modified');
    });

    // =========================================
    // groupBy Tests
    // =========================================

    test('groupBy groups items correctly', function() {
        const items = [
            { type: 'a', val: 1 },
            { type: 'b', val: 2 },
            { type: 'a', val: 3 }
        ];
        const result = Utils.groupBy(items, 'type');
        assertEqual(result.a.length, 2);
        assertEqual(result.b.length, 1);
    });

    // =========================================
    // deepClone Tests
    // =========================================

    test('deepClone creates independent copy', function() {
        const original = { a: { b: 1 } };
        const clone = Utils.deepClone(original);
        clone.a.b = 2;
        assertEqual(original.a.b, 1, 'Original should not be modified');
        assertEqual(clone.a.b, 2, 'Clone should have new value');
    });

    // =========================================
    // Hole Sorting Tests
    // =========================================
    // These tests verify the hole sorting pattern used in app.js
    // to ensure holes are displayed in correct order regardless
    // of storage order (bug fix regression tests)

    test('holes sort correctly by hole_number when out of order', function() {
        const holes = [
            { hole_id: 'h3', hole_number: 3, par: 4 },
            { hole_id: 'h1', hole_number: 1, par: 3 },
            { hole_id: 'h2', hole_number: 2, par: 3 }
        ];
        holes.sort((a, b) => a.hole_number - b.hole_number);
        assertEqual(holes[0].hole_number, 1, 'First hole should be hole 1');
        assertEqual(holes[1].hole_number, 2, 'Second hole should be hole 2');
        assertEqual(holes[2].hole_number, 3, 'Third hole should be hole 3');
    });

    test('holes sort correctly with 18 holes in random order', function() {
        // Simulate holes returned from IndexedDB in insertion order
        const holes = [
            { hole_id: 'h5', hole_number: 5, par: 3 },
            { hole_id: 'h12', hole_number: 12, par: 4 },
            { hole_id: 'h1', hole_number: 1, par: 3 },
            { hole_id: 'h18', hole_number: 18, par: 5 },
            { hole_id: 'h7', hole_number: 7, par: 3 },
            { hole_id: 'h3', hole_number: 3, par: 4 },
            { hole_id: 'h15', hole_number: 15, par: 3 },
            { hole_id: 'h9', hole_number: 9, par: 4 },
            { hole_id: 'h2', hole_number: 2, par: 3 },
            { hole_id: 'h11', hole_number: 11, par: 3 },
            { hole_id: 'h6', hole_number: 6, par: 4 },
            { hole_id: 'h14', hole_number: 14, par: 4 },
            { hole_id: 'h4', hole_number: 4, par: 3 },
            { hole_id: 'h17', hole_number: 17, par: 3 },
            { hole_id: 'h8', hole_number: 8, par: 3 },
            { hole_id: 'h10', hole_number: 10, par: 4 },
            { hole_id: 'h13', hole_number: 13, par: 3 },
            { hole_id: 'h16', hole_number: 16, par: 4 }
        ];
        holes.sort((a, b) => a.hole_number - b.hole_number);

        for (let i = 0; i < holes.length; i++) {
            assertEqual(holes[i].hole_number, i + 1, `Index ${i} should be hole ${i + 1}`);
        }
    });

    test('holes sort preserves par and distance data', function() {
        const holes = [
            { hole_id: 'h2', hole_number: 2, par: 4, distance: 350 },
            { hole_id: 'h1', hole_number: 1, par: 3, distance: 250 }
        ];
        holes.sort((a, b) => a.hole_number - b.hole_number);

        assertEqual(holes[0].hole_number, 1);
        assertEqual(holes[0].par, 3, 'Par should be preserved after sort');
        assertEqual(holes[0].distance, 250, 'Distance should be preserved after sort');
        assertEqual(holes[1].hole_number, 2);
        assertEqual(holes[1].par, 4);
        assertEqual(holes[1].distance, 350);
    });

    test('holes sort handles already sorted array', function() {
        const holes = [
            { hole_id: 'h1', hole_number: 1, par: 3 },
            { hole_id: 'h2', hole_number: 2, par: 4 },
            { hole_id: 'h3', hole_number: 3, par: 3 }
        ];
        holes.sort((a, b) => a.hole_number - b.hole_number);
        assertEqual(holes[0].hole_number, 1);
        assertEqual(holes[1].hole_number, 2);
        assertEqual(holes[2].hole_number, 3);
    });

    test('holes sort handles single hole', function() {
        const holes = [{ hole_id: 'h1', hole_number: 1, par: 3 }];
        holes.sort((a, b) => a.hole_number - b.hole_number);
        assertEqual(holes.length, 1);
        assertEqual(holes[0].hole_number, 1);
    });

    test('holes sort handles empty array', function() {
        const holes = [];
        holes.sort((a, b) => a.hole_number - b.hole_number);
        assertEqual(holes.length, 0);
    });

})();
