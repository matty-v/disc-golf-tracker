/**
 * Disc Golf Tracker - Round Flow Tests
 *
 * Exercises the real App module (round finish durability, resume, and the
 * blank-field null convention) against a minimal fake DOM, instead of a
 * hand-maintained copy of the logic.
 */

(function() {
    const TR = (typeof TestRunner !== 'undefined') ? TestRunner : window.TestRunner;
    const test = TR.test.bind(TR);
    const assertEqual = TR.assertEqual.bind(TR);
    const assertTrue = TR.assertTrue.bind(TR);
    const assertFalse = TR.assertFalse.bind(TR);
    const assertNull = TR.assertNull.bind(TR);
    const assertNotNull = TR.assertNotNull.bind(TR);

    let originalGetElementById, originalQuerySelectorAll, originalCreateElement;
    let elementCache;

    function createFakeElement(id) {
        const classSet = new Set();
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
            addEventListener() {},
            removeEventListener() {},
            setAttribute() {},
            getAttribute() { return null; },
            querySelector() { return createFakeElement(id + '-child'); },
            querySelectorAll() { return []; },
            appendChild() {},
            focus() {},
            remove() {}
        };
    }

    function setupDOM() {
        elementCache = {};
        originalGetElementById = document.getElementById;
        originalQuerySelectorAll = document.querySelectorAll;
        originalCreateElement = document.createElement;

        document.getElementById = (id) => {
            if (!elementCache[id]) elementCache[id] = createFakeElement(id);
            return elementCache[id];
        };
        document.querySelectorAll = () => [];
        document.createElement = (tag) => createFakeElement('created-' + tag);
    }

    function teardownDOM() {
        document.getElementById = originalGetElementById;
        document.querySelectorAll = originalQuerySelectorAll;
        document.createElement = originalCreateElement;
        elementCache = {};
    }

    function el(id) {
        return document.getElementById(id);
    }

    function makeHoles(count) {
        const holes = [];
        for (let i = 1; i <= count; i++) {
            holes.push({ hole_id: `hole-${i}`, course_id: 'course-1', hole_number: i, par: 3, distance: null, description: '' });
        }
        return holes;
    }

    function makeRound(holeCount) {
        return {
            round_id: 'round-1',
            course_id: 'course-1',
            courseName: 'Test Course',
            round_date: new Date().toISOString(),
            completed: false,
            holes: makeHoles(holeCount),
            scores: [],
            isNewCourse: false,
            currentHoleIndex: 0,
            holeCount
        };
    }

    function resetStorage() {
        Storage.db = null;
        Storage.set(CONFIG.storageKeys.courses, []);
        Storage.set(CONFIG.storageKeys.holes, []);
        Storage.set(CONFIG.storageKeys.rounds, []);
        Storage.set(CONFIG.storageKeys.scores, []);
        Storage.set(CONFIG.storageKeys.currentRound, null);
        Storage.set(CONFIG.storageKeys.pendingSync, []);
    }

    // =========================================
    // Round-finish durability (finding 1)
    // =========================================

    test('finishRound persists the round and scores to durable storage before the summary is shown', async function() {
        setupDOM();
        resetStorage();
        try {
            App.state.currentRound = makeRound(2);
            App.state.currentRound.scores = [
                { score_id: 's1', round_id: 'round-1', hole_id: 'hole-1', hole_number: 1, throws: 3, approaches: null, putts: null, created_at: new Date().toISOString() },
                { score_id: 's2', round_id: 'round-1', hole_id: 'hole-2', hole_number: 2, throws: 4, approaches: null, putts: null, created_at: new Date().toISOString() }
            ];

            await App.finishRound();

            const rounds = await Storage.getAll('rounds');
            const savedRound = rounds.find(r => r.round_id === 'round-1');
            assertNotNull(savedRound, 'finishRound must write the round to durable storage, not just localStorage current-round');
            assertTrue(savedRound.completed, 'the durably-saved round must be marked completed');

            const scores = await Storage.getAll('scores');
            assertEqual(scores.filter(s => s.round_id === 'round-1').length, 2, 'finishRound must write the round scores to durable storage');
        } finally {
            teardownDOM();
        }
    });

    test('a completed-but-unsynced round survives a simulated reload and is offered for resume', async function() {
        setupDOM();
        resetStorage();
        try {
            App.state.currentRound = makeRound(1);
            App.state.currentRound.scores = [
                { score_id: 's1', round_id: 'round-1', hole_id: 'hole-1', hole_number: 1, throws: 3, approaches: null, putts: null, created_at: new Date().toISOString() }
            ];
            await App.finishRound();

            // Simulate an app reload: fresh state, re-run the incomplete-round check.
            App.state.currentRound = null;
            App.checkIncompleteRound();

            assertNotNull(App.state.currentRound, 'a completed-but-unsynced round must be restored on reload');
            assertEqual(App.state.currentRound.round_id, 'round-1');
            assertTrue(el('resume-round-btn').classList.contains('hidden') === false, 'resume-round-btn must be shown so the round is not lost');
        } finally {
            teardownDOM();
        }
    });

    // =========================================
    // Backend failure path queues for retry (finding 2)
    // =========================================

    test('handleFinishRound queues pending-sync when the online save fails partway through', async function() {
        setupDOM();
        resetStorage();
        const originalIsOnline = App.state.isOnline;
        const originalIsConfigured = SheetsAPI.isConfigured;
        const originalSaveRound = SheetsAPI.saveRound;
        const originalSaveScores = SheetsAPI.saveScores;
        try {
            App.state.isOnline = true;
            SheetsAPI.isConfigured = () => true;
            SheetsAPI.saveRound = async () => { throw new Error('network drop'); };
            SheetsAPI.saveScores = async () => { throw new Error('should not be reached'); };

            App.state.currentRound = makeRound(1);
            App.state.currentRound.scores = [
                { score_id: 's1', round_id: 'round-1', hole_id: 'hole-1', hole_number: 1, throws: 3, approaches: null, putts: null, created_at: new Date().toISOString() }
            ];
            App.state.currentRound.total_score = 3;
            App.state.currentRound.total_par = 3;
            App.state.currentRound.completed = true;

            await App.handleFinishRound();

            const pending = Storage.getPendingSync();
            const types = pending.map(p => p.type);
            assertTrue(types.includes('saveRound'), 'a failed online save must be queued for retry exactly like the offline path');
            assertTrue(types.includes('saveScores'), 'saveScores must also be queued for retry');
        } finally {
            App.state.isOnline = originalIsOnline;
            SheetsAPI.isConfigured = originalIsConfigured;
            SheetsAPI.saveRound = originalSaveRound;
            SheetsAPI.saveScores = originalSaveScores;
            teardownDOM();
        }
    });

    // =========================================
    // Blank optional fields store null, not 0 (finding 4)
    // =========================================

    test('saveCurrentHoleScore stores null (not 0) for a blank approaches/putts field', function() {
        setupDOM();
        try {
            App.state.currentRound = makeRound(1);
            App.state.currentHoleIndex = 0;

            el('score-throws').value = '4';
            el('score-approaches').value = '';
            el('score-putts').value = '';

            App.saveCurrentHoleScore();

            const score = App.state.currentRound.scores[0];
            assertNull(score.approaches, 'a blank approaches field must be stored as null, not 0');
            assertNull(score.putts, 'a blank putts field must be stored as null, not 0');
        } finally {
            teardownDOM();
        }
    });

    test('saveCurrentHoleScore still stores a real 0 when the user enters 0', function() {
        setupDOM();
        try {
            App.state.currentRound = makeRound(1);
            App.state.currentHoleIndex = 0;

            el('score-throws').value = '4';
            el('score-approaches').value = '0';
            el('score-putts').value = '0';

            App.saveCurrentHoleScore();

            const score = App.state.currentRound.scores[0];
            assertEqual(score.approaches, 0, 'an explicit 0 must still be stored as 0');
            assertEqual(score.putts, 0, 'an explicit 0 must still be stored as 0');
        } finally {
            teardownDOM();
        }
    });

    // =========================================
    // Backward navigation never saves a blank throws field as 0 (finding 8)
    // =========================================

    test('navigateHole(-1) does not save a score when throws has been cleared', function() {
        setupDOM();
        try {
            App.state.currentRound = makeRound(2);
            App.state.currentHoleIndex = 1;

            el('score-throws').value = '';

            App.navigateHole(-1);

            const saved = App.state.currentRound.scores.find(s => s.hole_number === 2);
            assertTrue(!saved, 'a cleared throws field must never be recorded as a 0-throw score');
            assertEqual(App.state.currentHoleIndex, 0, 'navigation itself must still proceed');
        } finally {
            teardownDOM();
        }
    });

    test('navigateHole(-1) still saves a real entered score', function() {
        setupDOM();
        try {
            App.state.currentRound = makeRound(2);
            App.state.currentHoleIndex = 1;

            el('score-throws').value = '5';

            App.navigateHole(-1);

            const saved = App.state.currentRound.scores.find(s => s.hole_number === 2);
            assertNotNull(saved, 'a real entered score must still be saved on backward navigation');
            assertEqual(saved.throws, 5);
        } finally {
            teardownDOM();
        }
    });
})();
