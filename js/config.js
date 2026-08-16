/**
 * Disc Golf Tracker - Configuration
 *
 * This file contains configuration settings for the application.
 */

const CONFIG = {
    // Sheets DB API Configuration
    // Backend API that handles Google Sheets operations via service account
    api: {
        baseUrl: 'https://us-central1-kinetic-object-322814.cloudfunctions.net/sheetsApi',
        serviceAccountEmail: 'sheets-db-api@kinetic-object-322814.iam.gserviceaccount.com'
    },

    // Sheet tab names
    sheets: {
        courses: 'Courses',
        holes: 'Holes',
        rounds: 'Rounds',
        scores: 'Scores'
    },

    // Sheet headers for each tab
    sheetHeaders: {
        courses: ['course_id', 'course_name', 'hole_count', 'created_date', 'last_played'],
        holes: ['hole_id', 'course_id', 'hole_number', 'par', 'distance', 'description'],
        rounds: ['round_id', 'course_id', 'round_date', 'completed', 'total_score', 'total_par'],
        scores: ['score_id', 'round_id', 'hole_id', 'hole_number', 'throws', 'approaches', 'putts', 'created_at']
    },

    // Validation rules
    validation: {
        courseName: {
            minLength: 1,
            maxLength: 100,
            pattern: /^[a-zA-Z0-9\s\-']+$/
        },
        holeCount: {
            min: 1,
            max: 27,
            default: 18
        },
        par: {
            min: 2,
            max: 6,
            default: 3
        },
        distance: {
            min: 0,
            max: 1500
        },
        throws: {
            min: 1,
            max: 20
        },
        approaches: {
            min: 0,
            max: 19
        },
        putts: {
            min: 0,
            max: 19
        }
    },

    // Statistics configuration
    statistics: {
        // Minimum rounds needed to show averages
        minRoundsForAverage: 1,
        // Minimum data points for detailed stats
        minDataPointsForDetailedStats: 3
    },

    // Local storage keys
    storageKeys: {
        spreadsheetId: 'dgtracker_spreadsheet_id',
        courses: 'dgtracker_courses',
        holes: 'dgtracker_holes',
        rounds: 'dgtracker_rounds',
        scores: 'dgtracker_scores',
        currentRound: 'dgtracker_current_round',
        pendingSync: 'dgtracker_pending_sync',
        lastSync: 'dgtracker_last_sync'
    },

    // Toast notification settings
    toast: {
        // Default duration in milliseconds
        duration: 3000
    }
};

/**
 * Recursively freeze an object and all its nested objects/arrays.
 * A flat Object.freeze() only locks the top level and each direct child
 * object — CONFIG.validation.courseName and the sheetHeaders.* arrays were
 * still mutable underneath it.
 * @param {*} obj
 * @returns {*} The same object, deeply frozen
 */
function deepFreeze(obj) {
    Object.getOwnPropertyNames(obj).forEach(key => {
        const value = obj[key];
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            deepFreeze(value);
        }
    });
    return Object.freeze(obj);
}

// Freeze the configuration to prevent accidental modifications
deepFreeze(CONFIG);
