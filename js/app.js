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
        document.getElementById('header-title').addEventListener('click', () => this.showScreen('home'));

        // Setup wizard
        document.getElementById('setup-connect-btn').addEventListener('click', () => this.handleSetupConnect());

        // Home screen buttons
        document.getElementById('resume-round-btn').addEventListener('click', () => this.handleResumeRound());
        document.getElementById('settings-btn').addEventListener('click', () => this.showScreen('settings'));
        document.getElementById('create-course-btn').addEventListener('click', () => this.handleNewCourse());

        // Settings screen
        document.getElementById('change-sheet-btn').addEventListener('click', () => this.handleStartEditSettings());
        document.getElementById('settings-cancel-btn').addEventListener('click', () => this.handleCancelEditSettings());
        document.getElementById('settings-save-btn').addEventListener('click', () => this.handleSaveSettings());

        // New course form
        document.getElementById('new-course-form').addEventListener('submit', (e) => this.handleNewCourseSubmit(e));
        document.getElementById('course-name').addEventListener('input', () => this.clearNewCourseFieldError('course-name'));
        document.getElementById('hole-count').addEventListener('input', () => this.clearNewCourseFieldError('hole-count'));

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

        // Dialog dismissal (Escape + backdrop click), in addition to each
        // modal's own explicit close control (finding 18).
        this.setupModalDismissal('scorecard-modal', () => this.hideScorecard());
        this.setupModalDismissal('incomplete-round-modal', () => this.dismissIncompleteRoundModal());

        // Stepper buttons
        document.querySelectorAll('.btn-stepper').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleStepper(e));
        });

        // Inline editing for par and distance on existing courses
        document.getElementById('hole-par-text').addEventListener('click', () => this.startEditPar());
        document.getElementById('edit-par-save').addEventListener('click', () => this.saveEditPar());
        document.getElementById('hole-distance-display').addEventListener('click', () => this.startEditDistance());
        document.getElementById('edit-distance-save').addEventListener('click', () => this.saveEditDistance());

        // Inline editing for description on existing courses
        document.getElementById('hole-description-display').addEventListener('click', () => this.startEditDescription());
        document.getElementById('edit-description-save').addEventListener('click', () => this.saveEditDescription());
        document.getElementById('add-description-btn').addEventListener('click', () => this.startEditDescription());

        // Allow Enter key to confirm inline edits
        document.getElementById('edit-par').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.saveEditPar();
        });
        document.getElementById('edit-distance').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.saveEditDistance();
        });
        document.getElementById('edit-description').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.saveEditDescription();
        });

        // Validation on input
        document.getElementById('score-approaches').addEventListener('input', () => this.validateScoreDetails());
        document.getElementById('score-putts').addEventListener('input', () => this.validateScoreDetails());
    },

    /**
     * Wire Escape and backdrop-click dismissal for a modal dialog.
     * @param {string} modalId - The modal element's ID
     * @param {Function} onDismiss - Called to close the modal
     */
    setupModalDismissal(modalId, onDismiss) {
        const modal = document.getElementById(modalId);
        if (!modal) return;

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                onDismiss();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
                onDismiss();
            }
        });
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
     * Check for incomplete or completed-but-unsynced round
     */
    checkIncompleteRound() {
        const savedRound = Storage.getCurrentRound();
        if (savedRound) {
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

        // Show/hide settings button (hide on setup screen)
        const settingsBtn = document.getElementById('settings-btn');
        if (settingsBtn) {
            Utils.toggleElement(settingsBtn, screenName !== 'setup');
        }

        // Update header
        switch (screenName) {
            case 'setup':
                Utils.setHeaderTitle('Disc Golf Tracker');
                Utils.showBackButton(false);
                break;
            case 'home':
                Utils.setHeaderTitle('Disc Golf Tracker');
                Utils.showBackButton(false);
                this.renderCourseList();
                break;
            case 'settings':
                Utils.setHeaderTitle('Settings');
                Utils.showBackButton(true);
                this.updateSettingsUI();
                break;
            case 'course-stats':
                Utils.setHeaderTitle(this.state.statsCourseName || 'Course Stats');
                Utils.showBackButton(true);
                break;
            case 'new-course':
                Utils.setHeaderTitle('New Course');
                Utils.showBackButton(true);
                // A validation error from a previous visit must not persist
                // once the user returns to the form (finding 18).
                this.clearNewCourseFieldError('course-name');
                this.clearNewCourseFieldError('hole-count');
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
            case 'new-course':
            case 'settings':
            case 'course-stats':
                this.showScreen('home');
                break;
            case 'scoring':
                if (confirm('Leave round? Your progress will be saved.')) {
                    this.saveCurrentRoundState();
                    // The round is saved but checkIncompleteRound() only runs
                    // at init — without this, the home screen offered no way
                    // back in until the app reloaded (finding 7).
                    Utils.toggleElement('resume-round-btn', true);
                    this.showScreen('home');
                }
                break;
            default:
                this.showScreen('home');
        }
    },

    /**
     * Handle create new course button click
     */
    handleNewCourse() {
        // Check for incomplete round
        const savedRound = Storage.getCurrentRound();
        if (savedRound && !savedRound.completed) {
            this.showIncompleteRoundModal();
            return;
        }

        this.showScreen('new-course');
    },

    /**
     * Handle selecting a course from the home screen
     */
    handleSelectCourseFromHome(course) {
        // Check for incomplete round
        const savedRound = Storage.getCurrentRound();
        if (savedRound && !savedRound.completed) {
            this.showIncompleteRoundModal();
            return;
        }

        this.selectCourse(course);
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

            if (savedRound.completed) {
                // Finished but not yet saved/synced — go straight back to the
                // summary screen so the user can re-attempt Save & Finish.
                this.showScreen('summary');
                this.renderSummary();
            } else {
                this.loadRoundData();
                this.showScreen('scoring');
                this.renderScoringScreen();
            }
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
        document.getElementById('continue-round-btn').focus();
    },

    /**
     * Dismiss the incomplete-round modal without choosing continue/abandon
     * (Escape or backdrop click) — leaves the pending round exactly as-is.
     */
    dismissIncompleteRoundModal() {
        document.getElementById('incomplete-round-modal').classList.add('hidden');
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
        this.showScreen('home');
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

            // course.course_name can arrive from syncFromSheets() — a
            // hand-editable Sheet is untrusted input, unlike an in-app-created
            // name (which CONFIG.validation.courseName.pattern constrains).
            // Built with createElement/textContent, not innerHTML, so it is
            // never interpreted as markup (finding 12).
            const body = document.createElement('div');
            body.className = 'course-card-body';

            const info = document.createElement('div');
            info.className = 'course-card-info';

            const nameEl = document.createElement('div');
            nameEl.className = 'course-card-name';
            nameEl.textContent = course.course_name;
            info.appendChild(nameEl);

            const details = document.createElement('div');
            details.className = 'course-card-details';

            const holesSpan = document.createElement('span');
            holesSpan.textContent = `${course.hole_count} holes`;
            details.appendChild(holesSpan);

            if (course.last_played) {
                const lastPlayedSpan = document.createElement('span');
                lastPlayedSpan.textContent = `Last played: ${Utils.formatDate(course.last_played)}`;
                details.appendChild(lastPlayedSpan);
            }
            info.appendChild(details);
            body.appendChild(info);

            const statsBtn = document.createElement('button');
            statsBtn.className = 'btn-icon course-card-stats-btn';
            // setAttribute does not parse markup, so this is safe even
            // though course_name is untrusted.
            statsBtn.setAttribute('aria-label', `View stats for ${course.course_name}`);
            statsBtn.title = 'Course Stats';
            statsBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                    <path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
                </svg>
            `;
            body.appendChild(statsBtn);
            card.appendChild(body);

            // Stats button click (stop propagation so it doesn't start a round)
            statsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showCourseStats(course);
            });

            card.addEventListener('click', () => this.handleSelectCourseFromHome(course));
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.handleSelectCourseFromHome(course);
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
     * Clear a new-course form field's error message and .error state
     * @param {string} fieldId - 'course-name' or 'hole-count'
     */
    clearNewCourseFieldError(fieldId) {
        document.getElementById(`${fieldId}-error`).textContent = '';
        document.getElementById(fieldId).classList.remove('error');
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

        // Clear any error left over from a previous failed submit before
        // re-validating (finding 18).
        this.clearNewCourseFieldError('course-name');
        this.clearNewCourseFieldError('hole-count');

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
                distance: null,
                description: ''
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
            Utils.toggleElement('hole-par-display', false);
            Utils.toggleElement('hole-par-editor', false);
            Utils.toggleElement('hole-description', false);
            Utils.toggleElement('hole-description-add', false);

            document.getElementById('setup-par').value = hole.par || 3;
            document.getElementById('setup-distance').value = hole.distance || '';
            document.getElementById('setup-description').value = hole.description || '';
        } else {
            Utils.toggleElement(holeSetup, false);
            Utils.toggleElement('hole-par-display', true);

            // Reset inline editors to display mode
            Utils.toggleElement('hole-par-editor', false);
            Utils.toggleElement('hole-par-text', true);
            Utils.toggleElement('hole-distance-editor', false);
            Utils.toggleElement('hole-distance-text', true);

            document.getElementById('hole-par-text').textContent = `Par ${hole.par}`;
            if (hole.distance) {
                document.getElementById('hole-distance-text').textContent = `${hole.distance} ft`;
                Utils.toggleElement(holeInfo, true);
            } else {
                Utils.toggleElement(holeInfo, false);
            }

            // Show hole description or add button
            Utils.toggleElement('hole-description-editor', false);
            if (hole.description) {
                document.getElementById('hole-description-text').textContent = hole.description;
                Utils.toggleElement('hole-description-display', true);
                Utils.toggleElement('hole-description', true);
                Utils.toggleElement('hole-description-add', false);
            } else {
                Utils.toggleElement('hole-description', false);
                Utils.toggleElement('hole-description-add', true);
            }

            // Show statistics
            Utils.toggleElement(statsSection, true);
            const stats = this.state.holeStats[hole.hole_id];
            if (stats && stats.hasData) {
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
     * Validate score entry values — the pure rule core, no DOM reads.
     * Extracted so tests exercise the real rules instead of a hand-copy
     * (finding 19); validateScoreEntry() below is now just the DOM adapter.
     * @param {{throws: *, approaches: *, putts: *}} values - Raw input
     *   values (string or number); approaches/putts may be '' for "not
     *   provided".
     * @returns {Object} Validation result with isValid and errors array
     */
    validateScoreValues({ throws: throwsRaw, approaches: approachesRaw, putts: puttsRaw }) {
        const errors = [];

        const throws = parseInt(throwsRaw, 10);
        const approachesValue = String(approachesRaw ?? '').trim();
        const puttsValue = String(puttsRaw ?? '').trim();

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
     * Validate all score entry fields (DOM adapter over validateScoreValues)
     * @returns {Object} Validation result with isValid and errors array
     */
    validateScoreEntry() {
        return this.validateScoreValues({
            throws: document.getElementById('score-throws').value,
            approaches: document.getElementById('score-approaches').value,
            putts: document.getElementById('score-putts').value
        });
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
            this.saveCurrentHoleScore();
        } else {
            // Going back never validates, but it must also never silently save
            // a cleared/blank throws field as a 0-throw score (finding 8).
            const throwsValue = document.getElementById('score-throws').value.trim();
            if (throwsValue !== '') {
                this.saveCurrentHoleScore();
            }
        }

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
            hole.description = document.getElementById('setup-description').value.trim();
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
    async handleSaveHole() {
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
            await this.finishRound();
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
     *
     * A round becomes durable the moment it is finished, not when it is
     * synced: the round and its scores are written to durable storage here,
     * before the summary is even shown, so closing/reloading the app on the
     * summary screen never loses the round (finding 1). Save & Finish
     * (handleFinishRound) is then just the sync/close step over already-safe
     * data.
     */
    async finishRound() {
        const round = this.state.currentRound;

        // Calculate totals
        const totals = Statistics.calculateRunningTotal(round.scores, round.holes);
        round.total_score = totals.totalScore;
        round.total_par = totals.totalPar;
        round.completed = true;

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
        document.getElementById('close-scorecard-btn').focus();
    },

    /**
     * Hide the scorecard modal
     */
    hideScorecard() {
        document.getElementById('scorecard-modal').classList.add('hidden');
    },

    /**
     * Handle finish round button click
     *
     * By the time this runs, finishRound() has already made the round durable
     * (finding 1). This is now purely the sync/close step: a failure here —
     * online or offline — always leaves the round queued for retry, never
     * silently local-only (finding 2).
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
                    try {
                        await SheetsAPI.saveCourse(round.courseData);
                        await SheetsAPI.saveHoles(round.holes);
                    } catch (syncError) {
                        console.error('Failed to sync new course, queuing for retry:', syncError);
                        await Storage.addPendingSync({ type: 'saveCourse', data: round.courseData });
                        await Storage.addPendingSync({ type: 'saveHoles', data: round.holes });
                    }
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

            // Update the local course record's last_played immediately — for
            // an existing course this previously only happened on the far
            // side of a full syncFromSheets(), so the home screen kept
            // sorting/showing the old date until a cold-start resync
            // (finding 6). Independent of the Sheets sync outcome below.
            if (!round.isNewCourse) {
                const courses = await Storage.getAll('courses');
                const course = courses.find(c => c.course_id === round.course_id);
                if (course) {
                    course.last_played = round.round_date;
                    await Storage.put('courses', course);
                }
            }

            if (this.state.isOnline && SheetsAPI.isConfigured()) {
                try {
                    await SheetsAPI.saveRound(roundData);
                    await SheetsAPI.saveScores(round.scores);
                    await SheetsAPI.updateCourseLastPlayed(round.course_id, round.round_date);
                } catch (syncError) {
                    console.error('Failed to sync round, queuing for retry:', syncError);
                    await Storage.addPendingSync({ type: 'saveRound', data: roundData });
                    await Storage.addPendingSync({ type: 'saveScores', data: round.scores });
                    await Storage.addPendingSync({
                        type: 'updateCourseLastPlayed',
                        data: { courseId: round.course_id, date: round.round_date }
                    });
                }
            } else {
                await Storage.addPendingSync({ type: 'saveRound', data: roundData });
                await Storage.addPendingSync({ type: 'saveScores', data: round.scores });
                await Storage.addPendingSync({
                    type: 'updateCourseLastPlayed',
                    data: { courseId: round.course_id, date: round.round_date }
                });
            }

            // Clear current round — safe now: it is either synced or durably queued for retry
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
            // Reaching here means the local durable write itself failed — the
            // round stays in currentRound (not cleared) so checkIncompleteRound()
            // offers it again next load, the same recoverable state as a queued
            // sync failure.
            console.error('Error saving round:', error);
            Utils.hideLoading();
            Utils.showToast('Error saving round. Data saved locally — will retry.', 'warning');
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

    // ===================
    // Inline Hole Editing
    // ===================

    /**
     * Start editing par inline
     */
    startEditPar() {
        const round = this.state.currentRound;
        if (!round || round.isNewCourse) return;

        const hole = round.holes[this.state.currentHoleIndex];
        document.getElementById('edit-par').value = hole.par || 3;
        Utils.toggleElement('hole-par-text', false);
        Utils.toggleElement('hole-par-editor', true);
        document.getElementById('edit-par').focus();
    },

    /**
     * Save edited par value
     */
    async saveEditPar() {
        const round = this.state.currentRound;
        if (!round) return;

        const hole = round.holes[this.state.currentHoleIndex];
        const newPar = parseInt(document.getElementById('edit-par').value, 10);

        if (!Utils.isValidNumber(newPar, 2, 6)) {
            Utils.showToast('Par must be between 2 and 6', 'error');
            return;
        }

        hole.par = newPar;

        // Update display
        document.getElementById('hole-par-text').textContent = `Par ${newPar}`;
        Utils.toggleElement('hole-par-text', true);
        Utils.toggleElement('hole-par-editor', false);

        // Update score relative display
        this.updateScoreRelative();

        // Persist the change
        await this.persistHoleEdit(hole);
        this.saveCurrentRoundState();
    },

    /**
     * Start editing distance inline
     */
    startEditDistance() {
        const round = this.state.currentRound;
        if (!round || round.isNewCourse) return;

        const hole = round.holes[this.state.currentHoleIndex];
        document.getElementById('edit-distance').value = hole.distance || '';
        Utils.toggleElement('hole-distance-text', false);
        Utils.toggleElement('hole-distance-editor', true);
        document.getElementById('edit-distance').focus();
    },

    /**
     * Save edited distance value
     */
    async saveEditDistance() {
        const round = this.state.currentRound;
        if (!round) return;

        const hole = round.holes[this.state.currentHoleIndex];
        const distanceInput = document.getElementById('edit-distance').value.trim();
        const newDistance = distanceInput ? parseInt(distanceInput, 10) : null;

        if (newDistance !== null && !Utils.isValidNumber(newDistance, 0, 1500)) {
            Utils.showToast('Distance must be between 0 and 1500', 'error');
            return;
        }

        hole.distance = newDistance;

        // Update display
        if (newDistance) {
            document.getElementById('hole-distance-text').textContent = `${newDistance} ft`;
            Utils.toggleElement('hole-distance-text', true);
            Utils.toggleElement('hole-distance-editor', false);
            Utils.toggleElement('hole-info', true);
        } else {
            Utils.toggleElement('hole-distance-editor', false);
            Utils.toggleElement('hole-info', false);
        }

        // Persist the change
        await this.persistHoleEdit(hole);
        this.saveCurrentRoundState();
    },

    /**
     * Start editing description inline
     */
    startEditDescription() {
        const round = this.state.currentRound;
        if (!round || round.isNewCourse) return;

        const hole = round.holes[this.state.currentHoleIndex];
        document.getElementById('edit-description').value = hole.description || '';
        Utils.toggleElement('hole-description-display', false);
        Utils.toggleElement('hole-description-add', false);
        Utils.toggleElement('hole-description', true);
        Utils.toggleElement('hole-description-editor', true);
        document.getElementById('edit-description').focus();
    },

    /**
     * Save edited description value
     */
    async saveEditDescription() {
        const round = this.state.currentRound;
        if (!round) return;

        const hole = round.holes[this.state.currentHoleIndex];
        const newDescription = document.getElementById('edit-description').value.trim();

        hole.description = newDescription;

        // Update display
        Utils.toggleElement('hole-description-editor', false);
        if (newDescription) {
            document.getElementById('hole-description-text').textContent = newDescription;
            Utils.toggleElement('hole-description-display', true);
            Utils.toggleElement('hole-description', true);
            Utils.toggleElement('hole-description-add', false);
        } else {
            Utils.toggleElement('hole-description', false);
            Utils.toggleElement('hole-description-add', true);
        }

        // Persist the change
        await this.persistHoleEdit(hole);
        this.saveCurrentRoundState();
    },

    /**
     * Persist a hole edit to local storage and sync to sheets
     * @param {Object} hole - The updated hole data
     */
    async persistHoleEdit(hole) {
        // Update in IndexedDB
        await Storage.put('holes', hole);

        // Sync to Google Sheets
        if (this.state.isOnline && SheetsAPI.isConfigured()) {
            try {
                await SheetsAPI.updateHole(hole);
            } catch (error) {
                console.error('Failed to sync hole edit:', error);
                await Storage.addPendingSync({ type: 'updateHole', data: hole });
            }
        } else {
            await Storage.addPendingSync({ type: 'updateHole', data: hole });
        }
    },

    // ===================
    // Course Stats View
    // ===================

    /**
     * Show the course stats screen for a single course
     * @param {Object} course - The course to show stats for
     */
    async showCourseStats(course) {
        Utils.showLoading('Loading stats...');

        try {
            const holes = await Storage.getByIndex('holes', 'course_id', course.course_id);
            holes.sort((a, b) => a.hole_number - b.hole_number);

            const rounds = await Storage.getByIndex('rounds', 'course_id', course.course_id);
            const completedRounds = rounds.filter(r => r.completed);

            let scores = [];
            if (completedRounds.length > 0) {
                const roundIds = completedRounds.map(r => r.round_id);
                const allScores = await Storage.getAll('scores');
                scores = allScores.filter(s => roundIds.includes(s.round_id));
            }

            const stats = Statistics.calculateCourseStats(
                course.course_id, rounds, scores, holes
            );
            const holeStats = Statistics.calculateCourseHoleStats(holes, scores);

            Utils.hideLoading();

            // Store course name for header title
            this.state.statsCourseName = course.course_name;
            this.showScreen('course-stats');

            if (!stats.hasData) {
                Utils.toggleElement('course-stats-content', false);
                Utils.toggleElement('no-stats-message', true);
                return;
            }

            Utils.toggleElement('course-stats-content', true);
            Utils.toggleElement('no-stats-message', false);
            this.renderCourseStats({ course, holes, stats, holeStats });
        } catch (error) {
            console.error('Error loading course stats:', error);
            Utils.hideLoading();
            Utils.showToast('Failed to load stats', 'error');
        }
    },

    /**
     * Render stats for a single course
     * @param {Object} data - {course, holes, stats, holeStats}
     */
    renderCourseStats({ course, holes, stats, holeStats }) {
        const container = document.getElementById('course-stats-content');

        // Format avg vs par
        const avgRelative = stats.avgRelativeToPar;
        const avgRelativeStr = avgRelative > 0 ? `+${avgRelative}` : avgRelative === 0 ? 'E' : `${avgRelative}`;
        const avgRelativeClass = Utils.getTotalScoreClass(stats.avgTotalScore, stats.totalPar);

        // Best round relative to par
        const bestRelative = stats.bestRound.relativeToPar;
        const bestRelativeStr = bestRelative > 0 ? `+${bestRelative}` : bestRelative === 0 ? 'E' : `${bestRelative}`;

        // Build per-hole table rows
        let holeTableRows = '';
        let totalAvgScore = 0;
        let totalAvgApproaches = 0;
        let totalAvgPutts = 0;
        let hasApproachData = false;
        let hasPuttData = false;

        holes.forEach(hole => {
            const hs = holeStats[hole.hole_id];
            const avgScore = hs && hs.hasData && hs.avgScore !== null ? hs.avgScore.toFixed(1) : '--';
            const avgApproaches = hs && hs.hasEnoughApproachData && hs.avgApproaches !== null ? hs.avgApproaches.toFixed(1) : '--';
            const avgPutts = hs && hs.hasEnoughPuttData && hs.avgPutts !== null ? hs.avgPutts.toFixed(1) : '--';

            if (hs && hs.hasData && hs.avgScore !== null) {
                totalAvgScore += hs.avgScore;
            }
            if (hs && hs.hasEnoughApproachData && hs.avgApproaches !== null) {
                totalAvgApproaches += hs.avgApproaches;
                hasApproachData = true;
            }
            if (hs && hs.hasEnoughPuttData && hs.avgPutts !== null) {
                totalAvgPutts += hs.avgPutts;
                hasPuttData = true;
            }

            holeTableRows += `
                <tr>
                    <td>${hole.hole_number}</td>
                    <td>${hole.par}</td>
                    <td>${avgScore}</td>
                    <td>${avgApproaches}</td>
                    <td>${avgPutts}</td>
                </tr>
            `;
        });

        // Totals row
        const totalPar = holes.reduce((sum, h) => sum + (h.par || 3), 0);
        const totalAvgScoreStr = totalAvgScore > 0 ? totalAvgScore.toFixed(1) : '--';
        const totalAvgApproachesStr = hasApproachData ? totalAvgApproaches.toFixed(1) : '--';
        const totalAvgPuttsStr = hasPuttData ? totalAvgPutts.toFixed(1) : '--';

        container.innerHTML = `
            <div class="course-stats-card">
                <div class="course-stats-card-header">
                    <span class="course-stats-card-rounds">${stats.roundCount} round${stats.roundCount !== 1 ? 's' : ''} played</span>
                </div>
                <div class="course-stats-overview">
                    <div class="stat-item">
                        <span class="stat-label">Avg Score</span>
                        <span class="stat-value">${stats.avgTotalScore}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Avg vs Par</span>
                        <span class="stat-value ${avgRelativeClass}">${avgRelativeStr}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Best Round</span>
                        <span class="stat-value">${stats.bestRound.totalScore} (${bestRelativeStr})</span>
                    </div>
                </div>
            </div>
            <table class="course-stats-hole-table">
                <thead>
                    <tr>
                        <th>Hole</th>
                        <th>Par</th>
                        <th>Avg Score</th>
                        <th>Avg App</th>
                        <th>Avg Putts</th>
                    </tr>
                </thead>
                <tbody>
                    ${holeTableRows}
                </tbody>
                <tfoot>
                    <tr>
                        <td>Total</td>
                        <td>${totalPar}</td>
                        <td>${totalAvgScoreStr}</td>
                        <td>${totalAvgApproachesStr}</td>
                        <td>${totalAvgPuttsStr}</td>
                    </tr>
                </tfoot>
            </table>
        `;
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

// Single source for the app logo markup, previously duplicated verbatim in
// two screens (index.html).
const APP_LOGO_SVG = `<svg viewBox="0 0 100 100" width="64" height="64">
    <circle cx="50" cy="50" r="45" fill="#0a0e14"/>
    <ellipse cx="50" cy="32" rx="22" ry="8" fill="none" stroke="#00d4ff" stroke-width="3"/>
    <path d="M28 32 L40 52 M38 32 L45 52 M50 40 L50 52 M62 32 L55 52 M72 32 L60 52" stroke="#00d4ff" stroke-width="2" opacity="0.7"/>
    <ellipse cx="50" cy="52" rx="18" ry="6" fill="none" stroke="#00d4ff" stroke-width="3"/>
    <rect x="47" y="52" width="6" height="25" fill="#00d4ff"/>
    <ellipse cx="50" cy="77" rx="12" ry="4" fill="#00d4ff"/>
</svg>`;

document.querySelectorAll('[data-app-logo]').forEach(el => {
    el.innerHTML = APP_LOGO_SVG;
});
