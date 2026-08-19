document.addEventListener('DOMContentLoaded', () => {
    // State
    let allJobs = [];
    let filteredJobs = [];
    let currentPage = 1;
    const itemsPerPage = 15;

    // DOM Elements
    const searchInput = document.getElementById('search-input');
    const locationInput = document.getElementById('location-input');
    const remoteCheckbox = document.getElementById('remote-checkbox');
    const salaryInput = document.getElementById('salary-input');
    const resetBtn = document.getElementById('reset-filters');
    
    const jobsContainer = document.getElementById('jobs-container');
    const loadingIndicator = document.getElementById('loading-indicator');
    const searchStats = document.getElementById('search-stats');
    
    const paginationControls = document.getElementById('pagination-controls');
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    const pageInfo = document.getElementById('page-info');

    // Initial Fetch
    fetchJobs();

    // Event Listeners for Filters
    searchInput.addEventListener('input', applyFilters);
    locationInput.addEventListener('input', applyFilters);
    remoteCheckbox.addEventListener('change', applyFilters);
    salaryInput.addEventListener('input', applyFilters);
    
    resetBtn.addEventListener('click', () => {
        searchInput.value = '';
        locationInput.value = '';
        remoteCheckbox.checked = false;
        salaryInput.value = '';
        applyFilters();
    });

    // Event Listeners for Pagination
    prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderJobs();
            window.scrollTo(0, 0);
        }
    });

    nextBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredJobs.length / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderJobs();
            window.scrollTo(0, 0);
        }
    });

    async function fetchJobs() {
        try {
            // Using the export endpoint to get all active jobs at once
            const response = await fetch('/api/v1/jobs/export/json');
            if (!response.ok) throw new Error('Failed to fetch jobs');
            
            allJobs = await response.json();
            filteredJobs = [...allJobs];
            
            loadingIndicator.style.display = 'none';
            applyFilters();
        } catch (error) {
            console.error('Error fetching jobs:', error);
            loadingIndicator.innerHTML = '<span style="color: var(--status-error);">Failed to load jobs. Please try again later.</span>';
        }
    }

    function applyFilters() {
        const query = searchInput.value.toLowerCase().trim();
        const locQuery = locationInput.value.toLowerCase().trim();
        const isRemoteOnly = remoteCheckbox.checked;
        const minSalary = parseInt(salaryInput.value) || 0;

        filteredJobs = allJobs.filter(job => {
            // 1. Search Query (Title or Company or Tags)
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
                // If job has a max salary, check if it meets the minimum requirement
                // If no salary data, we might exclude them when filtering by salary
                if (job.salary_max) {
                    matchesSalary = job.salary_max >= minSalary;
                } else if (job.salary_min) {
                     matchesSalary = job.salary_min >= minSalary;
                } else {
                    matchesSalary = false; // Exclude jobs without salary info if user specifically asks for salary
                }
            }

            return matchesQuery && matchesLocation && matchesRemote && matchesSalary;
        });

        // Reset pagination when filters change
        currentPage = 1;
        renderJobs();
    }

    function renderJobs() {
        jobsContainer.innerHTML = '';
        
        searchStats.textContent = `Showing ${filteredJobs.length} job${filteredJobs.length !== 1 ? 's' : ''}`;

        if (filteredJobs.length === 0) {
            jobsContainer.innerHTML = `
                <div class="job-card" style="text-align: center; padding: 3rem;">
                    <h3>No jobs found matching your criteria.</h3>
                    <p style="color: var(--text-muted); margin-top: 0.5rem;">Try adjusting your filters or search terms.</p>
                </div>
            `;
            paginationControls.style.display = 'none';
            return;
        }

        // Pagination calculations
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const jobsToShow = filteredJobs.slice(startIndex, endIndex);
        const totalPages = Math.ceil(filteredJobs.length / itemsPerPage);

        jobsToShow.forEach(job => {
            const card = document.createElement('div');
            card.className = 'job-card';

            // Salary formatting
            let salaryStr = '';
            if (job.salary_min || job.salary_max) {
                const cur = job.salary_currency || '$';
                if (job.salary_min && job.salary_max && job.salary_min !== job.salary_max) {
                    salaryStr = `<div class="job-meta-item">💰 ${cur}${formatK(job.salary_min)} - ${formatK(job.salary_max)}</div>`;
                } else {
                    const val = job.salary_max || job.salary_min;
                    salaryStr = `<div class="job-meta-item">💰 ${cur}${formatK(val)}</div>`;
                }
            }

            // Location formatting
            const locationStr = job.location ? `<div class="job-meta-item">📍 ${job.location}</div>` : '';
            const remoteStr = job.remote ? `<div class="job-meta-item">🏠 Remote</div>` : '';
            
            // Date formatting
            const postedDate = job.posted_at ? new Date(job.posted_at).toLocaleDateString() : '';
            const dateStr = postedDate ? `<div class="job-meta-item">🕒 ${postedDate}</div>` : '';

            // Tags
            let tagsHtml = '';
            if (job.tags && job.tags.length > 0) {
                tagsHtml = `<div class="job-tags">${job.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>`;
            }
            
            // Added explicit source_name if it exists, otherwise fallback to id
            let sourceTag = `<span class="tag" style="background-color: var(--border-subtle);">${job.source_name || job.source_id.split('-')[0]}</span>`;

            card.innerHTML = `
                <div class="job-header">
                    <div>
                        <a href="${job.url}" target="_blank" class="job-title">${job.title}</a>
                        <div class="job-company">${job.company}</div>
                    </div>
                    <div>
                        <a href="${job.url}" target="_blank" class="btn-primary" style="padding: 0.25rem 0.75rem; font-size: 0.8rem;">Apply</a>
                    </div>
                </div>
                <div class="job-meta">
                    ${locationStr}
                    ${remoteStr}
                    ${salaryStr}
                    ${dateStr}
                </div>
                <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                    ${sourceTag}
                    ${tagsHtml}
                </div>
            `;
            jobsContainer.appendChild(card);
        });

        // Update Pagination Controls
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
