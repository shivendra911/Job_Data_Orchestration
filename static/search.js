document.addEventListener('DOMContentLoaded', () => {
    // State
    let allJobs = [];
    let filteredJobs = [];
    let currentPage = 1;
    const itemsPerPage = 15;

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
    try {
        savedJobs = JSON.parse(localStorage.getItem('savedJobs')) || [];
    } catch (e) {
        console.error('Error loading saved jobs', e);
    }
    
    window.toggleSaveJob = (e, jobId) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (savedJobs.includes(jobId)) {
            savedJobs = savedJobs.filter(id => id !== jobId);
        } else {
            savedJobs.push(jobId);
        }
        localStorage.setItem('savedJobs', JSON.stringify(savedJobs));
        
        // Update the button icon visually
        const btn = document.querySelector(`.save-btn[data-job-id="${jobId}"]`);
        if (btn) {
            btn.innerHTML = savedJobs.includes(jobId) 
                ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" style="color: var(--text-main);"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>'
                : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>';
        }
        
        // Re-filter if we are currently looking at saved jobs
        if (savedJobsFilter && savedJobsFilter.checked) {
            applyFilters();
        }
    };


    // Collapsible filters
    document.querySelectorAll('.filter-header-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('collapsed');
            const content = btn.nextElementSibling;
            if (content) content.classList.toggle('collapsed');
        });
    });

    // Initial Fetch
    fetchJobs();

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
            if (searchInput) searchInput.value = '';
            if (locationInput) locationInput.value = '';
            
            if (savedJobsFilter) savedJobsFilter.checked = false;
            jobTypeFilters.forEach(cb => cb.checked = false);
            workModelFilters.forEach(cb => cb.checked = false);
            
            if (salarySlider) salarySlider.value = 0;
            if (salaryDisplay) salaryDisplay.textContent = 'Any';
            if (sortSelect) sortSelect.value = 'newest';
            applyFilters();
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

    async function fetchJobs() {
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


    window.removeFilter = (type, value) => {
        if (type === 'saved') {
            if (savedJobsFilter) savedJobsFilter.checked = false;
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
        if (savedJobsFilter) savedJobsFilter.checked = false;
        jobTypeFilters.forEach(cb => cb.checked = false);
        workModelFilters.forEach(cb => cb.checked = false);
        if (salarySlider) {
            salarySlider.value = 0;
            if (salaryDisplay) salaryDisplay.textContent = 'Any';
        }
        applyFilters();
    };

    function applyFilters() {
        const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const locQuery = locationInput ? locationInput.value.toLowerCase().trim() : '';
        const minSalary = salarySlider ? (parseInt(salarySlider.value) || 0) : 0;
        const sortOrder = sortSelect ? sortSelect.value : 'newest';
        
        const showSavedOnly = savedJobsFilter ? savedJobsFilter.checked : false;
        const selectedJobTypes = jobTypeFilters.filter(cb => cb.checked).map(cb => cb.value);
        const selectedWorkModels = workModelFilters.filter(cb => cb.checked).map(cb => cb.value);

        filteredJobs = allJobs.filter(job => {
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

            // Job Type Heuristics (fallback if actual tags aren't perfectly aligned)
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
                addTag(Min , 'salary', '');
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
            jobsContainer.innerHTML = `
                <div class="job-card" style="text-align: center; padding: 4rem 2rem; border-style: dashed; cursor: default;">
                    <h3 style="font-size: 1.1rem; color: var(--text-main); margin-bottom: 0.5rem;">No matches found</h3>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">Try adjusting your search terms or relaxing your filters.</p>
                </div>
            `;
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
            
            // Remove the 6ecb8843 fallback tag as requested
            // let sourceTag = `<span class="tag" style="background: var(--text-main); color: var(--bg-main); border: none;">${job.source_name || job.source_id.split('-')[0]}</span>`;

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
