/**
 * Disc Golf Tracker - Sync Layer Tests
 *
 * Exercises the real SheetsAPI module's write/update/pending-sync logic
 * against a fake fetch, instead of a hand-maintained copy.
 */

(function() {
    const TR = (typeof TestRunner !== 'undefined') ? TestRunner : window.TestRunner;
    const test = TR.test.bind(TR);
    const assertEqual = TR.assertEqual.bind(TR);
    const assertTrue = TR.assertTrue.bind(TR);
    const assertFalse = TR.assertFalse.bind(TR);

    function jsonResponse(body, status = 200) {
        return {
            ok: status >= 200 && status < 300,
            status,
            json: async () => body
        };
    }

    function resetStorage() {
        Storage.db = null;
        localStorage.clear();
    }

    // =========================================
    // updateRowById read-back verification (finding 11)
    // =========================================

    test('updateRowById succeeds when the read-back confirms the same row', async function() {
        const originalFetch = globalThis.fetch;
        try {
            let call = 0;
            globalThis.fetch = async (url, options) => {
                call++;
                if (options && options.method === 'PUT') {
                    return jsonResponse({});
                }
                // Both the locate-read and the read-back return the same row set.
                return jsonResponse({ rows: [{ course_id: 'c1', course_name: 'A' }] });
            };

            const ok = await SheetsAPI.updateRowById(
                CONFIG.sheets.courses, 'course_id', 'c1', CONFIG.sheetHeaders.courses,
                (course) => { course.last_played = '2026-01-01'; return course; }
            );

            assertTrue(ok, 'a normal update with a matching read-back must succeed');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('updateRowById detects a read-back mismatch and reports failure instead of silently corrupting a row', async function() {
        const originalFetch = globalThis.fetch;
        try {
            let getCalls = 0;
            globalThis.fetch = async (url, options) => {
                if (options && options.method === 'PUT') {
                    return jsonResponse({});
                }
                getCalls++;
                if (getCalls === 1) {
                    // Locate read: c1 is at index 0.
                    return jsonResponse({ rows: [{ course_id: 'c1', course_name: 'A' }, { course_id: 'c2', course_name: 'B' }] });
                }
                // Read-back: another writer inserted a row ahead of c1 between
                // the locate-read and the write — index 0 is no longer c1.
                return jsonResponse({ rows: [{ course_id: 'c0', course_name: 'Z' }, { course_id: 'c1', course_name: 'A' }, { course_id: 'c2', course_name: 'B' }] });
            };

            const ok = await SheetsAPI.updateRowById(
                CONFIG.sheets.courses, 'course_id', 'c1', CONFIG.sheetHeaders.courses,
                (course) => { course.last_played = '2026-01-01'; return course; }
            );

            assertFalse(ok, 'a read-back mismatch must be reported as a detected failure, not silently accepted');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    // =========================================
    // saveHoles/saveScores run concurrently (finding 24 batching AC)
    // =========================================

    test('saveHoles issues requests concurrently rather than one at a time', async function() {
        const originalFetch = globalThis.fetch;
        try {
            let inFlight = 0;
            let maxInFlight = 0;
            globalThis.fetch = async () => {
                inFlight++;
                maxInFlight = Math.max(maxInFlight, inFlight);
                await new Promise(resolve => setTimeout(resolve, 5));
                inFlight--;
                return jsonResponse({ rowIndex: 2 });
            };

            const holes = Array.from({ length: 4 }, (_, i) => ({ hole_id: `h${i}`, course_id: 'c1', hole_number: i + 1, par: 3, distance: null, description: '' }));
            await SheetsAPI.saveHoles(holes);

            assertTrue(maxInFlight > 1, 'saveHoles must issue requests concurrently, not sequentially');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    // =========================================
    // processPendingSync never silently drops an unrecognised operation (finding 10)
    // =========================================

    test('processPendingSync keeps an unrecognised operation type in the retry queue instead of dropping it', async function() {
        resetStorage();
        Storage.set(CONFIG.storageKeys.pendingSync, [
            { type: 'someFutureOperation', data: {}, timestamp: new Date().toISOString() }
        ]);

        const success = await SheetsAPI.processPendingSync();

        assertFalse(success, 'processPendingSync must report failure when an operation could not be processed');
        const remaining = Storage.getPendingSync();
        assertEqual(remaining.length, 1, 'the unrecognised operation must remain queued, not be silently discarded');
    });

    test('processPendingSync clears a successfully-processed operation', async function() {
        resetStorage();
        const originalFetch = globalThis.fetch;
        try {
            globalThis.fetch = async () => jsonResponse({ rowIndex: 2 });
            Storage.set(CONFIG.storageKeys.pendingSync, [
                { type: 'saveRound', data: { round_id: 'r1' }, timestamp: new Date().toISOString() }
            ]);

            const success = await SheetsAPI.processPendingSync();

            assertTrue(success, 'a successfully-processed operation must report overall success');
            assertEqual(Storage.getPendingSync().length, 0);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
})();
