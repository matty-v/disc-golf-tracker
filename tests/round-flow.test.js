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

    test('handleFinishRound queues pending-sync when updateCourseLastPlayed returns false (detected read-back mismatch) instead of dropping it', async function() {
        setupDOM();
        resetStorage();
        const originalIsOnline = App.state.isOnline;
        const originalIsConfigured = SheetsAPI.isConfigured;
        const originalSaveRound = SheetsAPI.saveRound;
        const originalSaveScores = SheetsAPI.saveScores;
        const originalUpdateCourseLastPlayed = SheetsAPI.updateCourseLastPlayed;
        try {
            App.state.isOnline = true;
            SheetsAPI.isConfigured = () => true;
            SheetsAPI.saveRound = async () => {};
            SheetsAPI.saveScores = async () => {};
            // updateRowById returns false (not a throw) on a read-back mismatch —
            // this must not be silently dropped (finding 2 / Chewie's held item 2).
            SheetsAPI.updateCourseLastPlayed = async () => false;

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
            assertTrue(types.includes('updateCourseLastPlayed'), 'a detected-but-unconfirmed write (false return, not a throw) must still be queued for retry');
        } finally {
            App.state.isOnline = originalIsOnline;
            SheetsAPI.isConfigured = originalIsConfigured;
            SheetsAPI.saveRound = originalSaveRound;
            SheetsAPI.saveScores = originalSaveScores;
            SheetsAPI.updateCourseLastPlayed = originalUpdateCourseLastPlayed;
            teardownDOM();
        }
    });

    test('persistHoleEdit queues pending-sync when updateHole returns false instead of dropping it', async function() {
        setupDOM();
        resetStorage();
        const originalIsOnline = App.state.isOnline;
        const originalIsConfigured = SheetsAPI.isConfigured;
        const originalUpdateHole = SheetsAPI.updateHole;
        try {
            App.state.isOnline = true;
            SheetsAPI.isConfigured = () => true;
            SheetsAPI.updateHole = async () => false;

            const hole = { hole_id: 'hole-1', course_id: 'course-1', hole_number: 1, par: 4, distance: 300, description: '' };
            await App.persistHoleEdit(hole);

            const pending = Storage.getPendingSync();
            const types = pending.map(p => p.type);
            assertTrue(types.includes('updateHole'), 'a detected-but-unconfirmed hole edit (false return, not a throw) must still be queued for retry');
        } finally {
            App.state.isOnline = originalIsOnline;
            SheetsAPI.isConfigured = originalIsConfigured;
            SheetsAPI.updateHole = originalUpdateHole;
            teardownDOM();
        }
    });

    // =========================================
    // A failed pending-sync write must not be treated as durably queued
    // (finding 10 / Chewie's held item 3 on PR #13)
    // =========================================

    test('handleFinishRound does NOT clear the current round when a pending-sync write fails to persist', async function() {
        setupDOM();
        resetStorage();
        const originalIsOnline = App.state.isOnline;
        try {
            // Genuinely offline, so every operation takes the addPendingSync path.
            App.state.isOnline = false;

            App.state.currentRound = makeRound(1);
            App.state.currentRound.scores = [
                { score_id: 's1', round_id: 'round-1', hole_id: 'hole-1', hole_number: 1, throws: 3, approaches: null, putts: null, created_at: new Date().toISOString() }
            ];
            // finishRound() first, exactly like the real flow — it's what
            // actually writes the round into Storage's current-round key
            // (via saveCurrentRoundState()), which is the thing that must
            // survive handleFinishRound() below.
            await App.finishRound();

            const originalSetItem = localStorage.setItem;
            const originalPendingSyncKey = CONFIG.storageKeys.pendingSync;
            localStorage.setItem = (key, value) => {
                if (key === originalPendingSyncKey) {
                    throw new Error('QuotaExceededError');
                }
                return originalSetItem.call(localStorage, key, value);
            };

            try {
                await App.handleFinishRound();
            } finally {
                localStorage.setItem = originalSetItem;
            }

            assertNotNull(App.state.currentRound, 'handleFinishRound must not clear currentRound when the pending-sync queue write itself failed — the round was never actually durably queued, contrary to the code\'s previous unchecked claim');
            assertNotNull(Storage.getCurrentRound(), 'the round must remain recoverable in storage too, so checkIncompleteRound() can offer it again');
        } finally {
            App.state.isOnline = originalIsOnline;
            teardownDOM();
        }
    });

    // =========================================
    // readScoreInputs — single normalizer shared by persistence and the
    // live preview (matty-v/disc-golf-tracker#3, guarding against a repeat
    // of #4 finding 4's stored-vs-live divergence)
    // =========================================

    test('readScoreInputs maps blank approaches/putts to null, blank throws to 0', function() {
        setupDOM();
        try {
            el('score-throws').value = '';
            el('score-approaches').value = '';
            el('score-putts').value = '';

            const result = App.readScoreInputs();

            assertEqual(result.throws, 0, 'blank throws normalizes to 0, matching the existing required-field convention');
            assertNull(result.approaches, 'blank approaches must normalize to null');
            assertNull(result.putts, 'blank putts must normalize to null');
        } finally {
            teardownDOM();
        }
    });

    test('readScoreInputs parses real entered values', function() {
        setupDOM();
        try {
            el('score-throws').value = '4';
            el('score-approaches').value = '2';
            el('score-putts').value = '1';

            const result = App.readScoreInputs();

            assertEqual(result.throws, 4);
            assertEqual(result.approaches, 2);
            assertEqual(result.putts, 1);
        } finally {
            teardownDOM();
        }
    });

    test('readScoreInputs preserves an explicit 0 for approaches/putts (not the same as blank)', function() {
        setupDOM();
        try {
            el('score-throws').value = '3';
            el('score-approaches').value = '0';
            el('score-putts').value = '0';

            const result = App.readScoreInputs();

            assertEqual(result.approaches, 0, 'an explicit 0 must stay 0, not become null');
            assertEqual(result.putts, 0);
        } finally {
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

    // =========================================
    // last_played updates locally on an existing course (finding 6)
    // =========================================

    test('handleFinishRound updates the local course last_played date for an existing course', async function() {
        setupDOM();
        resetStorage();
        const originalIsOnline = App.state.isOnline;
        try {
            App.state.isOnline = false; // isolate from SheetsAPI entirely

            await Storage.put('courses', { course_id: 'course-1', course_name: 'Test Course', hole_count: 1, last_played: null });

            App.state.currentRound = makeRound(1);
            App.state.currentRound.isNewCourse = false;
            App.state.currentRound.round_date = '2026-08-16T12:00:00.000Z';
            App.state.currentRound.scores = [
                { score_id: 's1', round_id: 'round-1', hole_id: 'hole-1', hole_number: 1, throws: 3, approaches: null, putts: null, created_at: new Date().toISOString() }
            ];
            App.state.currentRound.total_score = 3;
            App.state.currentRound.total_par = 3;
            App.state.currentRound.completed = true;

            await App.handleFinishRound();

            const courses = await Storage.getAll('courses');
            const course = courses.find(c => c.course_id === 'course-1');
            assertEqual(course.last_played, '2026-08-16T12:00:00.000Z', 'the local course record must reflect the new last-played date immediately, without a full resync');
        } finally {
            App.state.isOnline = originalIsOnline;
            teardownDOM();
        }
    });

    // =========================================
    // Resume button stays available after backing out (finding 7)
    // =========================================

    test('handleBack shows resume-round-btn after backing out of an in-progress round', function() {
        setupDOM();
        resetStorage();
        try {
            App.state.currentScreen = 'scoring';
            App.state.currentRound = makeRound(2);
            // The real button starts class="hidden" (index.html) — seed that
            // so the assertion actually exercises the toggle, not a fake
            // element's default (unset) classList.
            el('resume-round-btn').classList.add('hidden');

            const originalConfirm = globalThis.confirm;
            globalThis.confirm = () => true;
            try {
                App.handleBack();
            } finally {
                globalThis.confirm = originalConfirm;
            }

            assertFalse(el('resume-round-btn').classList.contains('hidden'), 'resume-round-btn must be visible immediately after backing out, not just after a reload');
        } finally {
            teardownDOM();
        }
    });

    // =========================================
    // A completed-but-unsaved round must never be silently overwritten
    // by starting a new course or selecting a course from home (finding 1,
    // Chewie's held item 1 on PR #13)
    // =========================================

    test('handleNewCourse shows the incomplete-round modal instead of overwriting a completed-but-unsaved round', function() {
        setupDOM();
        resetStorage();
        try {
            const finishedRound = makeRound(1);
            finishedRound.completed = true;
            Storage.saveCurrentRound(finishedRound);

            let modalShown = false;
            const originalShow = App.showIncompleteRoundModal;
            App.showIncompleteRoundModal = () => { modalShown = true; };
            try {
                App.handleNewCourse();
            } finally {
                App.showIncompleteRoundModal = originalShow;
            }

            assertTrue(modalShown, 'a completed-but-unsaved round must trigger the incomplete-round modal, not silently proceed to the new-course form');
            assertEqual(App.state.currentScreen, 'home', 'must not navigate to new-course while a finished-unsaved round is pending');
        } finally {
            teardownDOM();
        }
    });

    test('handleSelectCourseFromHome shows the incomplete-round modal instead of overwriting a completed-but-unsaved round', function() {
        setupDOM();
        resetStorage();
        try {
            const finishedRound = makeRound(1);
            finishedRound.completed = true;
            finishedRound.round_id = 'the-finished-round';
            Storage.saveCurrentRound(finishedRound);
            App.state.currentRound = finishedRound;

            let modalShown = false;
            const originalShow = App.showIncompleteRoundModal;
            App.showIncompleteRoundModal = () => { modalShown = true; };
            try {
                App.handleSelectCourseFromHome({ course_id: 'other-course', course_name: 'Other Course', hole_count: 9 });
            } finally {
                App.showIncompleteRoundModal = originalShow;
            }

            assertTrue(modalShown, 'a completed-but-unsaved round must trigger the incomplete-round modal, not selectCourse()');
            assertEqual(App.state.currentRound.round_id, 'the-finished-round', 'the finished round must not be overwritten by selecting a different course');
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

    // =========================================
    // Round-score bar (matty-v/disc-golf-tracker#3)
    // =========================================

    test('renderRoundScoreBar shows the running total from only the counted holes', function() {
        setupDOM();
        try {
            App.state.currentRound = makeRound(3);
            App.state.currentRound.scores = [
                // par 3 holes (makeHoles default). Counted: 4 throws, 2+1=3=4-1.
                { score_id: 's1', round_id: 'round-1', hole_id: 'hole-1', hole_number: 1, throws: 4, approaches: 2, putts: 1 },
                // Not counted: under-logged (1+0=1, needs 2).
                { score_id: 's2', round_id: 'round-1', hole_id: 'hole-2', hole_number: 2, throws: 3, approaches: 1, putts: 0 },
                // Counted: ace.
                { score_id: 's3', round_id: 'round-1', hole_id: 'hole-3', hole_number: 3, throws: 1, approaches: 0, putts: 0 }
            ];

            App.renderRoundScoreBar();

            // Counted holes: hole 1 (throws 4, par 3) + hole 3 (throws 1, par 3)
            // => totalScore 5, totalPar 6, relativeToPar -1.
            assertEqual(el('round-score-relative').textContent, '-1', 'the bar must total only the counted holes');
            assertEqual(el('round-score-progress').textContent, '2 of 3 holes counted');
        } finally {
            teardownDOM();
        }
    });

    test('renderRoundScoreBar does not move when the live inputs change without a save (AC #4)', function() {
        setupDOM();
        try {
            App.state.currentRound = makeRound(2);
            App.state.currentRound.scores = [
                { score_id: 's1', round_id: 'round-1', hole_id: 'hole-1', hole_number: 1, throws: 4, approaches: 2, putts: 1 }
            ];
            App.renderRoundScoreBar();
            const before = el('round-score-relative').textContent;

            // Simulate tapping the stepper repeatedly — mutates the DOM
            // input only, never round.scores.
            el('score-throws').value = '20';
            el('score-approaches').value = '19';
            el('score-putts').value = '19';
            App.renderRoundScoreBar();

            assertEqual(el('round-score-relative').textContent, before, 'the bar is a pure function of round.scores — live input changes must never move it');
        } finally {
            teardownDOM();
        }
    });

    test('renderScoringScreen calls renderRoundScoreBar so the bar updates after every navigation/save', function() {
        setupDOM();
        try {
            App.state.currentRound = makeRound(1);
            App.state.currentRound.scores = [
                { score_id: 's1', round_id: 'round-1', hole_id: 'hole-1', hole_number: 1, throws: 4, approaches: 2, putts: 1 }
            ];
            App.state.currentHoleIndex = 0;
            App.state.holeStats = {};

            App.renderScoringScreen();

            assertEqual(el('round-score-relative').textContent, '+1', 'renderScoringScreen must keep the bar in sync (throws 4, par 3)');
        } finally {
            teardownDOM();
        }
    });

    // =========================================
    // Commit-state live line (matty-v/disc-golf-tracker#3)
    // =========================================

    test('updateCommitState shows the committed breakdown when the hole is counted', function() {
        setupDOM();
        try {
            el('score-throws').value = '4';
            el('score-approaches').value = '2';
            el('score-putts').value = '1';

            App.updateCommitState();

            assertEqual(el('commit-state').textContent, '2 approaches + 1 putt + 1 drive = 4');
        } finally {
            teardownDOM();
        }
    });

    test('updateCommitState shows the shortfall when the hole is not yet counted', function() {
        setupDOM();
        try {
            el('score-throws').value = '4';
            el('score-approaches').value = '';
            el('score-putts').value = '';

            App.updateCommitState();

            assertEqual(el('commit-state').textContent, 'log 3 more shots to match a 4');
        } finally {
            teardownDOM();
        }
    });

    test('updateCommitState handles the ace case (throws:1, 0 approaches, 0 putts) as committed', function() {
        setupDOM();
        try {
            el('score-throws').value = '1';
            el('score-approaches').value = '0';
            el('score-putts').value = '0';

            App.updateCommitState();

            assertEqual(el('commit-state').textContent, '1 drive = 1');
        } finally {
            teardownDOM();
        }
    });

    test('updateCommitState singularizes "1 more shot"', function() {
        setupDOM();
        try {
            el('score-throws').value = '4';
            el('score-approaches').value = '1';
            el('score-putts').value = '1';

            App.updateCommitState();

            assertEqual(el('commit-state').textContent, 'log 1 more shot to match a 4');
        } finally {
            teardownDOM();
        }
    });

    test('renderScoringScreen initializes the commit-state line for the loaded hole', function() {
        setupDOM();
        try {
            App.state.currentRound = makeRound(1);
            App.state.currentRound.scores = [
                { score_id: 's1', round_id: 'round-1', hole_id: 'hole-1', hole_number: 1, throws: 4, approaches: 2, putts: 1 }
            ];
            App.state.currentHoleIndex = 0;
            App.state.holeStats = {};

            App.renderScoringScreen();

            assertEqual(el('commit-state').textContent, '2 approaches + 1 putt + 1 drive = 4', 'renderScoringScreen must init the commit-state line for the hole being shown');
        } finally {
            teardownDOM();
        }
    });

    test('updateCommitState clears when throws is blank', function() {
        setupDOM();
        try {
            el('score-throws').value = '';
            el('score-approaches').value = '2';
            el('score-putts').value = '1';

            App.updateCommitState();

            assertEqual(el('commit-state').textContent, '');
        } finally {
            teardownDOM();
        }
    });
})();
