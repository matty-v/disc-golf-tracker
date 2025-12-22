/**
 * Disc Golf Tracker - Configuration
 *
 * This file contains configuration settings for the application.
 * IMPORTANT: Replace the placeholder values with your actual Google Cloud credentials.
 */

const CONFIG = {
    // Google API Configuration
    // You need to create a project in Google Cloud Console and enable the Google Sheets API
    // Then create OAuth 2.0 credentials and replace these values
    google: {
        // Replace with your Google Cloud Project Client ID
        // Get this from: https://console.cloud.google.com/apis/credentials
        clientId: '201158295757-bkhied76fjhe75phhqptice1mc7lj4m1.apps.googleusercontent.com',

        // Google Sheets API scope
        scopes: 'https://www.googleapis.com/auth/spreadsheets',

        // Discovery docs for Google Sheets API
        discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],

        // Spreadsheet name for new spreadsheets
        spreadsheetTitle: 'Disc Golf Tracker Data'
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
        holes: ['hole_id', 'course_id', 'hole_number', 'par', 'distance'],
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
        lastSync: 'dgtracker_last_sync',
        userInfo: 'dgtracker_user_info'
    },

    // Sync settings
    sync: {
        // How often to attempt sync when online (in milliseconds)
        interval: 30000, // 30 seconds
        // Retry delay after failed sync (in milliseconds)
        retryDelay: 5000, // 5 seconds
        // Maximum retry attempts
        maxRetries: 3
    },

    // Toast notification settings
    toast: {
        // Default duration in milliseconds
        duration: 3000,
        // Long duration for important messages
        longDuration: 5000
    }
};

// Freeze the configuration to prevent accidental modifications
Object.freeze(CONFIG);
Object.freeze(CONFIG.google);
Object.freeze(CONFIG.sheets);
Object.freeze(CONFIG.sheetHeaders);
Object.freeze(CONFIG.validation);
Object.freeze(CONFIG.statistics);
Object.freeze(CONFIG.storageKeys);
Object.freeze(CONFIG.sync);
Object.freeze(CONFIG.toast);
