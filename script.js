document.addEventListener('DOMContentLoaded', () => {
    const setupContainer = document.getElementById('setup-container');
    const dashboardContainer = document.getElementById('dashboard-container');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveKeyBtn = document.getElementById('save-key-btn');
    const setupError = document.getElementById('setup-error');
    const movieGrid = document.getElementById('movie-grid');
    const statusMessage = document.getElementById('status-message');
    const sortSelect = document.getElementById('sort-select');
    const jpPosterToggle = document.getElementById('jp-poster-toggle');
    const filesizeToggle = document.getElementById('filesize-toggle');
    const durationToggle = document.getElementById('duration-toggle');
    const refreshBtn = document.getElementById('refresh-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const settingsApiKeyInput = document.getElementById('settings-api-key');
    const updateKeyBtn = document.getElementById('update-key-btn');
    const settingsMsg = document.getElementById('settings-msg');
    const clearCacheBtn = document.getElementById('clear-cache-btn');

    let allProcessedMovies = []; // Global array to hold movies for sorting
    let isJpPostersEnabled = false;
    let isFilesizeEnabled = false;
    let isDurationEnabled = false;
    let genreMap = {}; // Cache TMDB genre ids to names
    let activeGenres = new Set();
    let excludedGenres = new Set(); // Genres to hide (click active -> excluded)
    let currentProcessId = 0;
    let lastBookmarks = []; // Store bookmarks for quick reload
    let currentApiKey = '';

    // Helper: validate TMDB API key
    async function validateTmdbKey(key) {
        if (!key) return false;
        try {
            const res = await fetch(`https://api.themoviedb.org/3/authentication?api_key=${encodeURIComponent(key)}`);
            if (!res.ok) return false;
            const data = await res.json();
            return data.success === true;
        } catch (e) {
            console.warn('Network error while validating TMDB key, proceeding tentatively', e);
            // Allow if offline / temporary network glitch
            return true;
        }
    }

    // 1. Check for TMDB API Key and Settings
    chrome.storage.local.get(['tmdbApiKey', 'jpPostersEnabled', 'filesizeEnabled', 'durationEnabled'], function (result) {
        if (result.jpPostersEnabled) {
            jpPosterToggle.checked = true;
            isJpPostersEnabled = true;
        }

        if (result.filesizeEnabled) {
            filesizeToggle.checked = true;
            isFilesizeEnabled = true;
            document.body.classList.add('show-filesize');
        }

        if (result.durationEnabled) {
            durationToggle.checked = true;
            isDurationEnabled = true;
            document.body.classList.add('show-duration');
        }

        if (result.tmdbApiKey) {
            currentApiKey = result.tmdbApiKey;
            loadDashboard(currentApiKey);
        } else {
            setupContainer.classList.remove('hidden');
        }
    });

    // 2. Handle Save Key on initial setup
    saveKeyBtn.addEventListener('click', async () => {
        const key = apiKeyInput.value.trim();
        if (!key) {
            showSetupError('Please enter a TMDB API key.');
            return;
        }

        saveKeyBtn.disabled = true;
        saveKeyBtn.textContent = 'Verifying...';
        setupError.classList.add('hidden');

        const isValid = await validateTmdbKey(key);
        saveKeyBtn.disabled = false;
        saveKeyBtn.textContent = 'Save Key';

        if (!isValid) {
            showSetupError('Invalid TMDB API key. Please verify your v3 API key.');
            return;
        }

        chrome.storage.local.set({ tmdbApiKey: key }, function () {
            currentApiKey = key;
            setupContainer.classList.add('hidden');
            loadDashboard(key);
        });
    });

    function showSetupError(msg) {
        setupError.textContent = msg;
        setupError.classList.remove('hidden');
    }

    // Handle Japanese Poster Toggle
    jpPosterToggle.addEventListener('change', (e) => {
        isJpPostersEnabled = e.target.checked;
        chrome.storage.local.set({ jpPostersEnabled: isJpPostersEnabled }, () => {
            if (currentApiKey) {
                processBookmarks(lastBookmarks, currentApiKey);
            }
        });
    });

    // Handle Filesize Toggle
    filesizeToggle.addEventListener('change', (e) => {
        isFilesizeEnabled = e.target.checked;
        document.body.classList.toggle('show-filesize', isFilesizeEnabled);
        chrome.storage.local.set({ filesizeEnabled: isFilesizeEnabled });
    });

    // Handle Duration Toggle
    durationToggle.addEventListener('change', (e) => {
        isDurationEnabled = e.target.checked;
        document.body.classList.toggle('show-duration', isDurationEnabled);
        chrome.storage.local.set({ durationEnabled: isDurationEnabled });
    });

    // Handle Refresh Button
    refreshBtn.addEventListener('click', () => {
        if (currentApiKey) {
            loadDashboard(currentApiKey);
        }
    });

    // Settings Modal Handlers
    settingsBtn.addEventListener('click', () => {
        settingsApiKeyInput.value = currentApiKey || '';
        hideSettingsFeedback();
        settingsModal.classList.remove('hidden');
    });

    closeSettingsBtn.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });

    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.add('hidden');
        }
    });

    updateKeyBtn.addEventListener('click', async () => {
        const key = settingsApiKeyInput.value.trim();
        if (!key) {
            showSettingsFeedback('API key cannot be empty.', 'error');
            return;
        }

        updateKeyBtn.disabled = true;
        updateKeyBtn.textContent = 'Validating...';

        const isValid = await validateTmdbKey(key);
        updateKeyBtn.disabled = false;
        updateKeyBtn.textContent = 'Save Key';

        if (!isValid) {
            showSettingsFeedback('Invalid TMDB API key.', 'error');
            return;
        }

        chrome.storage.local.set({ tmdbApiKey: key }, () => {
            currentApiKey = key;
            showSettingsFeedback('TMDB API Key updated successfully!', 'success');
            setTimeout(() => {
                settingsModal.classList.add('hidden');
                loadDashboard(currentApiKey);
            }, 800);
        });
    });

    clearCacheBtn.addEventListener('click', () => {
        chrome.storage.local.remove(['movieCacheV6_en', 'movieCacheV6_jp'], () => {
            showSettingsFeedback('Metadata and poster cache cleared!', 'success');
            setTimeout(() => {
                settingsModal.classList.add('hidden');
                if (currentApiKey) {
                    loadDashboard(currentApiKey);
                }
            }, 800);
        });
    });

    function showSettingsFeedback(text, type) {
        settingsMsg.textContent = text;
        settingsMsg.className = `settings-feedback ${type}`;
        settingsMsg.classList.remove('hidden');
    }

    function hideSettingsFeedback() {
        settingsMsg.classList.add('hidden');
        settingsMsg.textContent = '';
    }

    // 3. Main Dashboard Load Function
    function loadDashboard(apiKey) {
        dashboardContainer.classList.remove('hidden');
        statusMessage.classList.add('hidden');
        statusMessage.innerHTML = '';

        // Search for 'mv' or 'movies' bookmarks folder (case-insensitive)
        chrome.bookmarks.getTree(function (tree) {
            let foundFolder = null;

            function findFolder(nodes) {
                for (let node of nodes) {
                    if (!node.url && node.title) {
                        const titleLower = node.title.trim().toLowerCase();
                        if (titleLower === 'mv' || titleLower === 'movies') {
                            foundFolder = node;
                            return;
                        }
                    }
                    if (node.children) {
                        findFolder(node.children);
                        if (foundFolder) return;
                    }
                }
            }

            findFolder(tree);

            if (foundFolder) {
                chrome.bookmarks.getSubTree(foundFolder.id, function (results) {
                    let allBookmarks = [];

                    function extractBookmarks(nodes) {
                        for (let node of nodes) {
                            if (node.url) {
                                allBookmarks.push(node);
                            }
                            if (node.children) {
                                extractBookmarks(node.children);
                            }
                        }
                    }

                    if (results && results[0] && results[0].children) {
                        extractBookmarks(results[0].children);
                    }

                    lastBookmarks = allBookmarks;
                    processBookmarks(allBookmarks, apiKey);
                });
            } else {
                movieGrid.innerHTML = '';
                showStatusMessage(
                    'Bookmarks Folder Not Found',
                    'Could not find a bookmark folder named <strong>"mv"</strong> (or <strong>"Movies"</strong>). Please create this folder in your Chrome Bookmarks Bar, add your movie links to it, and click Refresh below.',
                    true
                );
            }
        });
    }

    function showStatusMessage(title, text, showRetry = false) {
        statusMessage.innerHTML = '';

        const h3 = document.createElement('h3');
        h3.textContent = title;
        statusMessage.appendChild(h3);

        const p = document.createElement('p');
        p.innerHTML = text; // Safe static or sanitized message
        statusMessage.appendChild(p);

        if (showRetry) {
            const retryBtn = document.createElement('button');
            retryBtn.textContent = 'Refresh Library';
            retryBtn.addEventListener('click', () => {
                if (currentApiKey) {
                    loadDashboard(currentApiKey);
                }
            });
            statusMessage.appendChild(retryBtn);
        }

        statusMessage.classList.remove('hidden');
    }

    // 4. Parse Title and Year from filename
    function parseFilename(filename) {
        // Strip common movie video container extensions
        let clean = filename.replace(/\.(mkv|mp4|avi|mov|wmv|flv|webm|m4v)$/i, '');
        const maxYear = new Date().getFullYear() + 2;

        // Match 4-digit release years (1880-maxYear) bounded by delimiters or string ends
        // Uses lookahead so delimiter is not consumed and overlapping years work
        const allMatches = [...clean.matchAll(/(?:^|[\.\s\(\[\-_])((?:18|19|20)\d{2})(?=[\.\s\)\]\-_]|$)/g)];
        const yearMatches = allMatches.filter(m => {
            const y = parseInt(m[1], 10);
            return y >= 1880 && y <= maxYear;
        });

        let title = clean;
        let year = null;

        if (yearMatches.length > 0) {
            // Pick the last valid release year match (e.g. Blade Runner 2049 (2017) -> year 2017)
            const lastYearMatch = yearMatches[yearMatches.length - 1];
            let tentativeTitle = clean.substring(0, lastYearMatch.index + (lastYearMatch[0].length - lastYearMatch[1].length));
            let cleanedTitle = tentativeTitle.replace(/[\._]/g, ' ').replace(/[\(\[\{\)\]\}]/g, ' ').replace(/\s+/g, ' ').trim();

            if (cleanedTitle.length > 0) {
                year = lastYearMatch[1];
                title = cleanedTitle;
            } else {
                // The filename itself is the year (e.g., "1917" or "2012")
                title = lastYearMatch[1];
                year = null;
            }
        } else {
            // No year found, strip everything after the first known release tag
            const tagRegex = /[\.\s\[\(](1080p|720p|2160p|4k|uhd|bluray|blu-ray|web-dl|webrip|web|hdrip|dvdrip|remux|x264|x265|hevc|h264|aac|dts)[\.\s\)\]\w-]*/i;
            const tagMatch = clean.match(tagRegex);
            if (tagMatch) {
                title = clean.substring(0, tagMatch.index);
            }
        }

        title = title.replace(/[\._]/g, ' ').replace(/[\(\[\{\)\]\}]/g, ' ').replace(/\s+/g, ' ').trim();
        return { title, year };
    }

    // Helper to format bytes
    function formatBytes(bytes, decimals = 2) {
        if (!+bytes || bytes < 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    }

    // Helper to format duration
    function formatDuration(minutes) {
        if (!+minutes || minutes < 0) return '0m';
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        if (h > 0) {
            return `${h}h ${m}m`;
        }
        return `${m}m`;
    }

    // Helper to fetch pixeldrain file size
    async function fetchPixeldrainSize(url) {
        let match = url.match(/pixeldrain\.com\/u\/([a-zA-Z0-9_-]+)/);
        if (match) {
            try {
                let res = await fetch(`https://pixeldrain.com/api/file/${match[1]}/info`);
                if (res.ok) {
                    let data = await res.json();
                    return data.size || 0;
                }
            } catch (e) {
                console.error('Failed to fetch pixeldrain size', e);
            }
        }
        return 0;
    }

    // 5. Process Bookmarks and Fetch Posters
    async function processBookmarks(bookmarks, apiKey) {
        const processId = ++currentProcessId;
        const cacheKey = isJpPostersEnabled ? 'movieCacheV6_jp' : 'movieCacheV6_en';

        chrome.storage.local.get([cacheKey], async function (result) {
            if (processId !== currentProcessId) return; // Abort if a new process started

            let cache = result[cacheKey] || {};
            let cacheUpdated = false;

            // Filter for valid pixeldrain links
            let validBookmarks = bookmarks.filter(b => b.url && b.url.includes('pixeldrain.com'));

            if (validBookmarks.length === 0) {
                movieGrid.innerHTML = '';
                showStatusMessage(
                    'No Movie Links Found',
                    'Your bookmark folder was found, but it does not contain any <strong>pixeldrain.com</strong> links. Please add Pixeldrain movie bookmarks and refresh.'
                );
                allProcessedMovies = [];
                renderGenreFilters();
                return;
            }

            // Fetch genre map once if needed
            if (Object.keys(genreMap).length === 0) {
                try {
                    let genreRes = await fetch(`https://api.themoviedb.org/3/genre/movie/list?api_key=${encodeURIComponent(apiKey)}&language=en-US`);
                    if (genreRes.ok) {
                        let genreData = await genreRes.json();
                        if (genreData.genres) {
                            for (let g of genreData.genres) {
                                genreMap[g.id] = g.name;
                            }
                        }
                    }
                } catch (e) {
                    console.error('Failed to fetch genres', e);
                }
            }

            movieGrid.innerHTML = ''; // Clear loading state
            statusMessage.classList.add('hidden');

            // Add skeleton placeholders
            for (let i = 0; i < validBookmarks.length; i++) {
                const skeleton = document.createElement('div');
                skeleton.className = 'movie-card skeleton';
                movieGrid.appendChild(skeleton);
            }

            allProcessedMovies = [];

            for (let bookmark of validBookmarks) {
                if (processId !== currentProcessId) return; // Abort if a new process started

                let parsed = parseFilename(bookmark.title);

                // Check cache first
                let cachedData = cache[bookmark.id];
                let movieData = null;

                // Validate cached data completeness
                if (cachedData && cachedData.originalTitle === bookmark.title && cachedData.genres && cachedData.dateAdded !== undefined && cachedData.popularity !== undefined) {
                    movieData = cachedData;
                    movieData.url = bookmark.url; // Always ensure URL is fresh
                    movieData.dateAdded = bookmark.dateAdded || movieData.dateAdded || 0;

                    if (movieData.fileSize === undefined) {
                        movieData.fileSize = await fetchPixeldrainSize(bookmark.url);
                        cacheUpdated = true;
                    }
                    if (movieData.duration === undefined) {
                        // Backfill duration
                        try {
                            let query = encodeURIComponent(parsed.title);
                            let yearQuery = parsed.year ? `&year=${encodeURIComponent(parsed.year)}` : '';
                            let res = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${encodeURIComponent(apiKey)}&query=${query}${yearQuery}`);
                            if (res.ok) {
                                let data = await res.json();
                                if ((!data.results || data.results.length === 0) && parsed.year) {
                                    res = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${encodeURIComponent(apiKey)}&query=${query}`);
                                    if (res.ok) data = await res.json();
                                }
                                if (data.results && data.results.length > 0) {
                                    let detRes = await fetch(`https://api.themoviedb.org/3/movie/${data.results[0].id}?api_key=${encodeURIComponent(apiKey)}`);
                                    if (detRes.ok) {
                                        let detData = await detRes.json();
                                        movieData.duration = detData.runtime || 0;
                                        movieData.tmdbId = data.results[0].id;
                                        cacheUpdated = true;
                                    }
                                } else {
                                    movieData.duration = 0;
                                }
                            }
                        } catch (e) {
                            movieData.duration = 0;
                        }
                    }
                } else {
                    // Fetch from API
                    let posterUrl = null;
                    let displayTitle = parsed.title;
                    let displayYear = parsed.year;
                    let fullReleaseDate = parsed.year ? `${parsed.year}-01-01` : '1900-01-01'; // default sort date
                    let displayGenres = [];
                    let displayPopularity = 0;
                    let displayRating = 0;
                    let displayDuration = 0;
                    let bestMatch = null;

                    try {
                        let query = encodeURIComponent(parsed.title);
                        let yearQuery = parsed.year ? `&year=${encodeURIComponent(parsed.year)}` : '';

                        // First attempt: search with year in default language for accurate title matching
                        let res = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${encodeURIComponent(apiKey)}&query=${query}${yearQuery}`);
                        let data = res.ok ? await res.json() : null;

                        // Fallback attempt: if no results, search without year
                        if ((!data || !data.results || data.results.length === 0) && parsed.year) {
                            res = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${encodeURIComponent(apiKey)}&query=${query}`);
                            data = res.ok ? await res.json() : null;
                        }

                        if (data && data.results && data.results.length > 0) {
                            // Find the best match
                            bestMatch = data.results[0]; // fallback to first (most popular)
                            let bestScore = 0;

                            for (let movie of data.results) {
                                // Normalize titles by converting & to 'and', then removing non-alphanumeric chars
                                let normalize = (t) => t ? t.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '') : '';

                                let nParsedTitle = normalize(parsed.title);
                                let matchTitle = normalize(movie.title) === nParsedTitle || normalize(movie.original_title) === nParsedTitle;

                                let matchYear = false;
                                if (movie.release_date && parsed.year) {
                                    let movieYear = parseInt(movie.release_date.substring(0, 4));
                                    let pYear = parseInt(parsed.year);
                                    // Allow +/- 1 year tolerance for festival vs wide release dates
                                    if (Math.abs(movieYear - pYear) <= 1) {
                                        matchYear = true;
                                    }
                                }

                                let score = 0;
                                if (matchTitle && matchYear) score = 3;
                                else if (matchTitle) score = 2;
                                else if (matchYear) score = 1;

                                if (score > bestScore) {
                                    bestMatch = movie;
                                    bestScore = score;
                                    if (score === 3) break; // Perfect match found, stop looking
                                }
                            }

                            // Fetch details for runtime and localized posters
                            if (bestMatch.id) {
                                try {
                                    let langParam = isJpPostersEnabled ? '&language=ja-JP' : '';
                                    let detRes = await fetch(`https://api.themoviedb.org/3/movie/${bestMatch.id}?api_key=${encodeURIComponent(apiKey)}${langParam}`);
                                    if (detRes.ok) {
                                        let detData = await detRes.json();
                                        displayDuration = detData.runtime || 0;

                                        if (isJpPostersEnabled) {
                                            if (detData.poster_path) {
                                                bestMatch.poster_path = detData.poster_path;
                                            }
                                            if (detData.title) {
                                                bestMatch.title = detData.title;
                                            }
                                        }
                                    }
                                } catch (e) {
                                    console.error('Failed to fetch details for', parsed.title, e);
                                }
                            }

                            if (bestMatch.poster_path) {
                                posterUrl = `https://image.tmdb.org/t/p/w500${bestMatch.poster_path}`;
                            }
                            displayTitle = bestMatch.title || displayTitle;
                            displayYear = bestMatch.release_date ? bestMatch.release_date.substring(0, 4) : displayYear;
                            fullReleaseDate = bestMatch.release_date || fullReleaseDate;

                            if (bestMatch.genres && Array.isArray(bestMatch.genres)) {
                                displayGenres = bestMatch.genres.map(g => g.name);
                            } else if (bestMatch.genre_ids && Array.isArray(bestMatch.genre_ids)) {
                                displayGenres = bestMatch.genre_ids.map(id => genreMap[id]).filter(Boolean);
                            }

                            // Custom language genres
                            let origLang = bestMatch.original_language;
                            if (origLang) {
                                const asianLangs = ['ja', 'ko', 'zh', 'cn', 'tw', 'th', 'vi', 'id', 'tl'];
                                if (asianLangs.includes(origLang)) {
                                    if (!displayGenres.includes('Asian')) displayGenres.push('Asian');
                                } else if (origLang !== 'en') {
                                    if (!displayGenres.includes('Foreign')) displayGenres.push('Foreign');
                                }
                            }
                            displayPopularity = bestMatch.popularity || 0;
                            displayRating = bestMatch.vote_average || 0;
                        }
                    } catch (e) {
                        console.error('Error fetching TMDB data for', parsed.title, e);
                    }

                    movieData = {
                        originalTitle: bookmark.title,
                        posterUrl: posterUrl,
                        title: displayTitle,
                        year: displayYear,
                        fullReleaseDate: fullReleaseDate,
                        url: bookmark.url,
                        dateAdded: bookmark.dateAdded || 0,
                        genres: displayGenres,
                        popularity: displayPopularity,
                        rating: displayRating,
                        fileSize: await fetchPixeldrainSize(bookmark.url),
                        duration: displayDuration,
                        tmdbId: bestMatch ? bestMatch.id : null
                    };

                    // Update cache
                    cache[bookmark.id] = movieData;
                    cacheUpdated = true;
                }

                allProcessedMovies.push(movieData);
            }

            if (cacheUpdated) {
                chrome.storage.local.set({ [cacheKey]: cache });
            }

            renderGenreFilters();
            applySortingAndRender();
        });
    }

    // Render genre filters
    function renderGenreFilters() {
        const genreContainer = document.getElementById('genre-filters');
        genreContainer.innerHTML = '';

        let genreCounts = {};
        for (let m of allProcessedMovies) {
            if (m.genres) {
                m.genres.forEach(g => {
                    genreCounts[g] = (genreCounts[g] || 0) + 1;
                });
            }
        }

        let sortedGenres = Object.keys(genreCounts).sort();
        let maxCount = Math.max(...Object.values(genreCounts), 1);

        // Render 'All' button safely without innerHTML XSS
        const allBtn = document.createElement('button');
        allBtn.className = 'genre-btn';
        allBtn.style.setProperty('--genre-weight', '1');
        // 'All' is active ONLY when neither included nor excluded filters are set
        if (activeGenres.size === 0 && excludedGenres.size === 0) {
            allBtn.classList.add('active');
        }

        const allLabel = document.createElement('span');
        allLabel.textContent = 'All';
        const allCount = document.createElement('span');
        allCount.className = 'genre-count';
        allCount.textContent = allProcessedMovies.length;
        allBtn.appendChild(allLabel);
        allBtn.appendChild(allCount);

        allBtn.addEventListener('click', () => {
            activeGenres.clear();
            excludedGenres.clear();
            renderGenreFilters();
            applySortingAndRender();
        });
        genreContainer.appendChild(allBtn);

        for (let g of sortedGenres) {
            const btn = document.createElement('button');
            btn.className = 'genre-btn';

            let weight = genreCounts[g] / maxCount;
            weight = Math.max(0.15, weight); // minimum weight so it doesn't disappear
            btn.style.setProperty('--genre-weight', weight);

            if (activeGenres.has(g)) btn.classList.add('active');
            if (excludedGenres.has(g)) btn.classList.add('excluded');

            const labelSpan = document.createElement('span');
            labelSpan.textContent = g;
            const countSpan = document.createElement('span');
            countSpan.className = 'genre-count';
            countSpan.textContent = genreCounts[g];
            btn.appendChild(labelSpan);
            btn.appendChild(countSpan);

            // 3-state cycle: default → active (include) → excluded (hide) → default
            btn.addEventListener('click', () => {
                if (excludedGenres.has(g)) {
                    excludedGenres.delete(g);
                } else if (activeGenres.has(g)) {
                    activeGenres.delete(g);
                    excludedGenres.add(g);
                } else {
                    activeGenres.add(g);
                }
                renderGenreFilters();
                applySortingAndRender();
            });
            genreContainer.appendChild(btn);
        }
    }

    // Sort listener
    sortSelect.addEventListener('change', () => {
        applySortingAndRender();
    });

    function applySortingAndRender() {
        const sortMode = sortSelect.value;

        // Filter by genre
        let moviesToRender = allProcessedMovies.filter(m => {
            // Hide movies that contain any excluded genre
            if (excludedGenres.size > 0 && m.genres) {
                for (let exG of excludedGenres) {
                    if (m.genres.includes(exG)) return false;
                }
            }
            if (activeGenres.size === 0) return true;
            if (!m.genres) return false;
            // AND logic: movie must have ALL selected genres
            for (let activeG of activeGenres) {
                if (!m.genres.includes(activeG)) return false;
            }
            return true;
        });

        // Safe sort handling null/undefined values to prevent NaN or exceptions
        moviesToRender.sort((a, b) => {
            if (sortMode === 'title-asc') {
                return (a.title || '').localeCompare(b.title || '');
            } else if (sortMode === 'title-desc') {
                return (b.title || '').localeCompare(a.title || '');
            } else if (sortMode === 'date-desc') {
                const dateA = a.fullReleaseDate ? new Date(a.fullReleaseDate).getTime() : 0;
                const dateB = b.fullReleaseDate ? new Date(b.fullReleaseDate).getTime() : 0;
                return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
            } else if (sortMode === 'date-asc') {
                const dateA = a.fullReleaseDate ? new Date(a.fullReleaseDate).getTime() : 0;
                const dateB = b.fullReleaseDate ? new Date(b.fullReleaseDate).getTime() : 0;
                return (isNaN(dateA) ? 0 : dateA) - (isNaN(dateB) ? 0 : dateB);
            } else if (sortMode === 'added-desc') {
                return (b.dateAdded || 0) - (a.dateAdded || 0);
            } else if (sortMode === 'added-asc') {
                return (a.dateAdded || 0) - (b.dateAdded || 0);
            } else if (sortMode === 'popularity-desc') {
                return (b.popularity || 0) - (a.popularity || 0);
            } else if (sortMode === 'rating-desc') {
                return (b.rating || 0) - (a.rating || 0);
            } else if (sortMode === 'size-desc') {
                return (b.fileSize || 0) - (a.fileSize || 0);
            } else if (sortMode === 'size-asc') {
                return (a.fileSize || 0) - (b.fileSize || 0);
            } else if (sortMode === 'duration-desc') {
                return (b.duration || 0) - (a.duration || 0);
            } else if (sortMode === 'duration-asc') {
                return (a.duration || 0) - (b.duration || 0);
            }
            return 0;
        });

        movieGrid.innerHTML = '';
        let currentDecade = null;

        for (let movie of moviesToRender) {
            if (sortMode.startsWith('date-')) {
                const year = movie.fullReleaseDate ? parseInt(movie.fullReleaseDate.substring(0, 4)) : null;
                let decadeStr = 'Unknown';
                if (year && year !== 1900) {
                    const decade = Math.floor(year / 10) * 10;
                    decadeStr = `${decade}s`;
                }

                if (decadeStr !== currentDecade) {
                    currentDecade = decadeStr;
                    const header = document.createElement('div');
                    header.className = 'decade-header';
                    header.textContent = currentDecade;
                    movieGrid.appendChild(header);
                }
            }

            renderMovieCard(movie.url, movie.posterUrl, movie.title, movie.year, movie.fileSize, movie.duration);
        }
    }

    // 6. Render Card with XSS safety, accessibility, and error handling
    function renderMovieCard(url, posterUrl, title, year, fileSize, duration) {
        const card = document.createElement('div');
        card.className = 'movie-card';
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', `${title || 'Movie'}${year ? ` (${year})` : ''}`);

        // Open URL safely on click or keyboard Enter/Space
        const openMovieUrl = () => {
            try {
                const parsedUrl = new URL(url);
                if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
                    window.open(url, '_blank', 'noopener,noreferrer');
                } else {
                    console.warn('Blocked unsafe URL scheme:', url);
                }
            } catch (e) {
                console.error('Invalid URL:', url);
            }
        };

        card.addEventListener('click', openMovieUrl);
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openMovieUrl();
            }
        });

        // Function to create fallback title span safely (no innerHTML)
        const showTitleFallback = () => {
            const span = document.createElement('span');
            span.className = 'fallback-title';
            span.textContent = title || 'Untitled Movie';
            card.appendChild(span);
        };

        if (posterUrl) {
            const img = document.createElement('img');
            img.src = posterUrl;
            img.alt = title || 'Movie Poster';
            img.loading = 'lazy';
            img.onerror = () => {
                img.remove();
                showTitleFallback();
            };
            card.appendChild(img);
        } else {
            showTitleFallback();
        }

        if (fileSize !== undefined && fileSize > 0) {
            const sizeDiv = document.createElement('div');
            sizeDiv.className = 'filesize';
            sizeDiv.textContent = formatBytes(fileSize);
            card.appendChild(sizeDiv);
        }

        if (duration !== undefined && duration > 0) {
            const durDiv = document.createElement('div');
            durDiv.className = 'duration';
            durDiv.textContent = formatDuration(duration);
            card.appendChild(durDiv);
        }

        movieGrid.appendChild(card);
    }
});
