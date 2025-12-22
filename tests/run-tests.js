#!/usr/bin/env node
/**
 * Disc Golf Tracker - Node.js Test Runner
 *
 * Run tests from the command line: node tests/run-tests.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Create a global context for running tests
const context = {
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Date: Date,
    Math: Math,
    JSON: JSON,
    Number: Number,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    Object: Object,
    Array: Array,
    String: String,
    Error: Error,
    RegExp: RegExp,
    Promise: Promise,
    document: {
        getElementById: () => null,
        querySelectorAll: () => [],
        createElement: () => ({
            classList: { add: () => {}, remove: () => {}, toggle: () => {} },
            appendChild: () => {},
            textContent: ''
        })
    },
    localStorage: {
        _data: {},
        getItem(key) { return this._data[key] || null; },
        setItem(key, value) { this._data[key] = value; },
        removeItem(key) { delete this._data[key]; },
        clear() { this._data = {}; }
    },
    sessionStorage: {
        _data: {},
        getItem(key) { return this._data[key] || null; },
        setItem(key, value) { this._data[key] = value; },
        removeItem(key) { delete this._data[key]; },
        clear() { this._data = {}; }
    },
    module: { exports: {} }
};

// Add navigator
context.navigator = { onLine: true };

// Make window point to context itself so window.X = Y works
context.window = context;

// Make context properties available globally in the VM
vm.createContext(context);

// Helper to load and execute a JS file in the context
function loadScript(filePath) {
    const code = fs.readFileSync(filePath, 'utf8');
    const script = new vm.Script(code, { filename: filePath });
    script.runInContext(context);
}

// Load application files
const jsDir = path.join(__dirname, '..', 'js');
const testsDir = __dirname;

console.log('Loading application modules...\n');

try {
    // Load config first
    loadScript(path.join(jsDir, 'config.js'));
    console.log('  Loaded: config.js');

    // Load utils
    loadScript(path.join(jsDir, 'utils.js'));
    console.log('  Loaded: utils.js');

    // Load statistics
    loadScript(path.join(jsDir, 'statistics.js'));
    console.log('  Loaded: statistics.js');

    // Load test runner
    loadScript(path.join(testsDir, 'test-runner.js'));
    console.log('  Loaded: test-runner.js');

    // Load test files
    loadScript(path.join(testsDir, 'utils.test.js'));
    console.log('  Loaded: utils.test.js');

    loadScript(path.join(testsDir, 'statistics.test.js'));
    console.log('  Loaded: statistics.test.js');

    loadScript(path.join(testsDir, 'validation.test.js'));
    console.log('  Loaded: validation.test.js');

    // Run tests
    context.TestRunner.run().then(results => {
        console.log('\n');
        if (results.failed > 0) {
            process.exit(1);
        }
        process.exit(0);
    });

} catch (error) {
    console.error('Error loading scripts:', error.message);
    console.error(error.stack);
    process.exit(1);
}
