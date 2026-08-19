document.addEventListener('DOMContentLoaded', () => {
    // State
    let allJobs = [];
    let recommendedJobs = [];
    let filteredJobs = [];
    let currentPage = 1;
    const itemsPerPage = 15;
    
    // Auth state
    const token = localStorage.getItem('token');
    const isAuthenticated = !!token;

    // DOM Elements
    const searchInput = document.getElementById('hero-search-input');
    const locationInput = document.getElementById('hero-location-input');
    const searchBtn = document.getElementById('hero-search-btn');
    
    const jobTypeFilters = Array.from(document.querySelectorAll('.job-type-filter'));
    const workModelFilters = Array.from(document.querySelectorAll('.work-model-filter'));
    
    const salarySlider = document.getElementById('salary-slider');
    const salaryDisplay = document.getElementById('salary-display');
    const sortSelect = document.getElementById('sort-select');
    const resetBtn = document.getElementById('reset-filters');
    
    const jobsContainer = document.getElementById('jobs-container');
    const loadingIndicator = document.getElementById('loading-indicator');
    const searchStatsContainer = document.getElementById('search-stats-container');
    const searchStatsText = document.getElementById('search-stats-text');
    
    const paginationControls = document.getElementById('pagination-controls');
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    const pageInfo = document.getElementById('page-info');

    const activeFiltersContainer = document.getElementById('active-filters-container');

    const savedJobsFilter = document.getElementById('saved-jobs-filter');
    const forYouFilter = document.getElementById('for-you-filter');
    
    // Formatting utilities
    const formatCurrency = (num) => {
        if (num === 0) return 'Any';
        if (num >= 1000) return '$' + (num / 1000).toFixed(0) + 'k+';
        return '$' + num;
    };
    
    const timeAgo = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '';
        
        const seconds = Math.floor((new Date() - date) / 1000);
        let interval = seconds / 31536000;
        
        if (interval > 1) return 'Posted ' + Math.floor(interval) + ' years ago';
        interval = seconds / 2592000;
        if (interval > 1) return 'Posted ' + Math.floor(interval) + ' months ago';
        interval = seconds / 86400;
        if (interval >= 2) return 'Posted ' + Math.floor(interval) + ' days ago';
        if (interval >= 1) return 'Posted 1 day ago';
        return 'Posted today';
    };

    // Saved Jobs Logic
    let savedJobs = [];
    
    window.toggleSaveJob = async (e, jobId) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (!isAuthenticated) {
            window.location.href = '/auth';
            return;
        }
        
        const isSaved = savedJobs.includes(jobId);
        
        // Optimistic UI update
        if (isSaved) {
            savedJobs = savedJobs.filter(id => id !== jobId);
        } else {
            savedJobs.push(jobId);
        }
        
        updateSaveButtonIcon(jobId);
        
        try {
            if (isSaved) {
                await fetch(`/api/v1/users/me/saved_jobs/${jobId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            } else {
                await fetch(`/api/v1/users/me/saved_jobs/${jobId}`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            }
        } catch (err) {
            console.error('Failed to sync saved job', err);
        }

        // Re-filter if we are currently looking at saved jobs
        if (savedJobsFilter && savedJobsFilter.checked) {
            applyFilters();
        }
    };

    function updateSaveButtonIcon(jobId) {
        const btns = document.querySelectorAll(`.save-btn[data-job-id="${jobId}"]`);
        btns.forEach(btn => {
            btn.innerHTML = savedJobs.includes(jobId) 
                ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" style="color: var(--text-main);"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>'
                : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>';
        });
    }

    // Collapsible filters
    document.querySelectorAll('.filter-header-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('collapsed');
            const content = btn.nextElementSibling;
            if (content) content.classList.toggle('collapsed');
        });
    });

    // Event Listeners for Filters
    if (searchInput) {
        searchInput.addEventListener('input', applyFilters);
        searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') applyFilters(); });
    }
    if (locationInput) {
        locationInput.addEventListener('input', applyFilters);
        locationInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') applyFilters(); });
    }
    if (searchBtn) searchBtn.addEventListener('click', applyFilters);
    if (savedJobsFilter) savedJobsFilter.addEventListener('change', applyFilters);
    if (forYouFilter) forYouFilter.addEventListener('change', applyFilters);
    
    jobTypeFilters.forEach(cb => cb.addEventListener('change', applyFilters));
    workModelFilters.forEach(cb => cb.addEventListener('change', applyFilters));
    
    if (sortSelect) sortSelect.addEventListener('change', applyFilters);
    
    if (salarySlider) {
        salarySlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            if (salaryDisplay) salaryDisplay.textContent = formatCurrency(val);
            applyFilters();
        });
    }
    
    if (resetBtn) {
        resetBtn.addEventListener('click', (e) => {
            e.preventDefault();
            clearAllFilters();
        });
    }

    // Event Listeners for Pagination
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderJobs();
                window.scrollTo({ top: document.querySelector('.search-layout').offsetTop - 20, behavior: 'smooth' });
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const totalPages = Math.ceil(filteredJobs.length / itemsPerPage);
            if (currentPage < totalPages) {
                currentPage++;
                renderJobs();
                window.scrollTo({ top: document.querySelector('.search-layout').offsetTop - 20, behavior: 'smooth' });
            }
        });
    }

    async function init() {
        if (isAuthenticated) {
            document.querySelectorAll('.auth-only').forEach(el => el.style.display = 'block');
            
            // Fetch saved jobs
            try {
                const res = await fetch('/api/v1/users/me/saved_jobs', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    savedJobs = data.map(j => j.id);
                }
            } catch (err) {
                console.error("Error fetching saved jobs", err);
            }
            
            // Fetch recommended jobs
            try {
                const recRes = await fetch('/api/v1/jobs/recommended', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (recRes.ok) {
                    recommendedJobs = await recRes.json();
                    // By default, turn on For You for authenticated users
                    if (forYouFilter) {
                        forYouFilter.checked = true;
                    }
                }
            } catch (e) {
                console.error("Error fetching recommended jobs", e);
            }
        }

        try {
            const response = await fetch('/api/v1/jobs/export/json');
            if (!response.ok) throw new Error('Failed to fetch jobs');
            
            allJobs = await response.json();
            filteredJobs = [...allJobs];
            
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            if (searchStatsContainer) searchStatsContainer.style.display = 'flex';
            applyFilters();
        } catch (error) {
            console.error('Error fetching jobs:', error);
            if (loadingIndicator) loadingIndicator.innerHTML = '<div style="color: var(--status-error);">Failed to load jobs. Please try again later.</div>';
        }
    }

    init();

    window.removeFilter = (type, value) => {
        if (type === 'saved') {
            if (savedJobsFilter) savedJobsFilter.checked = false;
        } else if (type === 'foryou') {
            if (forYouFilter) forYouFilter.checked = false;
        } else if (type === 'type') {
            jobTypeFilters.forEach(cb => { if (cb.value === value) cb.checked = false; });
        } else if (type === 'model') {
            workModelFilters.forEach(cb => { if (cb.value === value) cb.checked = false; });
        } else if (type === 'salary') {
            if (salarySlider) {
                salarySlider.value = 0;
                if (salaryDisplay) salaryDisplay.textContent = 'Any';
            }
        }
        applyFilters();
    };
    
    window.clearAllFilters = () => {
        if (searchInput) searchInput.value = '';
        if (locationInput) locationInput.value = '';
        if (savedJobsFilter) savedJobsFilter.checked = false;
        if (forYouFilter) forYouFilter.checked = false;
        jobTypeFilters.forEach(cb => cb.checked = false);
        workModelFilters.forEach(cb => cb.checked = false);
        if (salarySlider) {
            salarySlider.value = 0;
            if (salaryDisplay) salaryDisplay.textContent = 'Any';
        }
        if (sortSelect) sortSelect.value = 'newest';
        applyFilters();
    };

    function applyFilters() {
        const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const locQuery = locationInput ? locationInput.value.toLowerCase().trim() : '';
        const minSalary = salarySlider ? (parseInt(salarySlider.value) || 0) : 0;
        const sortOrder = sortSelect ? sortSelect.value : 'newest';
        
        const showSavedOnly = savedJobsFilter ? savedJobsFilter.checked : false;
        const showForYouOnly = forYouFilter ? forYouFilter.checked : false;
        const selectedJobTypes = jobTypeFilters.filter(cb => cb.checked).map(cb => cb.value);
        const selectedWorkModels = workModelFilters.filter(cb => cb.checked).map(cb => cb.value);

        let sourceJobs = showForYouOnly ? recommendedJobs : allJobs;

        filteredJobs = sourceJobs.filter(job => {
            if (showSavedOnly && !savedJobs.includes(job.id)) {
                return false;
            }

            let matchesQuery = true;
            if (query) {
                const titleMatch = job.title.toLowerCase().includes(query);
                const companyMatch = (job.company || '').toLowerCase().includes(query);
                const tagsMatch = job.tags && job.tags.some(tag => tag.toLowerCase().includes(query));
                matchesQuery = titleMatch || companyMatch || tagsMatch;
            }

            let matchesLocation = true;
            if (locQuery) {
                matchesLocation = job.location && job.location.toLowerCase().includes(locQuery);
            }

            // Salary Filter
            let matchesSalary = true;
            if (minSalary > 0) {
                if (job.salary_max) {
                    matchesSalary = job.salary_max >= minSalary;
                } else if (job.salary_min) {
                    matchesSalary = job.salary_min >= minSalary;
                } else {
                    matchesSalary = false;
                }
            }

            // Job Type Heuristics
            let matchesJobType = true;
            if (selectedJobTypes.length > 0) {
                const titleLower = job.title.toLowerCase();
                const tagsLower = (job.tags || []).map(t => t.toLowerCase());
                const fullText = titleLower + " " + tagsLower.join(" ");
                
                const isIntern = fullText.includes('intern') || fullText.includes('werkstudent');
                const isContract = fullText.includes('contract') || fullText.includes('freelance') || fullText.includes('temp');
                const isPartTime = fullText.includes('part-time') || fullText.includes('teilzeit');
                const isFullTime = !isIntern && !isContract && !isPartTime;

                matchesJobType = false;
                if (selectedJobTypes.includes('internship') && isIntern) matchesJobType = true;
                if (selectedJobTypes.includes('contract') && isContract) matchesJobType = true;
                if (selectedJobTypes.includes('part-time') && isPartTime) matchesJobType = true;
                if (selectedJobTypes.includes('full-time') && isFullTime) matchesJobType = true;
            }

            // Work Model Heuristics
            let matchesWorkModel = true;
            if (selectedWorkModels.length > 0) {
                const titleLower = job.title.toLowerCase();
                const locStr = (job.location || '').toLowerCase();
                
                const isRemote = job.remote === true || titleLower.includes('remote') || locStr.includes('remote');
                const isHybrid = titleLower.includes('hybrid') || locStr.includes('hybrid');
                const isOnSite = !isRemote && !isHybrid;

                matchesWorkModel = false;
                if (selectedWorkModels.includes('remote') && isRemote) matchesWorkModel = true;
                if (selectedWorkModels.includes('hybrid') && isHybrid) matchesWorkModel = true;
                if (selectedWorkModels.includes('on-site') && isOnSite) matchesWorkModel = true;
            }

            return matchesQuery && matchesLocation && matchesSalary && matchesJobType && matchesWorkModel;
        });

        // Sorting
        if (sortOrder === 'newest') {
            filteredJobs.sort((a, b) => new Date(b.posted_at || 0) - new Date(a.posted_at || 0));
        } else if (sortOrder === 'oldest') {
            filteredJobs.sort((a, b) => new Date(a.posted_at || 0) - new Date(b.posted_at || 0));
        } else if (sortOrder === 'salary_high') {
            filteredJobs.sort((a, b) => (b.salary_max || b.salary_min || 0) - (a.salary_max || a.salary_min || 0));
        }

        currentPage = 1;
        
        // Render Active Filters Tags
        if (activeFiltersContainer) {
            activeFiltersContainer.innerHTML = '';
            let hasFilters = false;
            
            const addTag = (label, type, value) => {
                hasFilters = true;
                const tag = document.createElement('div');
                tag.className = 'active-filter-tag';
                tag.innerHTML = `${label} <button onclick="removeFilter('${type}', '${value}')">&times;</button>`;
                activeFiltersContainer.appendChild(tag);
            };

            if (showSavedOnly) addTag('Saved Jobs', 'saved', '');
            if (showForYouOnly) addTag('For You', 'foryou', '');
            
            jobTypeFilters.forEach(cb => {
                if (cb.checked) {
                    addTag(cb.parentElement.textContent.trim(), 'type', cb.value);
                }
            });
            
            workModelFilters.forEach(cb => {
                if (cb.checked) {
                    addTag(cb.parentElement.textContent.trim(), 'model', cb.value);
                }
            });
            
            if (minSalary > 0) {
                addTag('Min ' + formatCurrency(minSalary), 'salary', '');
            }
            
            if (hasFilters) {
                const clearBtn = document.createElement('button');
                clearBtn.className = 'clear-all-btn';
                clearBtn.textContent = 'Clear all';
                clearBtn.onclick = clearAllFilters;
                activeFiltersContainer.appendChild(clearBtn);
            }
        }
        
        renderJobs();
    }

    function renderJobs() {
        if (!jobsContainer) return;
        jobsContainer.innerHTML = '';
        
        if (searchStatsText) searchStatsText.textContent = `Showing ${filteredJobs.length} open position${filteredJobs.length !== 1 ? 's' : ''}`;

        if (filteredJobs.length === 0) {
            let emptyHtml = `
                <div class="job-card" style="text-align: center; padding: 4rem 2rem; border-style: dashed; cursor: default; width: 100%; box-sizing: border-box;">
                    <h3 style="font-size: 1.1rem; color: var(--text-main); margin-bottom: 0.5rem;">No jobs found</h3>
                    <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.5rem;">We couldn't find any jobs matching your current filters.</p>
                    <button class="btn-secondary" onclick="clearAllFilters()" style="padding: 0.5rem 1rem; border-radius: 6px;">Clear all filters</button>
                </div>
            `;

            const showSavedOnly = savedJobsFilter ? savedJobsFilter.checked : false;
            const showForYouOnly = forYouFilter ? forYouFilter.checked : false;
            
            if (showSavedOnly && savedJobs.length === 0) {
                emptyHtml = `
                    <div class="job-card" style="text-align: center; padding: 4rem 2rem; border-style: dashed; cursor: default; width: 100%; box-sizing: border-box;">
                        <div style="font-size: 2rem; margin-bottom: 1rem; color: var(--text-muted);">🔖</div>
                        <h3 style="font-size: 1.1rem; color: var(--text-main); margin-bottom: 0.5rem;">No saved jobs yet</h3>
                        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.5rem; line-height: 1.4;">Save jobs you're interested in and<br>they'll appear here.</p>
                        <button class="btn-primary" onclick="removeFilter('saved', '')" style="padding: 0.5rem 1.5rem; border-radius: 6px;">Browse Jobs</button>
                    </div>
                `;
            } else if (showForYouOnly && recommendedJobs.length === 0) {
                emptyHtml = `
                    <div class="job-card" style="text-align: center; padding: 4rem 2rem; border-style: dashed; cursor: default; width: 100%; box-sizing: border-box;">
                        <div style="font-size: 2rem; margin-bottom: 1rem; color: var(--text-muted);">✨</div>
                        <h3 style="font-size: 1.1rem; color: var(--text-main); margin-bottom: 0.5rem;">No recommendations yet</h3>
                        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.5rem; line-height: 1.4;">Update your profile preferences to get<br>personalized job recommendations.</p>
                        <a href="/profile" class="btn-primary" style="padding: 0.5rem 1.5rem; border-radius: 6px; text-decoration: none;">Update Profile</a>
                    </div>
                `;
            }

            jobsContainer.innerHTML = emptyHtml;
            if (paginationControls) paginationControls.style.display = 'none';
            return;
        }

        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const jobsToShow = filteredJobs.slice(startIndex, endIndex);
        const totalPages = Math.ceil(filteredJobs.length / itemsPerPage);

        jobsToShow.forEach((job, index) => {
            const card = document.createElement('div');
            card.className = 'job-card';
            // Open job link when card is clicked
            card.onclick = () => window.open(job.url, '_blank');

            // Formatting
            let salaryStr = '';
            if (job.salary_min || job.salary_max) {
                const cur = job.salary_currency || '$';
                if (job.salary_min && job.salary_max && job.salary_min !== job.salary_max) {
                    salaryStr = `<div class="job-meta-item"><b>${cur}${formatK(job.salary_min)} - ${formatK(job.salary_max)}</b></div>`;
                } else {
                    const val = job.salary_max || job.salary_min;
                    salaryStr = `<div class="job-meta-item"><b>${cur}${formatK(val)}</b></div>`;
                }
            }

            const locationStr = job.location ? `<div class="job-meta-item"> ${job.location}</div>` : '';
            
            const dateStr = job.posted_at ? `<div class="job-meta-item" style="margin-left: auto;"> ${timeAgo(job.posted_at)}</div>` : '';

            let tagsHtml = '';
            if (job.tags && job.tags.length > 0) {
                tagsHtml = job.tags.slice(0, 4).map(t => `<span class="tag">${t}</span>`).join('');
            }
            
            // Initials for company logo
            const companyName = job.company || 'Unknown';
            const initials = companyName.substring(0, 1).toUpperCase();
            
            const isSaved = savedJobs.includes(job.id);
            const savedIcon = isSaved 
                ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" style="color: var(--text-main);"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>'
                : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>';

            card.innerHTML = `
                <div class="job-header">
                    <div class="job-title-row">
                        <div class="company-logo">${initials}</div>
                        <div>
                            <a href="${job.url}" target="_blank" onclick="event.stopPropagation()" class="job-title">${job.title}</a>
                            <div class="job-company">${companyName}</div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 0.75rem; align-items: center;">
                        <button class="save-btn" data-job-id="${job.id}" onclick="toggleSaveJob(event, '${job.id}')" style="background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 0.25rem;">
                            ${savedIcon}
                        </button>
                        <a href="${job.url}" target="_blank" onclick="event.stopPropagation()" class="btn-primary" style="padding: 0.35rem 0.8rem; font-size: 0.85rem; border-radius: 6px;">Apply Now</a>
                    </div>
                </div>
                <div class="job-meta">
                    ${locationStr}
                    ${salaryStr}
                    ${dateStr}
                </div>
                ${tagsHtml ? `<div class="job-tags">${tagsHtml}</div>` : ''}
            `;
            jobsContainer.appendChild(card);
        });

        if (totalPages > 1) {
            if (paginationControls) paginationControls.style.display = 'flex';
            if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
            if (prevBtn) prevBtn.disabled = currentPage === 1;
            if (nextBtn) nextBtn.disabled = currentPage === totalPages;
        } else {
            if (paginationControls) paginationControls.style.display = 'none';
        }
    }

    function formatK(num) {
        if (num >= 1000) {
            return (num / 1000).toFixed(0) + 'k';
        }
        return num.toString();
    }
});
