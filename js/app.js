/**
 * Disc Golf Tracker - Main Application
 *
 * This is the main application file that coordinates all modules
 * and handles the user interface.
 */

const App = {
    // Application state
    state: {
        isOnline: navigator.onLine,
        currentScreen: 'home',
        courses: [],
        currentRound: null,
        currentHoleIndex: 0,
        holeStats: {},
        courseStats: null,
        editingSettings: false
    },

    /**
     * Initialize the application
     */
    async init() {
        console.log('Initializing Disc Golf Tracker...');

        try {
            // Initialize storage first
            await Storage.init();

            // Set up event listeners
            this.setupEventListeners();

            // Check online status
            this.updateOnlineStatus();

            // Check for existing spreadsheet connection
            const spreadsheetId = Storage.getSpreadsheetId();

            if (!spreadsheetId) {
                // No connection - show setup wizard
                Utils.hideLoading();
                this.showScreen('setup');
                console.log('No spreadsheet configured - showing setup wizard');
                return;
            }

            // Configure API client with stored ID
            SheetsAPI.setSpreadsheetId(spreadsheetId);

            // Try to sync data if online
            if (this.state.isOnline) {
                try {
                    await SheetsAPI.health();
                    await SheetsAPI.syncFromSheets();
                } catch (syncError) {
                    console.warn('Failed to sync on startup:', syncError);
                    // Continue with cached data
                }
            }

            // Load cached data
            await this.loadCachedData();

            // Check for incomplete round
            this.checkIncompleteRound();

            Utils.hideLoading();

            // Show home screen
            this.showScreen('home');

            console.log('App initialized successfully');
        } catch (error) {
            console.error('Initialization error:', error);
            Utils.hideLoading();
            Utils.showToast('Failed to initialize app', 'error');
        }
    },

    /**
     * Set up all event listeners
     */
    setupEventListeners() {
        // Online/offline status
        window.addEventListener('online', () => this.updateOnlineStatus());
        window.addEventListener('offline', () => this.updateOnlineStatus());

        // Header buttons
        document.getElementById('back-btn').addEventListener('click', () => this.handleBack());

        // Setup wizard
        document.getElementById('setup-connect-btn').addEventListener('click', () => this.handleSetupConnect());

        // Home screen buttons
        document.getElementById('new-round-btn').addEventListener('click', () => this.handleNewRound());
        document.getElementById('resume-round-btn').addEventListener('click', () => this.handleResumeRound());
        document.getElementById('settings-btn').addEventListener('click', () => this.showScreen('settings'));

        // Settings screen
        document.getElementById('change-sheet-btn').addEventListener('click', () => this.handleStartEditSettings());
        document.getElementById('settings-cancel-btn').addEventListener('click', () => this.handleCancelEditSettings());
        document.getElementById('settings-save-btn').addEventListener('click', () => this.handleSaveSettings());

        // Course selection
        document.getElementById('create-course-btn').addEventListener('click', () => this.showScreen('new-course'));

        // New course form
        document.getElementById('new-course-form').addEventListener('submit', (e) => this.handleNewCourseSubmit(e));

        // Scoring navigation
        document.getElementById('prev-hole-btn').addEventListener('click', () => this.navigateHole(-1));
        document.getElementById('next-hole-btn').addEventListener('click', () => this.navigateHole(1));
        document.getElementById('save-hole-btn').addEventListener('click', () => this.handleSaveHole());

        // Score input change handlers
        document.getElementById('score-throws').addEventListener('input', () => this.updateScoreRelative());
        document.getElementById('setup-par').addEventListener('input', () => this.updateScoreRelative());

        // Summary screen
        document.getElementById('view-scorecard-btn').addEventListener('click', () => this.showScorecard());
        document.getElementById('finish-round-btn').addEventListener('click', () => this.handleFinishRound());
        document.getElementById('close-scorecard-btn').addEventListener('click', () => this.hideScorecard());

        // Incomplete round modal
        document.getElementById('continue-round-btn').addEventListener('click', () => this.handleContinueRound());
        document.getElementById('abandon-round-btn').addEventListener('click', () => this.handleAbandonRound());

        // Stepper buttons
        document.querySelectorAll('.btn-stepper').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleStepper(e));
        });

        // Validation on input
        document.getElementById('score-approaches').addEventListener('input', () => this.validateScoreDetails());
        document.getElementById('score-putts').addEventListener('input', () => this.validateScoreDetails());
    },

    /**
     * Handle stepper button clicks
     */
    handleStepper(event) {
        const button = event.currentTarget;
        const action = button.dataset.action;
        const targetId = button.dataset.target;
        const input = document.getElementById(targetId);

        if (!input) return;

        let value = parseInt(input.value, 10) || 0;
        const min = parseInt(input.min, 10) || 0;
        const max = parseInt(input.max, 10) || 99;

        if (action === 'increment' && value < max) {
            value++;
        } else if (action === 'decrement' && value > min) {
            value--;
        }

        input.value = value;
        input.dispatchEvent(new Event('input'));
    },

    /**
     * Update online/offline status
     */
    updateOnlineStatus() {
        this.state.isOnline = navigator.onLine;
        const indicator = document.getElementById('offline-indicator');

        if (this.state.isOnline) {
            Utils.toggleElement(indicator, false);
            if (SheetsAPI.isConfigured()) {
                this.processPendingSync();
            }
        } else {
            Utils.toggleElement(indicator, true);
        }
    },

    // ===================
    // Setup Wizard Handlers
    // ===================

    /**
     * Handle setup connect button click
     */
    async handleSetupConnect() {
        const sheetIdInput = document.getElementById('setup-sheet-id');
        const sheetId = sheetIdInput.value.trim();

        if (!sheetId) {
            this.showSetupStatus('Please enter a Sheet ID', 'error');
            return;
        }

        this.showSetupStatus('Connecting...', 'info');
        const connectBtn = document.getElementById('setup-connect-btn');
        connectBtn.disabled = true;
        connectBtn.textContent = 'Connecting...';

        try {
            // Set the spreadsheet ID
            SheetsAPI.setSpreadsheetId(sheetId);

            // Test the connection
            await SheetsAPI.health();

            // Initialize sheets (create if they don't exist, set up headers if empty)
            this.showSetupStatus('Initializing sheets...', 'info');
            const result = await SheetsAPI.initializeSheets();

            if (result.created.length > 0) {
                console.log('Created sheets:', result.created);
            }
            if (result.initialized && result.initialized.length > 0) {
                console.log('Initialized headers for existing sheets:', result.initialized);
            }

            // Save the spreadsheet ID
            Storage.setSpreadsheetId(sheetId);

            this.showSetupStatus('Connected! Loading data...', 'success');

            // Sync data
            await SheetsAPI.syncFromSheets();
            await this.loadCachedData();

            // Navigate to home
            Utils.showToast('Successfully connected!', 'success');
            this.showScreen('home');

        } catch (error) {
            console.error('Setup connection error:', error);
            this.showSetupStatus('Connection failed. Check the Sheet ID and make sure you shared it with the service account.', 'error');
            SheetsAPI.setSpreadsheetId(null);
        } finally {
            connectBtn.disabled = false;
            connectBtn.textContent = 'Connect';
        }
    },

    /**
     * Show status message in setup wizard
     */
    showSetupStatus(message, type) {
        const statusEl = document.getElementById('setup-status');
        statusEl.textContent = message;
        statusEl.className = `setup-status ${type}`;
        Utils.toggleElement(statusEl, true);
    },

    // ===================
    // Settings Handlers
    // ===================

    /**
     * Handle start editing settings
     */
    handleStartEditSettings() {
        this.state.editingSettings = true;
        const currentId = Storage.getSpreadsheetId();
        document.getElementById('settings-sheet-id').value = currentId || '';
        Utils.toggleElement('settings-connected', false);
        Utils.toggleElement('settings-edit', true);
    },

    /**
     * Handle cancel editing settings
     */
    handleCancelEditSettings() {
        this.state.editingSettings = false;
        Utils.toggleElement('settings-connected', true);
        Utils.toggleElement('settings-edit', false);
        Utils.toggleElement('settings-status', false);
    },

    /**
     * Handle save settings
     */
    async handleSaveSettings() {
        const sheetIdInput = document.getElementById('settings-sheet-id');
        const sheetId = sheetIdInput.value.trim();

        if (!sheetId) {
            this.showSettingsStatus('Please enter a Sheet ID', 'error');
            return;
        }

        this.showSettingsStatus('Connecting...', 'info');
        const saveBtn = document.getElementById('settings-save-btn');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Connecting...';

        try {
            // Set the spreadsheet ID
            SheetsAPI.setSpreadsheetId(sheetId);

            // Test the connection
            await SheetsAPI.health();

            // Initialize sheets
            this.showSettingsStatus('Initializing sheets...', 'info');
            await SheetsAPI.initializeSheets();

            // Save the spreadsheet ID
            Storage.setSpreadsheetId(sheetId);

            // Sync data
            this.showSettingsStatus('Syncing data...', 'info');
            await SheetsAPI.syncFromSheets();
            await this.loadCachedData();

            // Update UI
            this.state.editingSettings = false;
            this.updateSettingsUI();
            Utils.toggleElement('settings-connected', true);
            Utils.toggleElement('settings-edit', false);
            Utils.toggleElement('settings-status', false);

            Utils.showToast('Spreadsheet updated successfully!', 'success');

        } catch (error) {
            console.error('Settings save error:', error);
            this.showSettingsStatus('Connection failed. Check the Sheet ID and sharing.', 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save & Connect';
        }
    },

    /**
     * Show status message in settings
     */
    showSettingsStatus(message, type) {
        const statusEl = document.getElementById('settings-status');
        statusEl.textContent = message;
        statusEl.className = `setup-status ${type}`;
        Utils.toggleElement(statusEl, true);
    },

    /**
     * Update settings UI with current connection info
     */
    updateSettingsUI() {
        const spreadsheetId = Storage.getSpreadsheetId();
        if (spreadsheetId) {
            const sheetLink = document.getElementById('settings-sheet-link');
            sheetLink.href = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
        }
    },

    /**
     * Load cached data from local storage
     */
    async loadCachedData() {
        this.state.courses = await Storage.getAll('courses');
    },

    /**
     * Check for incomplete round
     */
    checkIncompleteRound() {
        const savedRound = Storage.getCurrentRound();
        if (savedRound && !savedRound.completed) {
            // Ensure holes are sorted by hole_number
            if (savedRound.holes && savedRound.holes.length > 0) {
                savedRound.holes.sort((a, b) => a.hole_number - b.hole_number);
            }
            this.state.currentRound = savedRound;
            Utils.toggleElement('resume-round-btn', true);
        }
    },

    /**
     * Show a screen
     */
    showScreen(screenName) {
        this.state.currentScreen = screenName;

        // Update screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(`screen-${screenName}`).classList.add('active');

        // Update header
        switch (screenName) {
            case 'setup':
                Utils.setHeaderTitle('Disc Golf Tracker');
                Utils.showBackButton(false);
                break;
            case 'home':
                Utils.setHeaderTitle('Disc Golf Tracker');
                Utils.showBackButton(false);
                break;
            case 'settings':
                Utils.setHeaderTitle('Settings');
                Utils.showBackButton(true);
                this.updateSettingsUI();
                break;
            case 'course-select':
                Utils.setHeaderTitle('Select Course');
                Utils.showBackButton(true);
                break;
            case 'new-course':
                Utils.setHeaderTitle('New Course');
                Utils.showBackButton(true);
                break;
            case 'scoring':
                Utils.setHeaderTitle(this.state.currentRound?.courseName || 'Scoring');
                Utils.showBackButton(true);
                break;
            case 'summary':
                Utils.setHeaderTitle('Round Summary');
                Utils.showBackButton(false);
                break;
        }
    },


    /**
     * Handle back button
     */
    handleBack() {
        switch (this.state.currentScreen) {
            case 'course-select':
            case 'new-course':
            case 'settings':
                this.showScreen('home');
                break;
            case 'scoring':
                if (confirm('Leave round? Your progress will be saved.')) {
                    this.saveCurrentRoundState();
                    this.showScreen('home');
                }
                break;
            default:
                this.showScreen('home');
        }
    },

    /**
     * Handle new round button click
     */
    handleNewRound() {
        // Check for incomplete round
        const savedRound = Storage.getCurrentRound();
        if (savedRound && !savedRound.completed) {
            this.showIncompleteRoundModal();
            return;
        }

        this.showScreen('course-select');
        this.renderCourseList();
    },

    /**
     * Handle resume round button click
     */
    handleResumeRound() {
        const savedRound = Storage.getCurrentRound();
        if (savedRound) {
            // Ensure holes are sorted by hole_number
            if (savedRound.holes && savedRound.holes.length > 0) {
                savedRound.holes.sort((a, b) => a.hole_number - b.hole_number);
            }
            this.state.currentRound = savedRound;
            this.state.currentHoleIndex = savedRound.currentHoleIndex || 0;
            this.loadRoundData();
            this.showScreen('scoring');
            this.renderScoringScreen();
        }
    },

    /**
     * Show incomplete round modal
     */
    showIncompleteRoundModal() {
        const modal = document.getElementById('incomplete-round-modal');
        const message = document.getElementById('incomplete-round-message');
        const savedRound = Storage.getCurrentRound();

        message.textContent = `You have an incomplete round at ${savedRound.courseName}. Would you like to continue or start a new round?`;
        modal.classList.remove('hidden');
    },

    /**
     * Handle continue round from modal
     */
    handleContinueRound() {
        document.getElementById('incomplete-round-modal').classList.add('hidden');
        this.handleResumeRound();
    },

    /**
     * Handle abandon round from modal
     */
    handleAbandonRound() {
        document.getElementById('incomplete-round-modal').classList.add('hidden');
        Storage.clearCurrentRound();
        this.state.currentRound = null;
        Utils.toggleElement('resume-round-btn', false);
        this.showScreen('course-select');
        this.renderCourseList();
    },

    /**
     * Render course list
     */
    renderCourseList() {
        const container = document.getElementById('course-list');
        const emptyMessage = document.getElementById('no-courses-message');

        container.innerHTML = '';

        if (this.state.courses.length === 0) {
            Utils.toggleElement(emptyMessage, true);
            return;
        }

        Utils.toggleElement(emptyMessage, false);

        // Sort courses by last played date
        const sortedCourses = Utils.sortBy(this.state.courses, 'last_played', false);

        sortedCourses.forEach(course => {
            const card = document.createElement('div');
            card.className = 'course-card';
            card.setAttribute('role', 'listitem');
            card.setAttribute('tabindex', '0');
            card.setAttribute('aria-label', `${course.course_name}, ${course.hole_count} holes${course.last_played ? `, last played ${Utils.formatDate(course.last_played)}` : ''}`);
            card.innerHTML = `
                <div class="course-card-name">${course.course_name}</div>
                <div class="course-card-details">
                    <span>${course.hole_count} holes</span>
                    ${course.last_played ? `<span>Last played: ${Utils.formatDate(course.last_played)}</span>` : ''}
                </div>
            `;
            card.addEventListener('click', () => this.selectCourse(course));
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.selectCourse(course);
                }
            });
            container.appendChild(card);
        });
    },

    /**
     * Select an existing course
     */
    async selectCourse(course) {
        Utils.showLoading('Loading course...');

        try {
            // Load holes for this course
            let holes = await Storage.getByIndex('holes', 'course_id', course.course_id);

            if (holes.length === 0 && this.state.isOnline && SheetsAPI.isConfigured()) {
                // Try loading from sheets
                holes = await SheetsAPI.loadHolesForCourse(course.course_id);
                await Storage.putMany('holes', holes);
            }

            // Sort holes by hole_number to ensure correct order
            holes.sort((a, b) => a.hole_number - b.hole_number);

            // Load historical data
            let rounds = await Storage.getByIndex('rounds', 'course_id', course.course_id);
            let scores = [];

            if (rounds.length > 0) {
                const roundIds = rounds.filter(r => r.completed).map(r => r.round_id);
                scores = await Storage.getAll('scores');
                scores = scores.filter(s => roundIds.includes(s.round_id));
            }

            // Calculate statistics
            this.state.holeStats = Statistics.calculateCourseHoleStats(holes, scores);
            this.state.courseStats = Statistics.calculateCourseStats(
                course.course_id, rounds, scores, holes
            );

            // Create new round
            this.state.currentRound = {
                round_id: Utils.generateId(),
                course_id: course.course_id,
                courseName: course.course_name,
                round_date: Utils.formatDateForStorage(),
                completed: false,
                holes: holes,
                scores: [],
                isNewCourse: false,
                currentHoleIndex: 0,
                holeCount: course.hole_count
            };

            this.state.currentHoleIndex = 0;
            this.saveCurrentRoundState();

            Utils.hideLoading();
            this.showScreen('scoring');
            this.renderScoringScreen();
        } catch (error) {
            console.error('Error loading course:', error);
            Utils.hideLoading();
            Utils.showToast('Failed to load course', 'error');
        }
    },

    /**
     * Handle new course form submission
     */
    async handleNewCourseSubmit(event) {
        event.preventDefault();

        const nameInput = document.getElementById('course-name');
        const holeCountInput = document.getElementById('hole-count');

        const name = nameInput.value.trim();
        const holeCount = parseInt(holeCountInput.value, 10);

        // Validate
        const validation = Utils.validateCourseName(name);
        if (!validation.isValid) {
            document.getElementById('course-name-error').textContent = validation.message;
            nameInput.classList.add('error');
            return;
        }

        if (!Utils.isValidNumber(holeCount, 1, 27)) {
            document.getElementById('hole-count-error').textContent = 'Hole count must be between 1 and 27';
            holeCountInput.classList.add('error');
            return;
        }

        // Create course
        const course = {
            course_id: Utils.generateId(),
            course_name: name,
            hole_count: holeCount,
            created_date: Utils.formatDateForStorage(),
            last_played: null
        };

        // Create empty holes
        const holes = [];
        for (let i = 1; i <= holeCount; i++) {
            holes.push({
                hole_id: Utils.generateId(),
                course_id: course.course_id,
                hole_number: i,
                par: 3,
                distance: null
            });
        }

        // Create round
        this.state.currentRound = {
            round_id: Utils.generateId(),
            course_id: course.course_id,
            courseName: name,
            round_date: Utils.formatDateForStorage(),
            completed: false,
            holes: holes,
            scores: [],
            isNewCourse: true,
            currentHoleIndex: 0,
            holeCount: holeCount,
            courseData: course
        };

        this.state.currentHoleIndex = 0;
        this.state.holeStats = {};
        this.state.courseStats = null;
        this.saveCurrentRoundState();

        // Clear form
        nameInput.value = '';
        holeCountInput.value = '18';

        this.showScreen('scoring');
        this.renderScoringScreen();
    },

    /**
     * Load round data for resuming
     */
    async loadRoundData() {
        if (!this.state.currentRound) return;

        const courseId = this.state.currentRound.course_id;

        // Load statistics if not a new course
        if (!this.state.currentRound.isNewCourse) {
            let rounds = await Storage.getByIndex('rounds', 'course_id', courseId);
            let scores = [];

            if (rounds.length > 0) {
                const roundIds = rounds.filter(r => r.completed).map(r => r.round_id);
                scores = await Storage.getAll('scores');
                scores = scores.filter(s => roundIds.includes(s.round_id));
            }

            this.state.holeStats = Statistics.calculateCourseHoleStats(
                this.state.currentRound.holes, scores
            );
            this.state.courseStats = Statistics.calculateCourseStats(
                courseId, rounds, scores, this.state.currentRound.holes
            );
        }
    },

    /**
     * Render the scoring screen
     */
    renderScoringScreen() {
        const round = this.state.currentRound;
        const holeIndex = this.state.currentHoleIndex;
        const hole = round.holes[holeIndex];
        const isNewCourse = round.isNewCourse;

        // Update hole navigation
        document.getElementById('current-hole-label').textContent = `Hole ${holeIndex + 1}`;
        document.getElementById('hole-count-label').textContent = `of ${round.holeCount}`;

        // Navigation buttons
        const prevBtn = document.getElementById('prev-hole-btn');
        const nextBtn = document.getElementById('next-hole-btn');
        prevBtn.disabled = holeIndex === 0;

        // Update save button text
        const saveBtn = document.getElementById('save-hole-btn');
        if (holeIndex === round.holeCount - 1) {
            saveBtn.innerHTML = `Finish Round <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
        } else {
            saveBtn.innerHTML = `Next Hole <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>`;
        }

        // Hole setup section (for new courses)
        const holeSetup = document.getElementById('hole-setup');
        const holeInfo = document.getElementById('hole-info');
        const statsSection = document.getElementById('stats-section');

        if (isNewCourse) {
            Utils.toggleElement(holeSetup, true);
            Utils.toggleElement(holeInfo, false);
            Utils.toggleElement(statsSection, false);

            document.getElementById('setup-par').value = hole.par || 3;
            document.getElementById('setup-distance').value = hole.distance || '';
        } else {
            Utils.toggleElement(holeSetup, false);
            Utils.toggleElement(holeInfo, true);

            document.getElementById('hole-par-display').textContent = hole.par;
            if (hole.distance) {
                document.getElementById('hole-distance-display').textContent = `${hole.distance} ft`;
                Utils.toggleElement('distance-chip', true);
            } else {
                Utils.toggleElement('distance-chip', false);
            }

            // Show statistics
            const stats = this.state.holeStats[hole.hole_id];
            if (stats && stats.hasData) {
                Utils.toggleElement(statsSection, true);
                document.getElementById('avg-score').textContent = stats.avgScore ? stats.avgScore.toFixed(1) : '--';
                document.getElementById('avg-approaches').textContent =
                    stats.hasEnoughApproachData && stats.avgApproaches
                        ? stats.avgApproaches.toFixed(1)
                        : 'N/A';
                document.getElementById('avg-putts').textContent =
                    stats.hasEnoughPuttData && stats.avgPutts
                        ? stats.avgPutts.toFixed(1)
                        : 'N/A';
            } else {
                Utils.toggleElement(statsSection, true);
                document.getElementById('avg-score').textContent = '--';
                document.getElementById('avg-approaches').textContent = '--';
                document.getElementById('avg-putts').textContent = '--';
            }
        }

        // Load existing score for this hole
        const existingScore = round.scores.find(s => s.hole_number === holeIndex + 1);
        if (existingScore) {
            document.getElementById('score-throws').value = existingScore.throws;
            document.getElementById('score-approaches').value = existingScore.approaches || '';
            document.getElementById('score-putts').value = existingScore.putts || '';
        } else {
            document.getElementById('score-throws').value = hole.par || 3;
            document.getElementById('score-approaches').value = '';
            document.getElementById('score-putts').value = '';
        }

        this.updateScoreRelative();
        this.validateScoreDetails();
    },

    /**
     * Update the score relative to par display
     */
    updateScoreRelative() {
        const throws = parseInt(document.getElementById('score-throws').value, 10) || 0;
        let par;

        if (this.state.currentRound.isNewCourse) {
            par = parseInt(document.getElementById('setup-par').value, 10) || 3;
        } else {
            const hole = this.state.currentRound.holes[this.state.currentHoleIndex];
            par = hole.par || 3;
        }

        const relative = Utils.getRelativeScore(throws, par);
        const scoreClass = Utils.getScoreClass(throws, par);

        const relativeEl = document.getElementById('score-relative');
        relativeEl.textContent = relative;
        relativeEl.className = `score-relative ${scoreClass}`;
    },

    /**
     * Validate all score entry fields
     * @returns {Object} Validation result with isValid and errors array
     */
    validateScoreEntry() {
        const errors = [];
        const throwsInput = document.getElementById('score-throws');
        const approachesInput = document.getElementById('score-approaches');
        const puttsInput = document.getElementById('score-putts');

        const throws = parseInt(throwsInput.value, 10);
        const approachesValue = approachesInput.value.trim();
        const puttsValue = puttsInput.value.trim();

        // Validate throws (required, positive integer, 1-20 range)
        if (isNaN(throws) || throws < 1) {
            errors.push({ field: 'throws', message: 'Throws must be at least 1' });
        } else if (throws > 20) {
            errors.push({ field: 'throws', message: 'Throws cannot exceed 20' });
        } else if (!Number.isInteger(throws)) {
            errors.push({ field: 'throws', message: 'Throws must be a whole number' });
        }

        // Validate approaches (optional, non-negative integer if provided)
        if (approachesValue !== '') {
            const approaches = parseInt(approachesValue, 10);
            if (isNaN(approaches) || approaches < 0) {
                errors.push({ field: 'approaches', message: 'Approaches must be 0 or more' });
            } else if (approaches > 19) {
                errors.push({ field: 'approaches', message: 'Approaches cannot exceed 19' });
            } else if (!Number.isInteger(approaches)) {
                errors.push({ field: 'approaches', message: 'Approaches must be a whole number' });
            }
        }

        // Validate putts (optional, non-negative integer if provided)
        if (puttsValue !== '') {
            const putts = parseInt(puttsValue, 10);
            if (isNaN(putts) || putts < 0) {
                errors.push({ field: 'putts', message: 'Putts must be 0 or more' });
            } else if (putts > 19) {
                errors.push({ field: 'putts', message: 'Putts cannot exceed 19' });
            } else if (!Number.isInteger(putts)) {
                errors.push({ field: 'putts', message: 'Putts must be a whole number' });
            }
        }

        // Validate logical consistency: approaches + putts <= throws - 1
        if (errors.length === 0 && approachesValue !== '' && puttsValue !== '') {
            const approaches = parseInt(approachesValue, 10);
            const putts = parseInt(puttsValue, 10);
            if (approaches + putts > throws - 1) {
                errors.push({
                    field: 'consistency',
                    message: 'Approaches + Putts cannot exceed throws - 1 (need at least 1 drive)'
                });
            }
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    },

    /**
     * Show validation errors on the UI
     * @param {Array} errors - Array of error objects with field and message
     */
    showValidationErrors(errors) {
        // Clear previous error states
        const inputs = ['score-throws', 'score-approaches', 'score-putts'];
        inputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.classList.remove('error');
            }
        });

        // Show error messages
        const errorMessages = errors.map(e => e.message);
        Utils.showToast(errorMessages.join('. '), 'error', 4000);

        // Highlight error fields
        errors.forEach(error => {
            if (error.field === 'throws') {
                document.getElementById('score-throws').classList.add('error');
            } else if (error.field === 'approaches') {
                document.getElementById('score-approaches').classList.add('error');
            } else if (error.field === 'putts') {
                document.getElementById('score-putts').classList.add('error');
            } else if (error.field === 'consistency') {
                document.getElementById('score-approaches').classList.add('error');
                document.getElementById('score-putts').classList.add('error');
            }
        });
    },

    /**
     * Clear validation error states from inputs
     */
    clearValidationErrors() {
        const inputs = ['score-throws', 'score-approaches', 'score-putts'];
        inputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.classList.remove('error');
            }
        });
    },

    /**
     * Validate score details (approaches + putts)
     * The sum of approaches + putts should be at most (throws - 1) because you need at least 1 drive
     */
    validateScoreDetails() {
        const throws = parseInt(document.getElementById('score-throws').value, 10) || 0;
        const approaches = parseInt(document.getElementById('score-approaches').value, 10) || 0;
        const putts = parseInt(document.getElementById('score-putts').value, 10) || 0;

        const warning = document.getElementById('validation-warning');
        const message = document.getElementById('validation-message');

        // Check if approaches + putts > throws - 1 (because you need at least 1 drive)
        if (approaches + putts > 0 && approaches + putts > throws - 1) {
            Utils.toggleElement(warning, true);
            message.textContent = 'Approaches + Putts exceed throws (need at least 1 drive)';
        } else {
            Utils.toggleElement(warning, false);
        }
    },

    /**
     * Navigate to previous or next hole
     */
    navigateHole(direction) {
        // Validate before navigating forward (allow going back without validation)
        if (direction > 0) {
            const validation = this.validateScoreEntry();
            if (!validation.isValid) {
                this.showValidationErrors(validation.errors);
                return;
            }
            this.clearValidationErrors();
        }

        // Save current hole first
        this.saveCurrentHoleScore();

        const newIndex = this.state.currentHoleIndex + direction;
        if (newIndex >= 0 && newIndex < this.state.currentRound.holeCount) {
            this.state.currentHoleIndex = newIndex;
            this.state.currentRound.currentHoleIndex = newIndex;
            this.saveCurrentRoundState();
            this.renderScoringScreen();
        }
    },

    /**
     * Save current hole score to round state
     */
    saveCurrentHoleScore() {
        const round = this.state.currentRound;
        const holeIndex = this.state.currentHoleIndex;
        const hole = round.holes[holeIndex];

        // Get values
        const throws = parseInt(document.getElementById('score-throws').value, 10) || 0;
        const approaches = document.getElementById('score-approaches').value;
        const putts = document.getElementById('score-putts').value;

        // Update hole info if new course
        if (round.isNewCourse) {
            hole.par = parseInt(document.getElementById('setup-par').value, 10) || 3;
            const distance = document.getElementById('setup-distance').value;
            hole.distance = distance ? parseInt(distance, 10) : null;
        }

        // Create or update score
        const scoreData = {
            score_id: Utils.generateId(),
            round_id: round.round_id,
            hole_id: hole.hole_id,
            hole_number: holeIndex + 1,
            throws: throws,
            approaches: approaches ? parseInt(approaches, 10) : null,
            putts: putts ? parseInt(putts, 10) : null,
            created_at: Utils.formatDateForStorage()
        };

        // Update or add to scores array
        const existingIndex = round.scores.findIndex(s => s.hole_number === holeIndex + 1);
        if (existingIndex >= 0) {
            scoreData.score_id = round.scores[existingIndex].score_id;
            round.scores[existingIndex] = scoreData;
        } else {
            round.scores.push(scoreData);
        }
    },

    /**
     * Handle save hole button click
     */
    handleSaveHole() {
        // Validate score entry before saving
        const validation = this.validateScoreEntry();
        if (!validation.isValid) {
            this.showValidationErrors(validation.errors);
            return;
        }

        // Clear any previous validation errors
        this.clearValidationErrors();

        this.saveCurrentHoleScore();

        const round = this.state.currentRound;
        const holeIndex = this.state.currentHoleIndex;

        if (holeIndex === round.holeCount - 1) {
            // Last hole - finish round
            this.finishRound();
        } else {
            // Go to next hole
            this.state.currentHoleIndex++;
            this.state.currentRound.currentHoleIndex = this.state.currentHoleIndex;
            this.saveCurrentRoundState();
            this.renderScoringScreen();
        }
    },

    /**
     * Finish the round and show summary
     */
    finishRound() {
        const round = this.state.currentRound;

        // Calculate totals
        const totals = Statistics.calculateRunningTotal(round.scores, round.holes);
        round.total_score = totals.totalScore;
        round.total_par = totals.totalPar;
        round.completed = true;

        this.saveCurrentRoundState();
        this.showScreen('summary');
        this.renderSummary();
    },

    /**
     * Render the round summary
     */
    renderSummary() {
        const round = this.state.currentRound;
        const totals = Statistics.calculateRunningTotal(round.scores, round.holes);

        // Basic info
        document.getElementById('summary-course').textContent = round.courseName;
        document.getElementById('summary-date').textContent = Utils.formatDateTime(round.round_date);
        document.getElementById('summary-total-score').textContent = totals.totalScore;
        document.getElementById('summary-holes').textContent = round.scores.length;
        document.getElementById('summary-par').textContent = totals.totalPar;

        // Relative score
        const relativeEl = document.getElementById('summary-relative-score');
        const relativeScore = Utils.getRelativeScore(totals.totalScore, totals.totalPar);
        relativeEl.textContent = relativeScore;
        relativeEl.className = `relative-score ${Utils.getTotalScoreClass(totals.totalScore, totals.totalPar)}`;

        // Comparison to average (if not new course)
        const comparisonSection = document.getElementById('summary-comparison');
        if (this.state.courseStats && this.state.courseStats.hasData) {
            const comparison = Statistics.compareToAverage(totals.totalScore, this.state.courseStats);
            Utils.toggleElement(comparisonSection, true);

            const resultEl = document.getElementById('comparison-result');
            resultEl.textContent = comparison.message;
            resultEl.className = `comparison-result ${comparison.isBetter ? 'better' : comparison.isBetter === false ? 'worse' : ''}`;
        } else {
            Utils.toggleElement(comparisonSection, false);
        }

        // Highlights
        const highlightsSection = document.getElementById('summary-highlights');
        if (Object.keys(this.state.holeStats).length > 0) {
            const highlights = Statistics.getHighlightHoles(round.scores, round.holes, this.state.holeStats);

            if (highlights.best.length > 0 || highlights.worst.length > 0) {
                Utils.toggleElement(highlightsSection, true);

                const bestList = document.getElementById('best-holes');
                const worstList = document.getElementById('worst-holes');

                bestList.innerHTML = highlights.best.length > 0
                    ? highlights.best.map(h => `<div class="highlight-item">${Statistics.formatHoleHighlight(h)}</div>`).join('')
                    : '<div class="highlight-item">--</div>';

                worstList.innerHTML = highlights.worst.length > 0
                    ? highlights.worst.map(h => `<div class="highlight-item">${Statistics.formatHoleHighlight(h)}</div>`).join('')
                    : '<div class="highlight-item">--</div>';
            } else {
                Utils.toggleElement(highlightsSection, false);
            }
        } else {
            Utils.toggleElement(highlightsSection, false);
        }
    },

    /**
     * Show the scorecard modal
     */
    showScorecard() {
        const modal = document.getElementById('scorecard-modal');
        const tbody = document.getElementById('scorecard-body');
        const tfoot = document.getElementById('scorecard-footer');

        const round = this.state.currentRound;

        // Build table body
        tbody.innerHTML = round.holes.map((hole, index) => {
            const score = round.scores.find(s => s.hole_number === index + 1);
            const throws = score ? score.throws : '-';
            const par = hole.par || 3;
            const relative = score ? Utils.getRelativeScore(score.throws, par) : '-';
            const approaches = score && score.approaches !== null ? score.approaches : '-';
            const putts = score && score.putts !== null ? score.putts : '-';

            return `
                <tr>
                    <td>${index + 1}</td>
                    <td>${par}</td>
                    <td>${throws}</td>
                    <td class="${score ? Utils.getScoreClass(score.throws, par) : ''}">${relative}</td>
                    <td>${approaches}</td>
                    <td>${putts}</td>
                </tr>
            `;
        }).join('');

        // Build totals
        const totals = Statistics.calculateRunningTotal(round.scores, round.holes);
        tfoot.innerHTML = `
            <tr>
                <td>Total</td>
                <td>${totals.totalPar}</td>
                <td>${totals.totalScore}</td>
                <td class="${Utils.getTotalScoreClass(totals.totalScore, totals.totalPar)}">${Utils.getRelativeScore(totals.totalScore, totals.totalPar)}</td>
                <td>${totals.totalApproaches || '-'}</td>
                <td>${totals.totalPutts || '-'}</td>
            </tr>
        `;

        modal.classList.remove('hidden');
    },

    /**
     * Hide the scorecard modal
     */
    hideScorecard() {
        document.getElementById('scorecard-modal').classList.add('hidden');
    },

    /**
     * Handle finish round button click
     */
    async handleFinishRound() {
        Utils.showLoading('Saving round...');

        try {
            const round = this.state.currentRound;

            // Save course if new
            if (round.isNewCourse && round.courseData) {
                round.courseData.last_played = Utils.formatDateForStorage();
                await Storage.put('courses', round.courseData);
                await Storage.putMany('holes', round.holes);

                if (this.state.isOnline && SheetsAPI.isConfigured()) {
                    await SheetsAPI.saveCourse(round.courseData);
                    await SheetsAPI.saveHoles(round.holes);
                } else {
                    await Storage.addPendingSync({ type: 'saveCourse', data: round.courseData });
                    await Storage.addPendingSync({ type: 'saveHoles', data: round.holes });
                }
            }

            // Save round
            const roundData = {
                round_id: round.round_id,
                course_id: round.course_id,
                round_date: round.round_date,
                completed: true,
                total_score: round.total_score,
                total_par: round.total_par
            };

            await Storage.put('rounds', roundData);
            await Storage.putMany('scores', round.scores);

            if (this.state.isOnline && SheetsAPI.isConfigured()) {
                await SheetsAPI.saveRound(roundData);
                await SheetsAPI.saveScores(round.scores);
                await SheetsAPI.updateCourseLastPlayed(round.course_id, round.round_date);
            } else {
                await Storage.addPendingSync({ type: 'saveRound', data: roundData });
                await Storage.addPendingSync({ type: 'saveScores', data: round.scores });
                await Storage.addPendingSync({
                    type: 'updateCourseLastPlayed',
                    data: { courseId: round.course_id, date: round.round_date }
                });
            }

            // Clear current round
            Storage.clearCurrentRound();
            this.state.currentRound = null;
            this.state.currentHoleIndex = 0;

            // Reload courses
            await this.loadCachedData();

            Utils.hideLoading();
            Utils.showToast('Round saved successfully!', 'success');
            Utils.toggleElement('resume-round-btn', false);
            this.showScreen('home');
        } catch (error) {
            console.error('Error saving round:', error);
            Utils.hideLoading();
            Utils.showToast('Error saving round. Data saved locally.', 'warning');
            this.showScreen('home');
        }
    },

    /**
     * Save current round state to local storage
     */
    saveCurrentRoundState() {
        if (this.state.currentRound) {
            Storage.saveCurrentRound(this.state.currentRound);
        }
    },

    /**
     * Process pending sync operations
     */
    async processPendingSync() {
        if (!this.state.isOnline || !SheetsAPI.isConfigured()) return;

        const pending = Storage.getPendingSync();
        if (pending.length === 0) return;

        const syncStatus = document.getElementById('sync-status');
        syncStatus.classList.remove('hidden');
        syncStatus.classList.add('syncing');

        try {
            const success = await SheetsAPI.processPendingSync();
            syncStatus.classList.remove('syncing');

            if (success) {
                syncStatus.classList.add('success');
                Utils.showToast('Data synced successfully', 'success');
            } else {
                syncStatus.classList.add('error');
            }

            setTimeout(() => {
                syncStatus.classList.add('hidden');
                syncStatus.classList.remove('success', 'error');
            }, 3000);
        } catch (error) {
            console.error('Sync error:', error);
            syncStatus.classList.remove('syncing');
            syncStatus.classList.add('error');
        }
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// Make App globally available for debugging
window.App = App;
