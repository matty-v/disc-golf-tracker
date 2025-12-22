/**
 * Disc Golf Tracker - Local Storage Module
 *
 * Handles all local storage operations for offline support and caching.
 * Uses localStorage for simple key-value pairs and IndexedDB for structured data.
 */

const Storage = {
    // IndexedDB database name and version
    dbName: 'DiscGolfTrackerDB',
    dbVersion: 1,
    db: null,

    /**
     * Initialize the storage system
     * @returns {Promise} Resolves when storage is ready
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                console.error('IndexedDB error:', request.error);
                // Fall back to localStorage only
                this.db = null;
                resolve();
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('IndexedDB initialized');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create object stores
                if (!db.objectStoreNames.contains('courses')) {
                    const coursesStore = db.createObjectStore('courses', { keyPath: 'course_id' });
                    coursesStore.createIndex('course_name', 'course_name', { unique: false });
                }

                if (!db.objectStoreNames.contains('holes')) {
                    const holesStore = db.createObjectStore('holes', { keyPath: 'hole_id' });
                    holesStore.createIndex('course_id', 'course_id', { unique: false });
                }

                if (!db.objectStoreNames.contains('rounds')) {
                    const roundsStore = db.createObjectStore('rounds', { keyPath: 'round_id' });
                    roundsStore.createIndex('course_id', 'course_id', { unique: false });
                    roundsStore.createIndex('completed', 'completed', { unique: false });
                }

                if (!db.objectStoreNames.contains('scores')) {
                    const scoresStore = db.createObjectStore('scores', { keyPath: 'score_id' });
                    scoresStore.createIndex('round_id', 'round_id', { unique: false });
                    scoresStore.createIndex('hole_id', 'hole_id', { unique: false });
                }

                if (!db.objectStoreNames.contains('pendingSync')) {
                    db.createObjectStore('pendingSync', { keyPath: 'id', autoIncrement: true });
                }
            };
        });
    },

    // ===================
    // LocalStorage Methods
    // ===================

    /**
     * Get a value from localStorage
     * @param {string} key - The storage key
     * @returns {*} The parsed value or null
     */
    get(key) {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            console.error('Storage get error:', error);
            return null;
        }
    },

    /**
     * Set a value in localStorage
     * @param {string} key - The storage key
     * @param {*} value - The value to store
     */
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            console.error('Storage set error:', error);
        }
    },

    /**
     * Remove a value from localStorage
     * @param {string} key - The storage key
     */
    remove(key) {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.error('Storage remove error:', error);
        }
    },

    // ===================
    // IndexedDB Methods
    // ===================

    /**
     * Get all items from an IndexedDB store
     * @param {string} storeName - The store name
     * @returns {Promise<Array>} Array of items
     */
    async getAll(storeName) {
        if (!this.db) {
            // Fallback to localStorage
            return this.get(CONFIG.storageKeys[storeName]) || [];
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => {
                console.error('getAll error:', request.error);
                resolve([]);
            };
        });
    },

    /**
     * Get an item by ID from IndexedDB
     * @param {string} storeName - The store name
     * @param {string} id - The item ID
     * @returns {Promise<Object|null>} The item or null
     */
    async getById(storeName, id) {
        if (!this.db) {
            const items = this.get(CONFIG.storageKeys[storeName]) || [];
            return items.find(item => item[`${storeName.slice(0, -1)}_id`] === id) || null;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => {
                console.error('getById error:', request.error);
                resolve(null);
            };
        });
    },

    /**
     * Get items by index value
     * @param {string} storeName - The store name
     * @param {string} indexName - The index name
     * @param {*} value - The value to match
     * @returns {Promise<Array>} Matching items
     */
    async getByIndex(storeName, indexName, value) {
        if (!this.db) {
            const items = this.get(CONFIG.storageKeys[storeName]) || [];
            return items.filter(item => item[indexName] === value);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => {
                console.error('getByIndex error:', request.error);
                resolve([]);
            };
        });
    },

    /**
     * Add or update an item in IndexedDB
     * @param {string} storeName - The store name
     * @param {Object} item - The item to save
     * @returns {Promise<boolean>} Success status
     */
    async put(storeName, item) {
        if (!this.db) {
            // Fallback to localStorage
            const items = this.get(CONFIG.storageKeys[storeName]) || [];
            const keyField = `${storeName.slice(0, -1)}_id`;
            const index = items.findIndex(i => i[keyField] === item[keyField]);
            if (index >= 0) {
                items[index] = item;
            } else {
                items.push(item);
            }
            this.set(CONFIG.storageKeys[storeName], items);
            return true;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(item);

            request.onsuccess = () => resolve(true);
            request.onerror = () => {
                console.error('put error:', request.error);
                resolve(false);
            };
        });
    },

    /**
     * Add multiple items to IndexedDB
     * @param {string} storeName - The store name
     * @param {Array} items - The items to save
     * @returns {Promise<boolean>} Success status
     */
    async putMany(storeName, items) {
        if (!this.db) {
            // Fallback to localStorage - replace all
            this.set(CONFIG.storageKeys[storeName], items);
            return true;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);

            items.forEach(item => store.put(item));

            transaction.oncomplete = () => resolve(true);
            transaction.onerror = () => {
                console.error('putMany error:', transaction.error);
                resolve(false);
            };
        });
    },

    /**
     * Delete an item from IndexedDB
     * @param {string} storeName - The store name
     * @param {string} id - The item ID
     * @returns {Promise<boolean>} Success status
     */
    async delete(storeName, id) {
        if (!this.db) {
            const items = this.get(CONFIG.storageKeys[storeName]) || [];
            const keyField = `${storeName.slice(0, -1)}_id`;
            const filtered = items.filter(i => i[keyField] !== id);
            this.set(CONFIG.storageKeys[storeName], filtered);
            return true;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);

            request.onsuccess = () => resolve(true);
            request.onerror = () => {
                console.error('delete error:', request.error);
                resolve(false);
            };
        });
    },

    /**
     * Clear all items from an IndexedDB store
     * @param {string} storeName - The store name
     * @returns {Promise<boolean>} Success status
     */
    async clear(storeName) {
        if (!this.db) {
            this.set(CONFIG.storageKeys[storeName], []);
            return true;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve(true);
            request.onerror = () => {
                console.error('clear error:', request.error);
                resolve(false);
            };
        });
    },

    // ===================
    // Pending Sync Queue
    // ===================

    /**
     * Add an operation to the pending sync queue
     * @param {Object} operation - The operation to queue
     * @returns {Promise<boolean>} Success status
     */
    async addPendingSync(operation) {
        const pending = this.get(CONFIG.storageKeys.pendingSync) || [];
        pending.push({
            ...operation,
            timestamp: new Date().toISOString()
        });
        this.set(CONFIG.storageKeys.pendingSync, pending);
        return true;
    },

    /**
     * Get all pending sync operations
     * @returns {Array} Pending operations
     */
    getPendingSync() {
        return this.get(CONFIG.storageKeys.pendingSync) || [];
    },

    /**
     * Remove a pending sync operation
     * @param {number} index - The index to remove
     */
    removePendingSync(index) {
        const pending = this.get(CONFIG.storageKeys.pendingSync) || [];
        pending.splice(index, 1);
        this.set(CONFIG.storageKeys.pendingSync, pending);
    },

    /**
     * Clear all pending sync operations
     */
    clearPendingSync() {
        this.set(CONFIG.storageKeys.pendingSync, []);
    },

    // ===================
    // Current Round
    // ===================

    /**
     * Save current round state
     * @param {Object} roundState - The round state to save
     */
    saveCurrentRound(roundState) {
        this.set(CONFIG.storageKeys.currentRound, roundState);
    },

    /**
     * Get current round state
     * @returns {Object|null} The current round state
     */
    getCurrentRound() {
        return this.get(CONFIG.storageKeys.currentRound);
    },

    /**
     * Clear current round state
     */
    clearCurrentRound() {
        this.remove(CONFIG.storageKeys.currentRound);
    },

    // ===================
    // Spreadsheet ID
    // ===================

    /**
     * Save the Google Sheets spreadsheet ID
     * @param {string} id - The spreadsheet ID
     */
    setSpreadsheetId(id) {
        this.set(CONFIG.storageKeys.spreadsheetId, id);
    },

    /**
     * Get the Google Sheets spreadsheet ID
     * @returns {string|null} The spreadsheet ID
     */
    getSpreadsheetId() {
        return this.get(CONFIG.storageKeys.spreadsheetId);
    },

    // ===================
    // User Info
    // ===================

    /**
     * Save user info
     * @param {Object} userInfo - The user info to save
     */
    setUserInfo(userInfo) {
        this.set(CONFIG.storageKeys.userInfo, userInfo);
    },

    /**
     * Get user info
     * @returns {Object|null} The user info
     */
    getUserInfo() {
        return this.get(CONFIG.storageKeys.userInfo);
    },

    /**
     * Clear user info
     */
    clearUserInfo() {
        this.remove(CONFIG.storageKeys.userInfo);
    },

    // ===================
    // Last Sync
    // ===================

    /**
     * Update last sync timestamp
     */
    updateLastSync() {
        this.set(CONFIG.storageKeys.lastSync, new Date().toISOString());
    },

    /**
     * Get last sync timestamp
     * @returns {string|null} The last sync timestamp
     */
    getLastSync() {
        return this.get(CONFIG.storageKeys.lastSync);
    }
};

// Make Storage globally available
window.Storage = Storage;
