/**
 * Disc Golf Tracker - Statistics Module
 *
 * Calculates and provides statistics for holes and courses
 * based on historical round data.
 */

const Statistics = {
    /**
     * Calculate statistics for a specific hole
     * @param {string} holeId - The hole ID
     * @param {Array} scores - Array of all scores for the course
     * @returns {Object} Hole statistics
     */
    calculateHoleStats(holeId, scores) {
        const holeScores = scores.filter(s => s.hole_id === holeId);

        if (holeScores.length === 0) {
            return {
                hasData: false,
                roundCount: 0,
                avgScore: null,
                avgApproaches: null,
                avgPutts: null
            };
        }

        // Calculate averages
        const throwsValues = holeScores.map(s => s.throws).filter(v => v !== null && !isNaN(v));
        const approachesValues = holeScores.map(s => s.approaches).filter(v => v !== null && !isNaN(v));
        const puttsValues = holeScores.map(s => s.putts).filter(v => v !== null && !isNaN(v));

        const minRounds = CONFIG.statistics.minDataPointsForDetailedStats;

        return {
            hasData: throwsValues.length >= CONFIG.statistics.minRoundsForAverage,
            roundCount: throwsValues.length,
            avgScore: throwsValues.length > 0 ? Utils.roundTo(Utils.average(throwsValues), 1) : null,
            avgApproaches: approachesValues.length >= minRounds
                ? Utils.roundTo(Utils.average(approachesValues), 1)
                : null,
            avgPutts: puttsValues.length >= minRounds
                ? Utils.roundTo(Utils.average(puttsValues), 1)
                : null,
            hasEnoughApproachData: approachesValues.length >= minRounds,
            hasEnoughPuttData: puttsValues.length >= minRounds
        };
    },

    /**
     * Calculate statistics for all holes in a course
     * @param {Array} holes - Array of holes for the course
     * @param {Array} scores - Array of all scores for the course
     * @returns {Object} Object mapping hole_id to stats
     */
    calculateCourseHoleStats(holes, scores) {
        const stats = {};
        holes.forEach(hole => {
            stats[hole.hole_id] = this.calculateHoleStats(hole.hole_id, scores);
        });
        return stats;
    },

    /**
     * Calculate overall course statistics
     * @param {string} courseId - The course ID
     * @param {Array} rounds - Array of completed rounds
     * @param {Array} scores - Array of scores
     * @param {Array} holes - Array of holes
     * @returns {Object} Course statistics
     */
    calculateCourseStats(courseId, rounds, scores, holes) {
        const completedRounds = rounds.filter(r => r.completed);

        if (completedRounds.length === 0) {
            return {
                hasData: false,
                roundCount: 0,
                avgTotalScore: null,
                avgRelativeToPar: null,
                bestRound: null,
                worstRound: null
            };
        }

        // Calculate total par for the course
        const totalPar = holes.reduce((sum, hole) => sum + (hole.par || 3), 0);

        // Get scores for each round
        const roundStats = completedRounds.map(round => {
            const roundScores = scores.filter(s => s.round_id === round.round_id);
            const totalScore = roundScores.reduce((sum, s) => sum + (s.throws || 0), 0);
            return {
                round_id: round.round_id,
                date: round.round_date,
                totalScore,
                relativeToPar: totalScore - totalPar
            };
        });

        // Sort by total score
        roundStats.sort((a, b) => a.totalScore - b.totalScore);

        const avgTotalScore = Utils.average(roundStats.map(r => r.totalScore));
        const avgRelativeToPar = Utils.average(roundStats.map(r => r.relativeToPar));

        return {
            hasData: true,
            roundCount: completedRounds.length,
            avgTotalScore: Utils.roundTo(avgTotalScore, 1),
            avgRelativeToPar: Utils.roundTo(avgRelativeToPar, 1),
            bestRound: roundStats[0],
            worstRound: roundStats[roundStats.length - 1],
            totalPar
        };
    },

    /**
     * Compare current round to historical average
     * @param {number} currentTotal - Current round total score
     * @param {Object} courseStats - Course statistics
     * @returns {Object} Comparison result
     */
    compareToAverage(currentTotal, courseStats) {
        if (!courseStats.hasData || !courseStats.avgTotalScore) {
            return {
                hasComparison: false,
                difference: null,
                isBetter: null,
                message: 'First round on this course'
            };
        }

        const difference = currentTotal - courseStats.avgTotalScore;
        const isBetter = difference < 0;

        let message;
        if (Math.abs(difference) < 0.5) {
            message = 'Right on your average';
        } else if (isBetter) {
            message = `${Math.abs(Utils.roundTo(difference, 1))} strokes better than average`;
        } else {
            message = `${Utils.roundTo(difference, 1)} strokes above average`;
        }

        return {
            hasComparison: true,
            difference: Utils.roundTo(difference, 1),
            isBetter,
            message
        };
    },

    /**
     * Check if current round is a personal best
     * @param {number} currentTotal - Current round total score
     * @param {Object} courseStats - Course statistics
     * @returns {boolean} Whether this is a personal best
     */
    isPersonalBest(currentTotal, courseStats) {
        if (!courseStats.hasData || !courseStats.bestRound) {
            return false;
        }
        return currentTotal < courseStats.bestRound.totalScore;
    },

    /**
     * Get best and worst holes from a round compared to averages
     * @param {Array} roundScores - Scores from the current round
     * @param {Array} holes - Holes for the course
     * @param {Object} holeStats - Statistics for each hole
     * @returns {Object} Best and worst holes
     */
    getHighlightHoles(roundScores, holes, holeStats) {
        const holesWithDiff = roundScores.map(score => {
            const hole = holes.find(h => h.hole_id === score.hole_id);
            const stats = holeStats[score.hole_id];

            if (!stats || !stats.hasData || !stats.avgScore) {
                return {
                    holeNumber: score.hole_number,
                    score: score.throws,
                    par: hole ? hole.par : 3,
                    diff: null,
                    relativeToPar: score.throws - (hole ? hole.par : 3)
                };
            }

            return {
                holeNumber: score.hole_number,
                score: score.throws,
                par: hole ? hole.par : 3,
                avgScore: stats.avgScore,
                diff: score.throws - stats.avgScore,
                relativeToPar: score.throws - (hole ? hole.par : 3)
            };
        });

        // Filter holes with valid comparison data
        const withData = holesWithDiff.filter(h => h.diff !== null);

        if (withData.length === 0) {
            // Fall back to relative to par
            const sortedByPar = [...holesWithDiff].sort((a, b) => a.relativeToPar - b.relativeToPar);
            return {
                best: sortedByPar.slice(0, 3).filter(h => h.relativeToPar <= 0),
                worst: sortedByPar.slice(-3).reverse().filter(h => h.relativeToPar > 0)
            };
        }

        // Sort by difference from average
        const sorted = [...withData].sort((a, b) => a.diff - b.diff);

        return {
            best: sorted.slice(0, 3).filter(h => h.diff < 0),
            worst: sorted.slice(-3).reverse().filter(h => h.diff > 0)
        };
    },

    /**
     * Format hole highlight for display
     * @param {Object} highlight - Hole highlight data
     * @returns {string} Formatted string
     */
    formatHoleHighlight(highlight) {
        const relativeScore = Utils.getRelativeScore(highlight.score, highlight.par);

        if (highlight.diff !== null) {
            const diffStr = highlight.diff < 0
                ? `${highlight.diff.toFixed(1)} vs avg`
                : `+${highlight.diff.toFixed(1)} vs avg`;
            return `Hole ${highlight.holeNumber}: ${highlight.score} (${relativeScore}) - ${diffStr}`;
        }

        return `Hole ${highlight.holeNumber}: ${highlight.score} (${relativeScore})`;
    },

    /**
     * Calculate running total for a round
     * @param {Array} scores - Scores in the round
     * @param {Array} holes - Holes for the course
     * @returns {Object} Running totals
     */
    calculateRunningTotal(scores, holes) {
        let totalScore = 0;
        let totalPar = 0;
        let totalApproaches = 0;
        let totalPutts = 0;
        let approachCount = 0;
        let puttCount = 0;

        scores.forEach(score => {
            const hole = holes.find(h => h.hole_id === score.hole_id);
            totalScore += score.throws || 0;
            totalPar += hole ? hole.par : 3;

            if (score.approaches !== null && score.approaches !== undefined) {
                totalApproaches += score.approaches;
                approachCount++;
            }

            if (score.putts !== null && score.putts !== undefined) {
                totalPutts += score.putts;
                puttCount++;
            }
        });

        return {
            totalScore,
            totalPar,
            relativeToPar: totalScore - totalPar,
            totalApproaches,
            totalPutts,
            avgApproaches: approachCount > 0 ? Utils.roundTo(totalApproaches / approachCount, 1) : null,
            avgPutts: puttCount > 0 ? Utils.roundTo(totalPutts / puttCount, 1) : null,
            holesCompleted: scores.length
        };
    },

    /**
     * Get trend data for a hole over time
     * @param {string} holeId - The hole ID
     * @param {Array} scores - All scores for this hole
     * @param {Array} rounds - All rounds
     * @returns {Array} Array of {date, score} objects
     */
    getHoleTrend(holeId, scores, rounds) {
        const holeScores = scores.filter(s => s.hole_id === holeId);

        return holeScores.map(score => {
            const round = rounds.find(r => r.round_id === score.round_id);
            return {
                date: round ? round.round_date : null,
                score: score.throws
            };
        }).filter(item => item.date !== null)
          .sort((a, b) => new Date(a.date) - new Date(b.date));
    }
};

// Make Statistics globally available
window.Statistics = Statistics;
