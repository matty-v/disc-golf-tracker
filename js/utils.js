/**
 * Disc Golf Tracker - Utility Functions
 *
 * Common utility functions used throughout the application.
 */

const Utils = {
    /**
     * Generate a UUID v4
     * @returns {string} A unique identifier
     */
    generateId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    /**
     * Format a date for display
     * @param {Date|string} date - The date to format
     * @returns {string} Formatted date string
     */
    formatDate(date) {
        const d = new Date(date);
        return d.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    },

    /**
     * Format a date for storage (ISO format)
     * @param {Date} date - The date to format
     * @returns {string} ISO date string
     */
    formatDateForStorage(date = new Date()) {
        return date.toISOString();
    },

    /**
     * Format a datetime for display
     * @param {Date|string} date - The date to format
     * @returns {string} Formatted datetime string
     */
    formatDateTime(date) {
        const d = new Date(date);
        return d.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    },

    /**
     * Calculate score relative to par
     * @param {number} score - The score
     * @param {number} par - The par for the hole
     * @returns {string} Formatted relative score (e.g., "-2", "E", "+3")
     */
    getRelativeScore(score, par) {
        const diff = score - par;
        if (diff === 0) return 'E';
        if (diff > 0) return `+${diff}`;
        return `${diff}`;
    },

    /**
     * Get the CSS class for a score relative to par
     * @param {number} score - The score
     * @param {number} par - The par for the hole
     * @returns {string} CSS class name
     */
    getScoreClass(score, par) {
        const diff = score - par;
        if (diff <= -2) return 'eagle';
        if (diff === -1) return 'birdie';
        if (diff === 0) return 'par';
        if (diff === 1) return 'bogey';
        return 'double-bogey';
    },

    /**
     * Get the CSS class for total relative score
     * @param {number} totalScore - Total score
     * @param {number} totalPar - Total par
     * @returns {string} CSS class name
     */
    getTotalScoreClass(totalScore, totalPar) {
        const diff = totalScore - totalPar;
        if (diff < 0) return 'under-par';
        if (diff === 0) return 'even-par';
        return 'over-par';
    },

    /**
     * Round a number to specified decimal places
     * @param {number} num - The number to round
     * @param {number} decimals - Number of decimal places
     * @returns {number} Rounded number
     */
    roundTo(num, decimals = 1) {
        const factor = Math.pow(10, decimals);
        return Math.round(num * factor) / factor;
    },

    /**
     * Calculate average of an array of numbers
     * @param {number[]} numbers - Array of numbers
     * @returns {number|null} Average or null if empty
     */
    average(numbers) {
        if (!numbers || numbers.length === 0) return null;
        const validNumbers = numbers.filter(n => n !== null && n !== undefined && !isNaN(n));
        if (validNumbers.length === 0) return null;
        const sum = validNumbers.reduce((a, b) => a + b, 0);
        return sum / validNumbers.length;
    },

    /**
     * Validate a number within a range
     * @param {number} value - The value to validate
     * @param {number} min - Minimum allowed value
     * @param {number} max - Maximum allowed value
     * @returns {boolean} Whether the value is valid
     */
    isValidNumber(value, min, max) {
        const num = parseInt(value, 10);
        return !isNaN(num) && num >= min && num <= max;
    },

    /**
     * Validate a course name
     * @param {string} name - The course name to validate
     * @returns {object} Validation result with isValid and message
     */
    validateCourseName(name) {
        const { minLength, maxLength, pattern } = CONFIG.validation.courseName;

        if (!name || name.trim().length < minLength) {
            return { isValid: false, message: 'Course name is required' };
        }

        if (name.length > maxLength) {
            return { isValid: false, message: `Course name must be ${maxLength} characters or less` };
        }

        if (!pattern.test(name)) {
            return { isValid: false, message: 'Course name contains invalid characters' };
        }

        return { isValid: true, message: '' };
    },

    /**
     * Debounce a function
     * @param {Function} func - The function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} Debounced function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Check if the browser is online
     * @returns {boolean} Online status
     */
    isOnline() {
        return navigator.onLine;
    },

    /**
     * Show a screen by ID
     * @param {string} screenId - The ID of the screen to show
     */
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.classList.add('active');
        }
    },

    /**
     * Show the loading overlay
     * @param {string} message - Loading message to display
     */
    showLoading(message = 'Loading...') {
        const overlay = document.getElementById('loading-overlay');
        const messageEl = document.getElementById('loading-message');
        if (overlay) {
            overlay.classList.remove('hidden');
            if (messageEl) {
                messageEl.textContent = message;
            }
        }
    },

    /**
     * Hide the loading overlay
     */
    hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
    },

    /**
     * Show a toast notification
     * @param {string} message - The message to display
     * @param {string} type - The type of toast (success, error, warning, info)
     * @param {number} duration - How long to show the toast in milliseconds
     */
    showToast(message, type = 'info', duration = CONFIG.toast.duration) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        // Remove toast after duration
        setTimeout(() => {
            toast.style.animation = 'slideUp 0.3s ease reverse';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, duration);
    },

    /**
     * Show or hide an element
     * @param {HTMLElement|string} element - Element or element ID
     * @param {boolean} show - Whether to show the element
     */
    toggleElement(element, show) {
        const el = typeof element === 'string' ? document.getElementById(element) : element;
        if (el) {
            el.classList.toggle('hidden', !show);
        }
    },

    /**
     * Update the header title
     * @param {string} title - The new title
     */
    setHeaderTitle(title) {
        const headerTitle = document.getElementById('header-title');
        if (headerTitle) {
            headerTitle.textContent = title;
        }
    },

    /**
     * Show or hide the back button
     * @param {boolean} show - Whether to show the back button
     */
    showBackButton(show) {
        const backBtn = document.getElementById('back-btn');
        if (backBtn) {
            backBtn.classList.toggle('hidden', !show);
        }
    },

    /**
     * Deep clone an object
     * @param {object} obj - The object to clone
     * @returns {object} Cloned object
     */
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },

    /**
     * Sort an array of objects by a key
     * @param {Array} array - The array to sort
     * @param {string} key - The key to sort by
     * @param {boolean} ascending - Sort direction
     * @returns {Array} Sorted array
     */
    sortBy(array, key, ascending = true) {
        return [...array].sort((a, b) => {
            if (a[key] < b[key]) return ascending ? -1 : 1;
            if (a[key] > b[key]) return ascending ? 1 : -1;
            return 0;
        });
    },

    /**
     * Group an array of objects by a key
     * @param {Array} array - The array to group
     * @param {string} key - The key to group by
     * @returns {object} Grouped object
     */
    groupBy(array, key) {
        return array.reduce((groups, item) => {
            const value = item[key];
            groups[value] = groups[value] || [];
            groups[value].push(item);
            return groups;
        }, {});
    }
};

// Make Utils globally available
window.Utils = Utils;
