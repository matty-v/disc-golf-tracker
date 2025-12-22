/**
 * Disc Golf Tracker - Google Sheets API Module
 *
 * Handles all interactions with the Google Sheets API including
 * authentication, reading, and writing data.
 */

const SheetsAPI = {
    // Track initialization state
    initialized: false,
    tokenClient: null,
    accessToken: null,
    tokenExpiry: null,

    // Storage keys for auth persistence
    AUTH_STORAGE_KEYS: {
        accessToken: 'dgtracker_access_token',
        tokenExpiry: 'dgtracker_token_expiry'
    },

    /**
     * Initialize the Google API client
     * @returns {Promise} Resolves when initialized
     */
    async init() {
        return new Promise((resolve, reject) => {
            gapi.load('client', async () => {
                try {
                    await gapi.client.init({
                        discoveryDocs: CONFIG.google.discoveryDocs,
                    });
                    this.initialized = true;
                    console.log('Google API client initialized');
                    resolve();
                } catch (error) {
                    console.error('Error initializing Google API:', error);
                    reject(error);
                }
            });
        });
    },

    /**
     * Initialize the Google Identity Services token client
     */
    initTokenClient() {
        this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CONFIG.google.clientId,
            scope: CONFIG.google.scopes,
            callback: (response) => {
                if (response.access_token) {
                    this.accessToken = response.access_token;
                    // Calculate token expiry (expires_in is in seconds)
                    const expiryTime = Date.now() + (response.expires_in * 1000);
                    this.tokenExpiry = expiryTime;
                    gapi.client.setToken({ access_token: response.access_token });
                    // Persist the token
                    this.persistToken(response.access_token, expiryTime);
                }
            },
        });
    },

    /**
     * Persist authentication token to storage
     * @param {string} token - The access token
     * @param {number} expiry - Token expiry timestamp in milliseconds
     */
    persistToken(token, expiry) {
        try {
            sessionStorage.setItem(this.AUTH_STORAGE_KEYS.accessToken, token);
            sessionStorage.setItem(this.AUTH_STORAGE_KEYS.tokenExpiry, expiry.toString());
        } catch (error) {
            console.warn('Failed to persist auth token:', error);
        }
    },

    /**
     * Clear persisted authentication tokens
     */
    clearPersistedToken() {
        try {
            sessionStorage.removeItem(this.AUTH_STORAGE_KEYS.accessToken);
            sessionStorage.removeItem(this.AUTH_STORAGE_KEYS.tokenExpiry);
        } catch (error) {
            console.warn('Failed to clear persisted token:', error);
        }
    },

    /**
     * Check if a token is expired or about to expire (within 5 minutes)
     * @param {number} expiry - Token expiry timestamp in milliseconds
     * @returns {boolean} Whether the token is expired or expiring soon
     */
    isTokenExpired(expiry) {
        if (!expiry) return true;
        // Consider expired if within 5 minutes of expiry
        const bufferTime = 5 * 60 * 1000; // 5 minutes
        return Date.now() >= (expiry - bufferTime);
    },

    /**
     * Try to restore session from stored token
     * @returns {Promise<boolean>} Whether session was successfully restored
     */
    async tryRestoreSession() {
        try {
            const storedToken = sessionStorage.getItem(this.AUTH_STORAGE_KEYS.accessToken);
            const storedExpiry = sessionStorage.getItem(this.AUTH_STORAGE_KEYS.tokenExpiry);

            if (!storedToken || !storedExpiry) {
                return false;
            }

            const expiry = parseInt(storedExpiry, 10);

            // Check if token is still valid
            if (this.isTokenExpired(expiry)) {
                console.log('Stored token has expired, clearing...');
                this.clearPersistedToken();
                return false;
            }

            // Token is valid, restore the session
            this.accessToken = storedToken;
            this.tokenExpiry = expiry;
            gapi.client.setToken({ access_token: storedToken });

            // Verify the token is still valid by making a test request
            try {
                await this.getUserInfo();
                console.log('Session restored successfully');
                return true;
            } catch (error) {
                console.log('Stored token is invalid, clearing...');
                this.clearPersistedToken();
                this.accessToken = null;
                this.tokenExpiry = null;
                gapi.client.setToken(null);
                return false;
            }
        } catch (error) {
            console.warn('Failed to restore session:', error);
            return false;
        }
    },

    /**
     * Check if user is signed in
     * @returns {boolean} Sign-in status
     */
    isSignedIn() {
        return !!this.accessToken;
    },

    /**
     * Sign in the user
     * @returns {Promise} Resolves with user info
     */
    async signIn() {
        return new Promise((resolve, reject) => {
            if (!this.tokenClient) {
                this.initTokenClient();
            }

            this.tokenClient.callback = async (response) => {
                if (response.error) {
                    reject(response);
                    return;
                }

                this.accessToken = response.access_token;
                gapi.client.setToken({ access_token: response.access_token });

                try {
                    // Get user info
                    const userInfo = await this.getUserInfo();
                    Storage.setUserInfo(userInfo);
                    resolve(userInfo);
                } catch (error) {
                    reject(error);
                }
            };

            this.tokenClient.requestAccessToken({ prompt: 'consent' });
        });
    },

    /**
     * Sign out the user
     */
    signOut() {
        if (this.accessToken) {
            google.accounts.oauth2.revoke(this.accessToken);
            this.accessToken = null;
            this.tokenExpiry = null;
            gapi.client.setToken(null);
            Storage.clearUserInfo();
            this.clearPersistedToken();
        }
    },

    /**
     * Get user info from Google
     * @returns {Promise<Object>} User info
     */
    async getUserInfo() {
        const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: {
                Authorization: `Bearer ${this.accessToken}`
            }
        });
        return response.json();
    },

    // ===================
    // Spreadsheet Operations
    // ===================

    /**
     * Get or create the user's spreadsheet
     * @returns {Promise<string>} Spreadsheet ID
     */
    async getOrCreateSpreadsheet() {
        let spreadsheetId = Storage.getSpreadsheetId();

        if (spreadsheetId) {
            // Verify the spreadsheet still exists and is accessible
            try {
                await gapi.client.sheets.spreadsheets.get({
                    spreadsheetId: spreadsheetId
                });
                return spreadsheetId;
            } catch (error) {
                // Spreadsheet not found or not accessible, create a new one
                console.log('Stored spreadsheet not accessible, creating new one');
                Storage.remove(CONFIG.storageKeys.spreadsheetId);
            }
        }

        // Create new spreadsheet
        spreadsheetId = await this.createSpreadsheet();
        Storage.setSpreadsheetId(spreadsheetId);
        return spreadsheetId;
    },

    /**
     * Create a new spreadsheet with all required sheets
     * @returns {Promise<string>} New spreadsheet ID
     */
    async createSpreadsheet() {
        const response = await gapi.client.sheets.spreadsheets.create({
            properties: {
                title: CONFIG.google.spreadsheetTitle
            },
            sheets: [
                {
                    properties: { title: CONFIG.sheets.courses }
                },
                {
                    properties: { title: CONFIG.sheets.holes }
                },
                {
                    properties: { title: CONFIG.sheets.rounds }
                },
                {
                    properties: { title: CONFIG.sheets.scores }
                }
            ]
        });

        const spreadsheetId = response.result.spreadsheetId;

        // Add headers to each sheet
        await this.addHeaders(spreadsheetId);

        return spreadsheetId;
    },

    /**
     * Add headers to all sheets
     * @param {string} spreadsheetId - The spreadsheet ID
     */
    async addHeaders(spreadsheetId) {
        const requests = Object.keys(CONFIG.sheets).map(key => ({
            range: `${CONFIG.sheets[key]}!A1`,
            values: [CONFIG.sheetHeaders[key]]
        }));

        await gapi.client.sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: spreadsheetId,
            resource: {
                data: requests,
                valueInputOption: 'RAW'
            }
        });
    },

    // ===================
    // Read Operations
    // ===================

    /**
     * Read all data from a sheet
     * @param {string} sheetName - The sheet name
     * @returns {Promise<Array>} Array of row objects
     */
    async readSheet(sheetName) {
        const spreadsheetId = await this.getOrCreateSpreadsheet();

        try {
            const response = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: spreadsheetId,
                range: `${sheetName}!A:Z`
            });

            const values = response.result.values || [];
            if (values.length <= 1) {
                return []; // Only headers or empty
            }

            const headers = values[0];
            const rows = values.slice(1);

            return rows.map(row => {
                const obj = {};
                headers.forEach((header, index) => {
                    obj[header] = row[index] || '';
                });
                return obj;
            });
        } catch (error) {
            console.error(`Error reading ${sheetName}:`, error);
            throw error;
        }
    },

    /**
     * Load all courses from Google Sheets
     * @returns {Promise<Array>} Array of courses
     */
    async loadCourses() {
        const courses = await this.readSheet(CONFIG.sheets.courses);
        // Convert types
        return courses.map(course => ({
            ...course,
            hole_count: parseInt(course.hole_count, 10) || 18
        }));
    },

    /**
     * Load holes for a specific course
     * @param {string} courseId - The course ID
     * @returns {Promise<Array>} Array of holes
     */
    async loadHolesForCourse(courseId) {
        const allHoles = await this.readSheet(CONFIG.sheets.holes);
        return allHoles
            .filter(hole => hole.course_id === courseId)
            .map(hole => ({
                ...hole,
                hole_number: parseInt(hole.hole_number, 10),
                par: parseInt(hole.par, 10) || 3,
                distance: hole.distance ? parseInt(hole.distance, 10) : null
            }))
            .sort((a, b) => a.hole_number - b.hole_number);
    },

    /**
     * Load all rounds for a course
     * @param {string} courseId - The course ID
     * @returns {Promise<Array>} Array of rounds
     */
    async loadRoundsForCourse(courseId) {
        const allRounds = await this.readSheet(CONFIG.sheets.rounds);
        return allRounds
            .filter(round => round.course_id === courseId && round.completed === 'TRUE')
            .map(round => ({
                ...round,
                completed: round.completed === 'TRUE',
                total_score: round.total_score ? parseInt(round.total_score, 10) : null,
                total_par: round.total_par ? parseInt(round.total_par, 10) : null
            }));
    },

    /**
     * Load scores for specific rounds
     * @param {Array<string>} roundIds - Array of round IDs
     * @returns {Promise<Array>} Array of scores
     */
    async loadScoresForRounds(roundIds) {
        const allScores = await this.readSheet(CONFIG.sheets.scores);
        return allScores
            .filter(score => roundIds.includes(score.round_id))
            .map(score => ({
                ...score,
                hole_number: parseInt(score.hole_number, 10),
                throws: parseInt(score.throws, 10),
                approaches: score.approaches ? parseInt(score.approaches, 10) : null,
                putts: score.putts ? parseInt(score.putts, 10) : null
            }));
    },

    // ===================
    // Write Operations
    // ===================

    /**
     * Append a row to a sheet
     * @param {string} sheetName - The sheet name
     * @param {Object} data - The data to append
     * @returns {Promise<boolean>} Success status
     */
    async appendRow(sheetName, data) {
        const spreadsheetId = await this.getOrCreateSpreadsheet();
        const headers = CONFIG.sheetHeaders[Object.keys(CONFIG.sheets).find(key => CONFIG.sheets[key] === sheetName)];

        const values = [headers.map(header => {
            const value = data[header];
            if (value === null || value === undefined) return '';
            if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
            return String(value);
        })];

        try {
            await gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: spreadsheetId,
                range: `${sheetName}!A:Z`,
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: { values }
            });
            return true;
        } catch (error) {
            console.error(`Error appending to ${sheetName}:`, error);
            throw error;
        }
    },

    /**
     * Append multiple rows to a sheet
     * @param {string} sheetName - The sheet name
     * @param {Array<Object>} dataArray - Array of data objects to append
     * @returns {Promise<boolean>} Success status
     */
    async appendRows(sheetName, dataArray) {
        if (!dataArray || dataArray.length === 0) return true;

        const spreadsheetId = await this.getOrCreateSpreadsheet();
        const sheetKey = Object.keys(CONFIG.sheets).find(key => CONFIG.sheets[key] === sheetName);
        const headers = CONFIG.sheetHeaders[sheetKey];

        const values = dataArray.map(data =>
            headers.map(header => {
                const value = data[header];
                if (value === null || value === undefined) return '';
                if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
                return String(value);
            })
        );

        try {
            await gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: spreadsheetId,
                range: `${sheetName}!A:Z`,
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: { values }
            });
            return true;
        } catch (error) {
            console.error(`Error appending rows to ${sheetName}:`, error);
            throw error;
        }
    },

    /**
     * Update a row in a sheet by finding and replacing it
     * @param {string} sheetName - The sheet name
     * @param {string} idField - The ID field name
     * @param {string} idValue - The ID value to find
     * @param {Object} data - The new data
     * @returns {Promise<boolean>} Success status
     */
    async updateRow(sheetName, idField, idValue, data) {
        const spreadsheetId = await this.getOrCreateSpreadsheet();

        try {
            // First, find the row
            const response = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: spreadsheetId,
                range: `${sheetName}!A:Z`
            });

            const values = response.result.values || [];
            if (values.length <= 1) return false;

            const headers = values[0];
            const idIndex = headers.indexOf(idField);
            if (idIndex === -1) return false;

            // Find the row index
            let rowIndex = -1;
            for (let i = 1; i < values.length; i++) {
                if (values[i][idIndex] === idValue) {
                    rowIndex = i + 1; // 1-based for Sheets API
                    break;
                }
            }

            if (rowIndex === -1) return false;

            // Update the row
            const newValues = [headers.map(header => {
                const value = data[header];
                if (value === null || value === undefined) return '';
                if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
                return String(value);
            })];

            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: spreadsheetId,
                range: `${sheetName}!A${rowIndex}`,
                valueInputOption: 'RAW',
                resource: { values: newValues }
            });

            return true;
        } catch (error) {
            console.error(`Error updating row in ${sheetName}:`, error);
            throw error;
        }
    },

    /**
     * Save a course to Google Sheets
     * @param {Object} course - The course data
     * @returns {Promise<boolean>} Success status
     */
    async saveCourse(course) {
        return this.appendRow(CONFIG.sheets.courses, course);
    },

    /**
     * Save holes to Google Sheets
     * @param {Array<Object>} holes - Array of hole data
     * @returns {Promise<boolean>} Success status
     */
    async saveHoles(holes) {
        return this.appendRows(CONFIG.sheets.holes, holes);
    },

    /**
     * Save a round to Google Sheets
     * @param {Object} round - The round data
     * @returns {Promise<boolean>} Success status
     */
    async saveRound(round) {
        return this.appendRow(CONFIG.sheets.rounds, round);
    },

    /**
     * Update a round in Google Sheets
     * @param {Object} round - The round data
     * @returns {Promise<boolean>} Success status
     */
    async updateRound(round) {
        return this.updateRow(CONFIG.sheets.rounds, 'round_id', round.round_id, round);
    },

    /**
     * Save scores to Google Sheets
     * @param {Array<Object>} scores - Array of score data
     * @returns {Promise<boolean>} Success status
     */
    async saveScores(scores) {
        return this.appendRows(CONFIG.sheets.scores, scores);
    },

    /**
     * Update course's last_played date
     * @param {string} courseId - The course ID
     * @param {string} date - The date string
     * @returns {Promise<boolean>} Success status
     */
    async updateCourseLastPlayed(courseId, date) {
        const courses = await this.loadCourses();
        const course = courses.find(c => c.course_id === courseId);
        if (course) {
            course.last_played = date;
            return this.updateRow(CONFIG.sheets.courses, 'course_id', courseId, course);
        }
        return false;
    },

    // ===================
    // Sync Operations
    // ===================

    /**
     * Sync all data from Google Sheets to local storage
     * @returns {Promise<boolean>} Success status
     */
    async syncFromSheets() {
        try {
            Utils.showLoading('Syncing data...');

            // Load all data
            const courses = await this.loadCourses();
            const allHoles = await this.readSheet(CONFIG.sheets.holes);
            const allRounds = await this.readSheet(CONFIG.sheets.rounds);
            const allScores = await this.readSheet(CONFIG.sheets.scores);

            // Store locally
            await Storage.putMany('courses', courses);
            await Storage.putMany('holes', allHoles.map(hole => ({
                ...hole,
                hole_number: parseInt(hole.hole_number, 10),
                par: parseInt(hole.par, 10) || 3,
                distance: hole.distance ? parseInt(hole.distance, 10) : null
            })));
            await Storage.putMany('rounds', allRounds.map(round => ({
                ...round,
                completed: round.completed === 'TRUE',
                total_score: round.total_score ? parseInt(round.total_score, 10) : null,
                total_par: round.total_par ? parseInt(round.total_par, 10) : null
            })));
            await Storage.putMany('scores', allScores.map(score => ({
                ...score,
                hole_number: parseInt(score.hole_number, 10),
                throws: parseInt(score.throws, 10),
                approaches: score.approaches ? parseInt(score.approaches, 10) : null,
                putts: score.putts ? parseInt(score.putts, 10) : null
            })));

            Storage.updateLastSync();
            Utils.hideLoading();
            return true;
        } catch (error) {
            console.error('Sync error:', error);
            Utils.hideLoading();
            throw error;
        }
    },

    /**
     * Process pending sync operations
     * @returns {Promise<boolean>} Success status
     */
    async processPendingSync() {
        const pending = Storage.getPendingSync();
        if (pending.length === 0) return true;

        const failed = [];

        for (let i = 0; i < pending.length; i++) {
            const operation = pending[i];
            try {
                switch (operation.type) {
                    case 'saveCourse':
                        await this.saveCourse(operation.data);
                        break;
                    case 'saveHoles':
                        await this.saveHoles(operation.data);
                        break;
                    case 'saveRound':
                        await this.saveRound(operation.data);
                        break;
                    case 'updateRound':
                        await this.updateRound(operation.data);
                        break;
                    case 'saveScores':
                        await this.saveScores(operation.data);
                        break;
                    case 'updateCourseLastPlayed':
                        await this.updateCourseLastPlayed(operation.data.courseId, operation.data.date);
                        break;
                }
            } catch (error) {
                console.error('Failed to process pending operation:', error);
                failed.push(operation);
            }
        }

        // Keep only failed operations
        Storage.set(CONFIG.storageKeys.pendingSync, failed);

        return failed.length === 0;
    }
};

// Make SheetsAPI globally available
window.SheetsAPI = SheetsAPI;
