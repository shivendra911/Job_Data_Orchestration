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
    searchInput.addEventListener('input', applyFilters);
    locationInput.addEventListener('input', applyFilters);
    remoteCheckbox.addEventListener('change', applyFilters);
    
    salarySlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        salaryDisplay.textContent = formatCurrency(val);
        applyFilters();
    });
    
    resetBtn.addEventListener('click', (e) => {
        e.preventDefault();
        searchInput.value = '';
        locationInput.value = '';
        remoteCheckbox.checked = false;
        salarySlider.value = 0;
        salaryDisplay.textContent = 'Any';
        applyFilters();
    });

    // Event Listeners for Pagination
    prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderJobs();
            window.scrollTo({ top: document.querySelector('.search-layout').offsetTop - 20, behavior: 'smooth' });
        }
    });

    nextBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredJobs.length / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderJobs();
            window.scrollTo({ top: document.querySelector('.search-layout').offsetTop - 20, behavior: 'smooth' });
        }
    });

    async function fetchJobs() {
        try {
            const response = await fetch('/api/v1/jobs/export/json');
            if (!response.ok) throw new Error('Failed to fetch jobs');
            
            allJobs = await response.json();
            filteredJobs = [...allJobs];
            
            loadingIndicator.style.display = 'none';
            searchStatsContainer.style.display = 'flex';
            applyFilters();
        } catch (error) {
            console.error('Error fetching jobs:', error);
            loadingIndicator.innerHTML = '<div style="color: var(--status-error);">Failed to load jobs. Please try again later.</div>';
        }
    }

    function applyFilters() {
        const query = searchInput.value.toLowerCase().trim();
        const locQuery = locationInput.value.toLowerCase().trim();
        const isRemoteOnly = remoteCheckbox.checked;
        const minSalary = parseInt(salarySlider.value) || 0;

        filteredJobs = allJobs.filter(job => {
            // 1. Search Query
            let matchesQuery = true;
            if (query) {
                const titleMatch = job.title.toLowerCase().includes(query);
                const companyMatch = job.company.toLowerCase().includes(query);
                const tagsMatch = job.tags && job.tags.some(tag => tag.toLowerCase().includes(query));
                matchesQuery = titleMatch || companyMatch || tagsMatch;
            }

            // 2. Location
            let matchesLocation = true;
            if (locQuery) {
                matchesLocation = job.location && job.location.toLowerCase().includes(locQuery);
            }

            // 3. Remote
            let matchesRemote = true;
            if (isRemoteOnly) {
                matchesRemote = job.remote === true;
            }

            // 4. Salary
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

        currentPage = 1;
        renderJobs();
    }

    function renderJobs() {
        jobsContainer.innerHTML = '';
        
        searchStatsText.textContent = `Showing ${filteredJobs.length} open position${filteredJobs.length !== 1 ? 's' : ''}`;

        if (filteredJobs.length === 0) {
            jobsContainer.innerHTML = `
                <div class="job-card" style="text-align: center; padding: 4rem 2rem; border-style: dashed;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted); margin-bottom: 1rem;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <h3 style="font-size: 1.2rem; color: var(--text-main); margin-bottom: 0.5rem;">No matches found</h3>
                    <p style="color: var(--text-muted);">Try adjusting your search terms or relaxing your filters.</p>
                    <button class="btn-secondary" style="margin-top: 1.5rem;" onclick="document.getElementById('reset-filters').click()">Clear all filters</button>
                </div>
            `;
            paginationControls.style.display = 'none';
            return;
        }

        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const jobsToShow = filteredJobs.slice(startIndex, endIndex);
        const totalPages = Math.ceil(filteredJobs.length / itemsPerPage);

        jobsToShow.forEach((job, index) => {
            const card = document.createElement('div');
            card.className = 'job-card';
            // Limit animation delay so the page doesn't take too long to render if they flip pages fast
            card.style.animationDelay = `${Math.min(index * 0.05, 0.4)}s`;

            // Formatting
            let salaryStr = '';
            if (job.salary_min || job.salary_max) {
                const cur = job.salary_currency || '$';
                if (job.salary_min && job.salary_max && job.salary_min !== job.salary_max) {
                    salaryStr = `<div class="job-meta-item"><svg class="job-meta-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg> ${cur}${formatK(job.salary_min)} - ${formatK(job.salary_max)}</div>`;
                } else {
                    const val = job.salary_max || job.salary_min;
                    salaryStr = `<div class="job-meta-item"><svg class="job-meta-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg> ${cur}${formatK(val)}</div>`;
                }
            }

            const locationStr = job.location ? `<div class="job-meta-item"><svg class="job-meta-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> ${job.location}</div>` : '';
            const remoteStr = job.remote ? `<div class="job-meta-item"><svg class="job-meta-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg> Remote</div>` : '';
            
            const postedDate = job.posted_at ? new Date(job.posted_at).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}) : '';
            const dateStr = postedDate ? `<div class="job-meta-item"><svg class="job-meta-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> ${postedDate}</div>` : '';

            let tagsHtml = '';
            if (job.tags && job.tags.length > 0) {
                tagsHtml = job.tags.slice(0, 5).map(t => `<span class="tag">${t}</span>`).join('');
            }
            
            let sourceTag = `<span class="tag tag-source">${job.source_name || job.source_id.split('-')[0]}</span>`;

            card.innerHTML = `
                <div class="job-header">
                    <div>
                        <a href="${job.url}" target="_blank" class="job-title">${job.title}</a>
                        <div class="job-company">${job.company}</div>
                    </div>
                    <div>
                        <a href="${job.url}" target="_blank" class="btn-primary" style="padding: 0.4rem 1rem; font-size: 0.9rem; border-radius: 6px;">Apply Now</a>
                    </div>
                </div>
                <div class="job-meta">
                    ${locationStr}
                    ${remoteStr}
                    ${salaryStr}
                    ${dateStr}
                </div>
                <div class="job-tags" style="margin-top: 0.75rem;">
                    ${sourceTag}
                    ${tagsHtml}
                </div>
            `;
            jobsContainer.appendChild(card);
        });

        if (totalPages > 1) {
            paginationControls.style.display = 'flex';
            pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
            prevBtn.disabled = currentPage === 1;
            nextBtn.disabled = currentPage === totalPages;
        } else {
            paginationControls.style.display = 'none';
        }
    }

    function formatK(num) {
        if (num >= 1000) {
            return (num / 1000).toFixed(0) + 'k';
        }
        return num.toString();
    }
});
