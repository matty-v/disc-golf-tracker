/**
 * Disc Golf Tracker - Statistics Module Tests
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
    const assertDeepEqual = TR.assertDeepEqual.bind(TR);

    // Mock CONFIG for tests
    const mockCONFIG = {
        statistics: {
            minRoundsForAverage: 1,
            minDataPointsForDetailedStats: 3
        }
    };

    // Mock Utils for tests
    const mockUtils = {
        roundTo(num, decimals = 1) {
            const factor = Math.pow(10, decimals);
            return Math.round(num * factor) / factor;
        },
        average(numbers) {
            if (!numbers || numbers.length === 0) return null;
            const validNumbers = numbers.filter(n => n !== null && n !== undefined && !isNaN(n));
            if (validNumbers.length === 0) return null;
            const sum = validNumbers.reduce((a, b) => a + b, 0);
            return sum / validNumbers.length;
        },
        getRelativeScore(score, par) {
            const diff = score - par;
            if (diff === 0) return 'E';
            if (diff > 0) return `+${diff}`;
            return `${diff}`;
        }
    };

    // Store original globals and mock them for testing
    let originalCONFIG, originalUtils;

    function setupMocks() {
        if (typeof CONFIG !== 'undefined') {
            originalCONFIG = CONFIG;
        }
        if (typeof Utils !== 'undefined') {
            originalUtils = Utils;
        }
        // Set mocks globally
        if (typeof window !== 'undefined') {
            window.CONFIG = mockCONFIG;
            window.Utils = mockUtils;
        } else {
            global.CONFIG = mockCONFIG;
            global.Utils = mockUtils;
        }
    }

    function teardownMocks() {
        if (typeof window !== 'undefined') {
            if (originalCONFIG) window.CONFIG = originalCONFIG;
            if (originalUtils) window.Utils = originalUtils;
        } else {
            if (originalCONFIG) global.CONFIG = originalCONFIG;
            if (originalUtils) global.Utils = originalUtils;
        }
    }

    // =========================================
    // calculateHoleStats Tests
    // =========================================

    test('calculateHoleStats returns no data for empty scores array', function() {
        setupMocks();
        try {
            const result = Statistics.calculateHoleStats('hole-1', []);
            assertFalse(result.hasData, 'hasData should be false');
            assertEqual(result.roundCount, 0, 'roundCount should be 0');
            assertNull(result.avgScore, 'avgScore should be null');
            assertNull(result.avgApproaches, 'avgApproaches should be null');
            assertNull(result.avgPutts, 'avgPutts should be null');
        } finally {
            teardownMocks();
        }
    });

    test('calculateHoleStats returns no data for non-matching hole id', function() {
        setupMocks();
        try {
            const scores = [
                { hole_id: 'hole-2', throws: 3, approaches: 1, putts: 1 }
            ];
            const result = Statistics.calculateHoleStats('hole-1', scores);
            assertFalse(result.hasData, 'hasData should be false');
            assertEqual(result.roundCount, 0, 'roundCount should be 0');
        } finally {
            teardownMocks();
        }
    });

    test('calculateHoleStats calculates correct average score', function() {
        setupMocks();
        try {
            const scores = [
                { hole_id: 'hole-1', throws: 3, approaches: 1, putts: 1 },
                { hole_id: 'hole-1', throws: 4, approaches: 1, putts: 2 },
                { hole_id: 'hole-1', throws: 5, approaches: 2, putts: 2 }
            ];
            const result = Statistics.calculateHoleStats('hole-1', scores);
            assertTrue(result.hasData, 'hasData should be true');
            assertEqual(result.roundCount, 3, 'roundCount should be 3');
            assertEqual(result.avgScore, 4, 'avgScore should be 4');
        } finally {
            teardownMocks();
        }
    });

    test('calculateHoleStats handles null values in scores', function() {
        setupMocks();
        try {
            const scores = [
                { hole_id: 'hole-1', throws: 3, approaches: null, putts: null },
                { hole_id: 'hole-1', throws: 4, approaches: 1, putts: 2 },
                { hole_id: 'hole-1', throws: 5, approaches: 2, putts: 2 }
            ];
            const result = Statistics.calculateHoleStats('hole-1', scores);
            assertTrue(result.hasData, 'hasData should be true');
            assertEqual(result.roundCount, 3, 'roundCount should be 3');
            assertEqual(result.avgScore, 4, 'avgScore should be 4');
            // Only 2 approach values (need 3 for detailed stats)
            assertFalse(result.hasEnoughApproachData, 'hasEnoughApproachData should be false');
        } finally {
            teardownMocks();
        }
    });

    test('calculateHoleStats requires minimum data points for detailed stats', function() {
        setupMocks();
        try {
            const scores = [
                { hole_id: 'hole-1', throws: 3, approaches: 1, putts: 1 },
                { hole_id: 'hole-1', throws: 4, approaches: 2, putts: 2 }
            ];
            const result = Statistics.calculateHoleStats('hole-1', scores);
            // Only 2 data points, need 3 for detailed stats
            assertFalse(result.hasEnoughApproachData, 'Should not have enough approach data');
            assertFalse(result.hasEnoughPuttData, 'Should not have enough putt data');
        } finally {
            teardownMocks();
        }
    });

    test('calculateHoleStats shows detailed stats when enough data', function() {
        setupMocks();
        try {
            const scores = [
                { hole_id: 'hole-1', throws: 3, approaches: 1, putts: 1 },
                { hole_id: 'hole-1', throws: 4, approaches: 2, putts: 2 },
                { hole_id: 'hole-1', throws: 5, approaches: 3, putts: 1 }
            ];
            const result = Statistics.calculateHoleStats('hole-1', scores);
            assertTrue(result.hasEnoughApproachData, 'Should have enough approach data');
            assertTrue(result.hasEnoughPuttData, 'Should have enough putt data');
            assertEqual(result.avgApproaches, 2, 'avgApproaches should be 2');
            assertEqual(result.avgPutts, 1.3, 'avgPutts should be 1.3');
        } finally {
            teardownMocks();
        }
    });

    // =========================================
    // calculateCourseHoleStats Tests
    // =========================================

    test('calculateCourseHoleStats returns stats for all holes', function() {
        setupMocks();
        try {
            const holes = [
                { hole_id: 'hole-1' },
                { hole_id: 'hole-2' }
            ];
            const scores = [
                { hole_id: 'hole-1', throws: 3 },
                { hole_id: 'hole-2', throws: 4 }
            ];
            const result = Statistics.calculateCourseHoleStats(holes, scores);
            assertNotNull(result['hole-1'], 'Should have stats for hole-1');
            assertNotNull(result['hole-2'], 'Should have stats for hole-2');
        } finally {
            teardownMocks();
        }
    });

    // =========================================
    // calculateCourseStats Tests
    // =========================================

    test('calculateCourseStats returns no data for no completed rounds', function() {
        setupMocks();
        try {
            const rounds = [{ completed: false }];
            const result = Statistics.calculateCourseStats('course-1', rounds, [], []);
            assertFalse(result.hasData, 'hasData should be false');
            assertEqual(result.roundCount, 0, 'roundCount should be 0');
        } finally {
            teardownMocks();
        }
    });

    test('calculateCourseStats calculates correct averages', function() {
        setupMocks();
        try {
            const holes = [
                { hole_id: 'h1', par: 3 },
                { hole_id: 'h2', par: 3 }
            ];
            const rounds = [
                { round_id: 'r1', completed: true },
                { round_id: 'r2', completed: true }
            ];
            const scores = [
                { round_id: 'r1', hole_id: 'h1', throws: 3 },
                { round_id: 'r1', hole_id: 'h2', throws: 4 },
                { round_id: 'r2', hole_id: 'h1', throws: 4 },
                { round_id: 'r2', hole_id: 'h2', throws: 3 }
            ];
            const result = Statistics.calculateCourseStats('course-1', rounds, scores, holes);
            assertTrue(result.hasData, 'hasData should be true');
            assertEqual(result.roundCount, 2, 'roundCount should be 2');
            assertEqual(result.totalPar, 6, 'totalPar should be 6');
            assertEqual(result.avgTotalScore, 7, 'avgTotalScore should be 7');
        } finally {
            teardownMocks();
        }
    });

    // =========================================
    // compareToAverage Tests
    // =========================================

    test('compareToAverage returns no comparison for first round', function() {
        setupMocks();
        try {
            const courseStats = { hasData: false };
            const result = Statistics.compareToAverage(50, courseStats);
            assertFalse(result.hasComparison, 'hasComparison should be false');
            assertEqual(result.message, 'First round on this course');
        } finally {
            teardownMocks();
        }
    });

    test('compareToAverage identifies better score', function() {
        setupMocks();
        try {
            const courseStats = { hasData: true, avgTotalScore: 60 };
            const result = Statistics.compareToAverage(55, courseStats);
            assertTrue(result.hasComparison, 'hasComparison should be true');
            assertTrue(result.isBetter, 'isBetter should be true');
            assertEqual(result.difference, -5, 'difference should be -5');
        } finally {
            teardownMocks();
        }
    });

    test('compareToAverage identifies worse score', function() {
        setupMocks();
        try {
            const courseStats = { hasData: true, avgTotalScore: 60 };
            const result = Statistics.compareToAverage(65, courseStats);
            assertTrue(result.hasComparison, 'hasComparison should be true');
            assertFalse(result.isBetter, 'isBetter should be false');
            assertEqual(result.difference, 5, 'difference should be 5');
        } finally {
            teardownMocks();
        }
    });

    // =========================================
    // calculateRunningTotal Tests
    // =========================================

    test('calculateRunningTotal calculates correct totals', function() {
        setupMocks();
        try {
            const holes = [
                { hole_id: 'h1', par: 3 },
                { hole_id: 'h2', par: 4 }
            ];
            const scores = [
                { hole_id: 'h1', throws: 3, approaches: 1, putts: 1 },
                { hole_id: 'h2', throws: 5, approaches: 2, putts: 2 }
            ];
            const result = Statistics.calculateRunningTotal(scores, holes);
            assertEqual(result.totalScore, 8, 'totalScore should be 8');
            assertEqual(result.totalPar, 7, 'totalPar should be 7');
            assertEqual(result.relativeToPar, 1, 'relativeToPar should be 1');
            assertEqual(result.holesCompleted, 2, 'holesCompleted should be 2');
            assertEqual(result.totalApproaches, 3, 'totalApproaches should be 3');
            assertEqual(result.totalPutts, 3, 'totalPutts should be 3');
        } finally {
            teardownMocks();
        }
    });

    test('calculateRunningTotal handles missing approach/putt data', function() {
        setupMocks();
        try {
            const holes = [{ hole_id: 'h1', par: 3 }];
            const scores = [{ hole_id: 'h1', throws: 4, approaches: null, putts: null }];
            const result = Statistics.calculateRunningTotal(scores, holes);
            assertEqual(result.totalScore, 4, 'totalScore should be 4');
            assertEqual(result.totalApproaches, 0, 'totalApproaches should be 0');
            assertEqual(result.totalPutts, 0, 'totalPutts should be 0');
            assertNull(result.avgApproaches, 'avgApproaches should be null');
            assertNull(result.avgPutts, 'avgPutts should be null');
        } finally {
            teardownMocks();
        }
    });

    // =========================================
    // isPersonalBest Tests
    // =========================================

    test('isPersonalBest returns false for first round', function() {
        setupMocks();
        try {
            const courseStats = { hasData: false };
            const result = Statistics.isPersonalBest(50, courseStats);
            assertFalse(result, 'Should not be personal best for first round');
        } finally {
            teardownMocks();
        }
    });

    test('isPersonalBest returns true for new best score', function() {
        setupMocks();
        try {
            const courseStats = { hasData: true, bestRound: { totalScore: 55 } };
            const result = Statistics.isPersonalBest(50, courseStats);
            assertTrue(result, 'Should be personal best');
        } finally {
            teardownMocks();
        }
    });

    test('isPersonalBest returns false when not beating best', function() {
        setupMocks();
        try {
            const courseStats = { hasData: true, bestRound: { totalScore: 50 } };
            const result = Statistics.isPersonalBest(55, courseStats);
            assertFalse(result, 'Should not be personal best');
        } finally {
            teardownMocks();
        }
    });

})();
