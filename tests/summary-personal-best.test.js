/**
 * Disc Golf Tracker - Round Summary Personal Best Tests (FAL-2)
 *
 * Exercises the real App.finishRound()/renderSummary() flow against a
 * minimal fake DOM to prove the personal-best indication renders from
 * App.state.courseStats as captured before the round started, alongside
 * (not instead of) the existing average comparison.
 */

(function() {
    const TR = (typeof TestRunner !== 'undefined') ? TestRunner : window.TestRunner;
    const test = TR.test.bind(TR);
    const assertEqual = TR.assertEqual.bind(TR);
    const assertTrue = TR.assertTrue.bind(TR);
    const assertFalse = TR.assertFalse.bind(TR);

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

    test('renderSummary shows a new-personal-best message when the round beats the pre-existing best', async function() {
        setupDOM();
        resetStorage();
        try {
            App.state.currentRound = makeRound(2);
            App.state.currentRound.scores = [
                { score_id: 's1', round_id: 'round-1', hole_id: 'hole-1', hole_number: 1, throws: 3, approaches: null, putts: null, created_at: new Date().toISOString() },
                { score_id: 's2', round_id: 'round-1', hole_id: 'hole-2', hole_number: 2, throws: 3, approaches: null, putts: null, created_at: new Date().toISOString() }
            ];
            // total = 6, strictly below the pre-existing best of 10
            App.state.courseStats = { hasData: true, avgTotalScore: 12, bestRound: { totalScore: 10 } };

            await App.finishRound();

            assertFalse(el('summary-personal-best').classList.contains('hidden'), 'the personal-best section must be shown');
            assertTrue(el('personal-best-result').textContent.length > 0, 'the personal-best message must be set');
            assertTrue(el('personal-best-result').className.includes('best'), 'the message must be styled as a new best, not a tie');
        } finally {
            teardownDOM();
        }
    });

    test('renderSummary shows a tied-your-best message when the round exactly matches the pre-existing best', async function() {
        setupDOM();
        resetStorage();
        try {
            App.state.currentRound = makeRound(2);
            App.state.currentRound.scores = [
                { score_id: 's1', round_id: 'round-1', hole_id: 'hole-1', hole_number: 1, throws: 5, approaches: null, putts: null, created_at: new Date().toISOString() },
                { score_id: 's2', round_id: 'round-1', hole_id: 'hole-2', hole_number: 2, throws: 5, approaches: null, putts: null, created_at: new Date().toISOString() }
            ];
            // total = 10, exactly the pre-existing best
            App.state.courseStats = { hasData: true, avgTotalScore: 12, bestRound: { totalScore: 10 } };

            await App.finishRound();

            assertFalse(el('summary-personal-best').classList.contains('hidden'), 'the personal-best section must be shown for a tie');
            assertTrue(el('personal-best-result').className.includes('tied'), 'a tie must not be styled as a new best');
            assertFalse(el('personal-best-result').className.includes('best'), 'a tie must not carry the new-best class');
        } finally {
            teardownDOM();
        }
    });

    test('renderSummary shows no personal-best message when the round is worse than the pre-existing best', async function() {
        setupDOM();
        resetStorage();
        try {
            App.state.currentRound = makeRound(2);
            App.state.currentRound.scores = [
                { score_id: 's1', round_id: 'round-1', hole_id: 'hole-1', hole_number: 1, throws: 6, approaches: null, putts: null, created_at: new Date().toISOString() },
                { score_id: 's2', round_id: 'round-1', hole_id: 'hole-2', hole_number: 2, throws: 6, approaches: null, putts: null, created_at: new Date().toISOString() }
            ];
            // total = 12, worse than the pre-existing best of 10
            App.state.courseStats = { hasData: true, avgTotalScore: 12, bestRound: { totalScore: 10 } };

            await App.finishRound();

            assertTrue(el('summary-personal-best').classList.contains('hidden'), 'the personal-best section must stay hidden when the round did not beat the best');
        } finally {
            teardownDOM();
        }
    });

    test('renderSummary shows no personal-best claim on the first-ever round for a course', async function() {
        setupDOM();
        resetStorage();
        try {
            App.state.currentRound = makeRound(1);
            App.state.currentRound.scores = [
                { score_id: 's1', round_id: 'round-1', hole_id: 'hole-1', hole_number: 1, throws: 4, approaches: null, putts: null, created_at: new Date().toISOString() }
            ];
            App.state.courseStats = { hasData: false };

            await App.finishRound();

            assertTrue(el('summary-personal-best').classList.contains('hidden'), 'no completed round yet on this course means no personal-best claim');
        } finally {
            teardownDOM();
        }
    });

    test('renderSummary evaluates the personal best against courseStats captured before this round, not a recalculated value', async function() {
        setupDOM();
        resetStorage();
        try {
            App.state.currentRound = makeRound(1);
            App.state.currentRound.scores = [
                // this round's own total (3) is lower than the pre-existing best (10) it will be
                // durably saved as the new best round in storage by finishRound(), but the summary
                // must compare against the value captured BEFORE the round, not a fresh recalculation
                // that would already include this round as its own prior best.
                { score_id: 's1', round_id: 'round-1', hole_id: 'hole-1', hole_number: 1, throws: 3, approaches: null, putts: null, created_at: new Date().toISOString() }
            ];
            App.state.courseStats = { hasData: true, avgTotalScore: 10, bestRound: { totalScore: 10, round_id: 'prior-round' } };

            await App.finishRound();

            // Confirms the pre-existing seam holds: courseStats was never recalculated between
            // Storage.put(roundData) and renderSummary(), so the just-finished round's total (3) is
            // correctly compared against the OLD best (10) rather than itself.
            assertEqual(App.state.courseStats.bestRound.round_id, 'prior-round', 'courseStats must remain the pre-round snapshot, not be recalculated');
            assertTrue(el('personal-best-result').className.includes('best'), 'the round must be recognized as a new best against the pre-round snapshot');
        } finally {
            teardownDOM();
        }
    });

    test('renderSummary keeps the existing average comparison rendering unchanged alongside the new personal-best indication', async function() {
        setupDOM();
        resetStorage();
        try {
            App.state.currentRound = makeRound(2);
            App.state.currentRound.scores = [
                { score_id: 's1', round_id: 'round-1', hole_id: 'hole-1', hole_number: 1, throws: 3, approaches: null, putts: null, created_at: new Date().toISOString() },
                { score_id: 's2', round_id: 'round-1', hole_id: 'hole-2', hole_number: 2, throws: 3, approaches: null, putts: null, created_at: new Date().toISOString() }
            ];
            App.state.courseStats = { hasData: true, avgTotalScore: 12, bestRound: { totalScore: 10 } };

            await App.finishRound();

            assertFalse(el('summary-comparison').classList.contains('hidden'), 'the average-comparison section must still render');
            assertEqual(el('comparison-result').textContent, '6 strokes better than average');
            assertFalse(el('summary-personal-best').classList.contains('hidden'), 'the personal-best section must render alongside it');
        } finally {
            teardownDOM();
        }
    });
})();
