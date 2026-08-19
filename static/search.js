document.addEventListener('DOMContentLoaded', () => {
    // State
    let allJobs = [];
    let filteredJobs = [];
    let currentPage = 1;
    const itemsPerPage = 15;

    // DOM Elements
    const searchInput = document.getElementById('hero-search-input');
    const locationInput = document.getElementById('location-input');
    const remoteCheckbox = document.getElementById('remote-checkbox');
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

    // Formatting utilities
    const formatCurrency = (num) => {
        if (num === 0) return 'Any';
        if (num >= 1000) return '$' + (num / 1000).toFixed(0) + 'k+';
        return '$' + num;
    };

    // Initial Fetch
    fetchJobs();

    // Event Listeners for Filters
    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (locationInput) locationInput.addEventListener('input', applyFilters);
    if (remoteCheckbox) remoteCheckbox.addEventListener('change', applyFilters);
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
            if (remoteCheckbox) remoteCheckbox.checked = false;
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

    function applyFilters() {
        const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const locQuery = locationInput ? locationInput.value.toLowerCase().trim() : '';
        const isRemoteOnly = remoteCheckbox ? remoteCheckbox.checked : false;
        const minSalary = salarySlider ? (parseInt(salarySlider.value) || 0) : 0;
        const sortOrder = sortSelect ? sortSelect.value : 'newest';

        filteredJobs = allJobs.filter(job => {
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

            let matchesRemote = true;
            if (isRemoteOnly) {
                matchesRemote = job.remote === true;
            }

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

            return matchesQuery && matchesLocation && matchesRemote && matchesSalary;
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
        renderJobs();
    }

    function renderJobs() {
        if (!jobsContainer) return;
        jobsContainer.innerHTML = '';
        
        if (searchStatsText) searchStatsText.textContent = `Showing ${filteredJobs.length} open position${filteredJobs.length !== 1 ? 's' : ''}`;

        if (filteredJobs.length === 0) {
            jobsContainer.innerHTML = `
                <div class="job-card" style="text-align: center; padding: 4rem 2rem; border-style: dashed;">
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

            // Formatting
            let salaryStr = '<div class="job-meta-item"><span style="opacity:0.5">Salary not specified</span></div>';
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
            const remoteStr = job.remote ? `<div class="job-meta-item"> Remote</div>` : '';
            
            const postedDate = job.posted_at ? new Date(job.posted_at).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}) : '';
            const dateStr = postedDate ? `<div class="job-meta-item" style="margin-left: auto;"> ${postedDate}</div>` : '';

            let tagsHtml = '';
            if (job.tags && job.tags.length > 0) {
                tagsHtml = job.tags.slice(0, 4).map(t => `<span class="tag">${t}</span>`).join('');
            }
            
            let sourceTag = `<span class="tag" style="background: var(--text-main); color: var(--bg-main); border: none;">${job.source_name || job.source_id.split('-')[0]}</span>`;

            // Initials for company logo
            const companyName = job.company || 'Unknown';
            const initials = companyName.substring(0, 1).toUpperCase();

            card.innerHTML = `
                <div class="job-header">
                    <div class="job-title-row">
                        <div class="company-logo">${initials}</div>
                        <div>
                            <a href="${job.url}" target="_blank" class="job-title">${job.title}</a>
                            <div class="job-company">${companyName}</div>
                        </div>
                    </div>
                    <div>
                        <a href="${job.url}" target="_blank" class="btn-primary" style="padding: 0.35rem 0.8rem; font-size: 0.85rem; border-radius: 6px;">Apply Now</a>
                    </div>
                </div>
                <div class="job-meta">
                    ${locationStr}
                    ${remoteStr}
                    ${salaryStr}
                    ${dateStr}
                </div>
                <div class="job-tags">
                    ${sourceTag}
                    ${tagsHtml}
                </div>
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
