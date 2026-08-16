/**
 * Disc Golf Tracker - Sheets DB API Client
 *
 * Handles all interactions with the sheets-db-api backend service.
 * Uses service account authentication via the backend.
 */

const SheetsAPI = {
    // Spreadsheet ID (set after user connects)
    spreadsheetId: null,

    /**
     * Set the spreadsheet ID for API calls
     * @param {string} id - The Google Spreadsheet ID
     */
    setSpreadsheetId(id) {
        this.spreadsheetId = id;
    },

    /**
     * Get the current spreadsheet ID
     * @returns {string|null} The spreadsheet ID
     */
    getSpreadsheetId() {
        return this.spreadsheetId;
    },

    /**
     * Check if API is configured with a spreadsheet ID
     * @returns {boolean} Whether configured
     */
    isConfigured() {
        return !!this.spreadsheetId;
    },

    // ===================
    // Core API Methods
    // ===================

    /**
     * Make an API request to sheets-db-api
     * @param {string} path - API path
     * @param {Object} options - Fetch options
     * @returns {Promise<any>} Response data
     */
    async request(path, options = {}) {
        const url = `${CONFIG.api.baseUrl}${path}`;
        const headers = {
            'Content-Type': 'application/json',
            'X-Spreadsheet-Id': this.spreadsheetId,
            ...options.headers
        };

        const response = await fetch(url, { ...options, headers });

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch {
                errorData = await response.text();
            }
            const message = typeof errorData === 'object' && errorData?.error
                ? errorData.error
                : `Request failed with status ${response.status}`;
            throw new Error(message);
        }

        if (response.status === 204) return undefined;
        return response.json();
    },

    /**
     * Check API health
     * @returns {Promise<{status: string}>} Health status
     */
    async health() {
        const response = await fetch(`${CONFIG.api.baseUrl}/health`);
        if (!response.ok) {
            throw new Error('API health check failed');
        }
        return response.json();
    },

    /**
     * List all sheets in the spreadsheet
     * @returns {Promise<Array>} Array of sheet info
     */
    async listSheets() {
        const result = await this.request('/sheets');
        return result?.sheets || [];
    },

    /**
     * Create a new sheet
     * @param {string} name - Sheet name
     * @returns {Promise<void>}
     */
    async createSheet(name) {
        await this.request('/sheets', {
            method: 'POST',
            body: JSON.stringify({ name })
        });
    },

    /**
     * Get all rows from a sheet
     * @param {string} sheetName - Sheet name
     * @returns {Promise<Array>} Array of row objects
     */
    async getRows(sheetName) {
        const result = await this.request(`/sheets/${encodeURIComponent(sheetName)}/rows`);
        return result?.rows || [];
    },

    /**
     * Create a new row in a sheet
     * @param {string} sheetName - Sheet name
     * @param {Object} data - Row data
     * @returns {Promise<{rowIndex: number}>} Created row info
     */
    async createRow(sheetName, data) {
        return this.request(`/sheets/${encodeURIComponent(sheetName)}/rows`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    /**
     * Update a row in a sheet
     * @param {string} sheetName - Sheet name
     * @param {number} rowIndex - Row index (1-based, data starts at 2)
     * @param {Object} data - Row data
     * @returns {Promise<void>}
     */
    async updateRow(sheetName, rowIndex, data) {
        await this.request(`/sheets/${encodeURIComponent(sheetName)}/rows/${rowIndex}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    /**
     * Delete a row from a sheet
     * @param {string} sheetName - Sheet name
     * @param {number} rowIndex - Row index (1-based, data starts at 2)
     * @returns {Promise<void>}
     */
    async deleteRow(sheetName, rowIndex) {
        await this.request(`/sheets/${encodeURIComponent(sheetName)}/rows/${rowIndex}`, {
            method: 'DELETE'
        });
    },

    // ===================
    // Sheet Initialization
    // ===================

    /**
     * Initialize required sheets with headers
     * @returns {Promise<{success: boolean, created: string[], initialized: string[]}>}
     */
    async initializeSheets() {
        const existingSheets = await this.listSheets();

        // Build a map of existing sheet names (case-insensitive lookup)
        // API returns 'title' for sheet names
        const existingSheetMap = {};
        existingSheets
            .filter(s => s && (s.title || s.name))
            .forEach(s => {
                const sheetName = s.title || s.name;
                existingSheetMap[sheetName.toLowerCase()] = sheetName;
            });

        const created = [];
        const initialized = [];

        const requiredSheets = [
            { name: CONFIG.sheets.courses, headers: CONFIG.sheetHeaders.courses },
            { name: CONFIG.sheets.holes, headers: CONFIG.sheetHeaders.holes },
            { name: CONFIG.sheets.rounds, headers: CONFIG.sheetHeaders.rounds },
            { name: CONFIG.sheets.scores, headers: CONFIG.sheetHeaders.scores }
        ];

        for (const sheet of requiredSheets) {
            const sheetNameLower = sheet.name.toLowerCase();
            const existingName = existingSheetMap[sheetNameLower];

            // Use the existing sheet name if it exists (preserves original casing)
            const actualSheetName = existingName || sheet.name;

            if (!existingName) {
                // Sheet doesn't exist - create it
                await this.createSheet(sheet.name);
                created.push(sheet.name);

                // New sheet needs headers initialized
                await this.initializeSheetHeaders(sheet.name, sheet.headers);
                initialized.push(sheet.name);
            } else {
                // Sheet exists - check if it needs headers initialized
                const rows = await this.getRows(actualSheetName);

                if (rows.length === 0) {
                    // Empty sheet - initialize headers
                    await this.initializeSheetHeaders(actualSheetName, sheet.headers);
                    initialized.push(actualSheetName);
                }
                // If sheet has data, assume headers are already set up correctly
            }
        }

        return { success: true, created, initialized };
    },

    /**
     * Initialize headers for a sheet by creating and deleting a placeholder row
     * @param {string} sheetName - The sheet name
     * @param {Array<string>} headers - The header field names
     * @returns {Promise<void>}
     */
    async initializeSheetHeaders(sheetName, headers) {
        const placeholderData = {};
        headers.forEach(header => {
            placeholderData[header] = '';
        });

        const result = await this.createRow(sheetName, placeholderData);

        // Delete the placeholder row
        if (result && result.rowIndex) {
            await this.deleteRow(sheetName, result.rowIndex);
        }
    },

    // ===================
    // High-Level Operations
    // ===================

    /**
     * Load all courses from Google Sheets
     * @returns {Promise<Array>} Array of courses
     */
    async loadCourses() {
        const courses = await this.getRows(CONFIG.sheets.courses);
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
        const allHoles = await this.getRows(CONFIG.sheets.holes);
        return allHoles
            .filter(hole => hole.course_id === courseId)
            .map(hole => ({
                ...hole,
                hole_number: parseInt(hole.hole_number, 10),
                par: parseInt(hole.par, 10) || 3,
                distance: hole.distance ? parseInt(hole.distance, 10) : null,
                description: hole.description || ''
            }))
            .sort((a, b) => a.hole_number - b.hole_number);
    },

    // ===================
    // Write Operations
    // ===================

    /**
     * Save a course to Google Sheets
     * @param {Object} course - The course data
     * @returns {Promise<void>}
     */
    async saveCourse(course) {
        const data = this.prepareRowData(course, CONFIG.sheetHeaders.courses);
        await this.createRow(CONFIG.sheets.courses, data);
    },

    /**
     * Save holes to Google Sheets. Requests run concurrently — the backend
     * has no batch-create endpoint, so this is a parallelisation win over
     * one-request-per-row, not a true batch (Obi-wan's architecture, Open
     * Question 1).
     * @param {Array<Object>} holes - Array of hole data
     * @returns {Promise<void>}
     */
    async saveHoles(holes) {
        await Promise.all(holes.map(hole => {
            const data = this.prepareRowData(hole, CONFIG.sheetHeaders.holes);
            return this.createRow(CONFIG.sheets.holes, data);
        }));
    },

    /**
     * Save a round to Google Sheets
     * @param {Object} round - The round data
     * @returns {Promise<void>}
     */
    async saveRound(round) {
        const data = this.prepareRowData(round, CONFIG.sheetHeaders.rounds);
        await this.createRow(CONFIG.sheets.rounds, data);
    },

    /**
     * Save scores to Google Sheets. Requests run concurrently — see saveHoles.
     * @param {Array<Object>} scores - Array of score data
     * @returns {Promise<void>}
     */
    async saveScores(scores) {
        await Promise.all(scores.map(score => {
            const data = this.prepareRowData(score, CONFIG.sheetHeaders.scores);
            return this.createRow(CONFIG.sheets.scores, data);
        }));
    },

    /**
     * Update a row identified by an ID field, with a post-write read-back
     * verification.
     *
     * The backend only supports positional (row-index) writes: read the
     * whole tab, locate the row, write to index+2. Between that read and
     * the write, another writer — including a human editing the Sheet
     * directly — can shift rows, and that race cannot be closed client-side
     * (Obi-wan's architecture, Open Question 2). The read-back turns a
     * silent wrong-row overwrite into a *detected*, retryable failure
     * instead of a cure for the race itself.
     * @param {string} sheetName - Sheet tab name
     * @param {string} idField - The field that uniquely identifies the row
     * @param {string} idValue - The ID value to locate
     * @param {Array<string>} headers - The header fields for this sheet
     * @param {(row: Object) => Object} mutate - Receives the located row, returns the row to write
     * @returns {Promise<boolean>} Success status — false means the write was
     *   not confirmed and the caller should queue it for retry
     */
    async updateRowById(sheetName, idField, idValue, headers, mutate) {
        const allRows = await this.getRows(sheetName);
        const rowIndex = allRows.findIndex(r => r[idField] === idValue);

        if (rowIndex === -1) {
            console.warn(`Row not found for update in ${sheetName}:`, idValue);
            return false;
        }

        const updatedRow = mutate(allRows[rowIndex]);
        // Row index in API is 1-based, data starts at row 2
        const apiRowIndex = rowIndex + 2;
        const data = this.prepareRowData(updatedRow, headers);
        await this.updateRow(sheetName, apiRowIndex, data);

        // Confirm the row at that index is still the one we intended to write.
        const verifyRows = await this.getRows(sheetName);
        const verifyRow = verifyRows[apiRowIndex - 2];
        if (!verifyRow || verifyRow[idField] !== idValue) {
            console.error(`updateRowById: read-back mismatch for ${sheetName}`, idValue);
            return false;
        }

        return true;
    },

    /**
     * Update course's last_played date
     * @param {string} courseId - The course ID
     * @param {string} date - The date string
     * @returns {Promise<boolean>} Success status
     */
    async updateCourseLastPlayed(courseId, date) {
        return this.updateRowById(CONFIG.sheets.courses, 'course_id', courseId, CONFIG.sheetHeaders.courses,
            (course) => {
                course.last_played = date;
                return course;
            });
    },

    /**
     * Update a hole in Google Sheets
     * @param {Object} hole - The hole data (must include hole_id)
     * @returns {Promise<boolean>} Success status
     */
    async updateHole(hole) {
        return this.updateRowById(CONFIG.sheets.holes, 'hole_id', hole.hole_id, CONFIG.sheetHeaders.holes,
            () => hole);
    },

    /**
     * Prepare row data for API (convert values to strings, handle booleans)
     * @param {Object} data - The raw data
     * @param {Array<string>} headers - The header fields
     * @returns {Object} Prepared data
     */
    prepareRowData(data, headers) {
        const prepared = {};
        headers.forEach(header => {
            const value = data[header];
            if (value === null || value === undefined) {
                prepared[header] = '';
            } else if (typeof value === 'boolean') {
                prepared[header] = value ? 'TRUE' : 'FALSE';
            } else {
                prepared[header] = String(value);
            }
        });
        return prepared;
    },

    // ===================
    // Sync Operations
    // ===================

    /**
     * Sync all data from Google Sheets to local storage
     *
     * Does not drive the loading UI itself — the caller owns that (the API
     * client driving UI directly was a module-boundary leak; see CLAUDE.md
     * § Architecture).
     * @returns {Promise<boolean>} Success status
     */
    async syncFromSheets() {
        try {
            // Load all data
            const courses = await this.loadCourses();
            const allHoles = await this.getRows(CONFIG.sheets.holes);
            const allRounds = await this.getRows(CONFIG.sheets.rounds);
            const allScores = await this.getRows(CONFIG.sheets.scores);

            // Store locally
            await Storage.putMany('courses', courses);
            await Storage.putMany('holes', allHoles.map(hole => ({
                ...hole,
                hole_number: parseInt(hole.hole_number, 10),
                par: parseInt(hole.par, 10) || 3,
                distance: hole.distance ? parseInt(hole.distance, 10) : null,
                description: hole.description || ''
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
            return true;
        } catch (error) {
            console.error('Sync error:', error);
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
                    case 'saveScores':
                        await this.saveScores(operation.data);
                        break;
                    case 'updateHole':
                        await this.updateHole(operation.data);
                        break;
                    case 'updateCourseLastPlayed':
                        await this.updateCourseLastPlayed(operation.data.courseId, operation.data.date);
                        break;
                    default:
                        // An unrecognised operation type must never be silently
                        // dropped — keep it in the retry queue rather than
                        // losing it (finding 10).
                        console.error('Unrecognised pending-sync operation type:', operation.type);
                        failed.push(operation);
                        continue;
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
