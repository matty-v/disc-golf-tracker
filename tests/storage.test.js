/**
 * Disc Golf Tracker - Storage Module Tests
 *
 * Exercises the real Storage module's localStorage fallback path (this.db
 * stays null — no fake IndexedDB is needed to reach it, see
 * js/storage.js:put/putMany).
 */

(function() {
    const TR = (typeof TestRunner !== 'undefined') ? TestRunner : window.TestRunner;
    const test = TR.test.bind(TR);
    const assertEqual = TR.assertEqual.bind(TR);
    const assertTrue = TR.assertTrue.bind(TR);
    const assertFalse = TR.assertFalse.bind(TR);

    function resetStorage() {
        Storage.db = null;
        localStorage.clear();
    }

    // =========================================
    // putMany merges rather than replaces (finding 9)
    // =========================================

    test('putMany merges into the localStorage fallback instead of replacing existing records', async function() {
        resetStorage();
        await Storage.putMany('courses', [
            { course_id: 'c1', course_name: 'Course One' },
            { course_id: 'c2', course_name: 'Course Two' }
        ]);

        // A sync that only returns c1 (e.g. c2 is local-only, not yet synced)
        // must not discard c2.
        await Storage.putMany('courses', [
            { course_id: 'c1', course_name: 'Course One (updated)' }
        ]);

        const courses = await Storage.getAll('courses');
        assertEqual(courses.length, 2, 'putMany must not discard existing local-only records');
        const c1 = courses.find(c => c.course_id === 'c1');
        const c2 = courses.find(c => c.course_id === 'c2');
        assertEqual(c1.course_name, 'Course One (updated)', 'putMany must still update records it does include');
        assertTrue(!!c2, 'the local-only record must survive the partial sync');
    });

    // =========================================
    // A localStorage write failure is surfaced, not silently swallowed (finding 10)
    // =========================================

    test('set() returns false when the underlying localStorage write throws', function() {
        const originalSetItem = localStorage.setItem;
        try {
            localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
            const ok = Storage.set('some-key', { a: 1 });
            assertFalse(ok, 'set() must report failure instead of silently succeeding');
        } finally {
            localStorage.setItem = originalSetItem;
        }
    });

    test('addPendingSync propagates a storage failure instead of always reporting success', async function() {
        resetStorage();
        const originalSetItem = localStorage.setItem;
        try {
            localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
            const ok = await Storage.addPendingSync({ type: 'saveRound', data: {} });
            assertFalse(ok, 'a queued offline write that cannot be persisted must be surfaced as a failure');
        } finally {
            localStorage.setItem = originalSetItem;
        }
    });

    test('addPendingSync returns true on a normal successful queue write', async function() {
        resetStorage();
        const ok = await Storage.addPendingSync({ type: 'saveRound', data: {} });
        assertTrue(ok, 'a normal queue write must report success');
        assertEqual(Storage.getPendingSync().length, 1);
    });

    // =========================================
    // Consolidated statistics loader reads via the round_id index (finding 24)
    // =========================================

    test('loadCourseRoundsAndScores returns only the requested course\'s completed-round scores', async function() {
        resetStorage();
        await Storage.putMany('rounds', [
            { round_id: 'r1', course_id: 'c1', completed: true, total_score: 70, total_par: 54 },
            { round_id: 'r2', course_id: 'c1', completed: false },
            { round_id: 'r3', course_id: 'c2', completed: true, total_score: 65, total_par: 54 }
        ]);
        await Storage.putMany('scores', [
            { score_id: 's1', round_id: 'r1', hole_id: 'h1', hole_number: 1, throws: 4, approaches: null, putts: null },
            { score_id: 's2', round_id: 'r2', hole_id: 'h1', hole_number: 1, throws: 3, approaches: null, putts: null },
            { score_id: 's3', round_id: 'r3', hole_id: 'h1', hole_number: 1, throws: 3, approaches: null, putts: null }
        ]);

        const { rounds, scores } = await App.loadCourseRoundsAndScores('c1');

        assertEqual(rounds.length, 2, 'must return all of the course\'s rounds (calculateCourseStats does its own completed filter)');
        assertEqual(scores.length, 1, 'must only return scores for c1\'s COMPLETED round (r1), not r2 (incomplete) or r3 (different course)');
        assertEqual(scores[0].round_id, 'r1');
    });
})();
