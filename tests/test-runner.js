/**
 * Disc Golf Tracker - Simple Test Runner
 *
 * A lightweight test framework that can run in both browser and Node.js environments.
 * No external dependencies required.
 */

const TestRunner = {
    tests: [],
    results: {
        passed: 0,
        failed: 0,
        errors: []
    },

    /**
     * Register a test
     * @param {string} name - Test name
     * @param {Function} fn - Test function
     */
    test(name, fn) {
        this.tests.push({ name, fn });
    },

    /**
     * Register a test suite
     * @param {string} suiteName - Suite name
     * @param {Function} fn - Suite function containing tests
     */
    describe(suiteName, fn) {
        this.currentSuite = suiteName;
        fn();
        this.currentSuite = null;
    },

    /**
     * Assert that a condition is true
     * @param {boolean} condition - Condition to check
     * @param {string} message - Error message if assertion fails
     */
    assert(condition, message) {
        if (!condition) {
            throw new Error(message || 'Assertion failed');
        }
    },

    /**
     * Assert that two values are equal
     * @param {*} actual - Actual value
     * @param {*} expected - Expected value
     * @param {string} message - Optional error message
     */
    assertEqual(actual, expected, message) {
        if (actual !== expected) {
            throw new Error(message || `Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`);
        }
    },

    /**
     * Assert that two values are deeply equal
     * @param {*} actual - Actual value
     * @param {*} expected - Expected value
     * @param {string} message - Optional error message
     */
    assertDeepEqual(actual, expected, message) {
        const actualStr = JSON.stringify(actual);
        const expectedStr = JSON.stringify(expected);
        if (actualStr !== expectedStr) {
            throw new Error(message || `Expected ${expectedStr}, but got ${actualStr}`);
        }
    },

    /**
     * Assert that a value is null
     * @param {*} value - Value to check
     * @param {string} message - Optional error message
     */
    assertNull(value, message) {
        if (value !== null) {
            throw new Error(message || `Expected null, but got ${JSON.stringify(value)}`);
        }
    },

    /**
     * Assert that a value is not null
     * @param {*} value - Value to check
     * @param {string} message - Optional error message
     */
    assertNotNull(value, message) {
        if (value === null) {
            throw new Error(message || 'Expected value to not be null');
        }
    },

    /**
     * Assert that a value is truthy
     * @param {*} value - Value to check
     * @param {string} message - Optional error message
     */
    assertTrue(value, message) {
        if (!value) {
            throw new Error(message || `Expected truthy value, but got ${JSON.stringify(value)}`);
        }
    },

    /**
     * Assert that a value is falsy
     * @param {*} value - Value to check
     * @param {string} message - Optional error message
     */
    assertFalse(value, message) {
        if (value) {
            throw new Error(message || `Expected falsy value, but got ${JSON.stringify(value)}`);
        }
    },

    /**
     * Assert that a function throws an error
     * @param {Function} fn - Function to execute
     * @param {string} message - Optional error message
     */
    assertThrows(fn, message) {
        let threw = false;
        try {
            fn();
        } catch (e) {
            threw = true;
        }
        if (!threw) {
            throw new Error(message || 'Expected function to throw an error');
        }
    },

    /**
     * Assert that a value is within a range (inclusive)
     * @param {number} value - Value to check
     * @param {number} min - Minimum value
     * @param {number} max - Maximum value
     * @param {string} message - Optional error message
     */
    assertInRange(value, min, max, message) {
        if (value < min || value > max) {
            throw new Error(message || `Expected ${value} to be in range [${min}, ${max}]`);
        }
    },

    /**
     * Run all registered tests
     * @returns {Object} Test results
     */
    async run() {
        this.results = { passed: 0, failed: 0, errors: [] };

        console.log('\n========================================');
        console.log('Running Disc Golf Tracker Tests');
        console.log('========================================\n');

        for (const test of this.tests) {
            try {
                await test.fn();
                this.results.passed++;
                console.log(`  PASS: ${test.name}`);
            } catch (error) {
                this.results.failed++;
                this.results.errors.push({ name: test.name, error: error.message });
                console.log(`  FAIL: ${test.name}`);
                console.log(`        ${error.message}`);
            }
        }

        console.log('\n========================================');
        console.log(`Results: ${this.results.passed} passed, ${this.results.failed} failed`);
        console.log('========================================\n');

        return this.results;
    },

    /**
     * Clear all tests
     */
    clear() {
        this.tests = [];
        this.results = { passed: 0, failed: 0, errors: [] };
    }
};

// Export for Node.js or make global for browser/VM context
if (typeof window !== 'undefined') {
    window.TestRunner = TestRunner;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TestRunner;
}
// Also set as global for VM contexts
if (typeof globalThis !== 'undefined') {
    globalThis.TestRunner = TestRunner;
}
