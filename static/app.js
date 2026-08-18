document.addEventListener('DOMContentLoaded', () => {
    // State
    let state = {
        skip: 0,
        limit: 15,
        remoteOnly: false,
        isLoadingSources: false,
        isLoadingJobs: false,
    };

    // DOM Elements
    const sourcesList = document.getElementById('sources-list');
    const jobsTableBody = document.getElementById('jobs-table-body');
    const sourceTemplate = document.getElementById('source-template');
    const refreshBtn = document.getElementById('refresh-sources');
    const remoteToggle = document.getElementById('remote-only');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const pageIndicator = document.getElementById('page-indicator');
    const btnChaosTrigger = document.getElementById('btn-chaos-trigger');
    const btnChaosSpike = document.getElementById('btn-chaos-spike');

    // Init
    fetchSources();
    fetchJobs();

    // Event Listeners
    refreshBtn.addEventListener('click', fetchSources);
    
    remoteToggle.addEventListener('change', (e) => {
        state.remoteOnly = e.target.checked;
        state.skip = 0;
        fetchJobs();
    });

    prevPageBtn.addEventListener('click', () => {
        if (state.skip > 0) {
            state.skip -= state.limit;
            fetchJobs();
        }
    });

    nextPageBtn.addEventListener('click', () => {
        state.skip += state.limit;
        fetchJobs();
    });
    
    if (btnChaosTrigger) {
        btnChaosTrigger.addEventListener('click', (e) => {
            triggerIngestion('sandbox', e.currentTarget);
        });
    }

    if (btnChaosSpike) {
        btnChaosSpike.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            const originalText = btn.innerHTML;
            btn.innerHTML = '<span class="spinner"></span> Spiking...';
            
            try {
                // Fire 5 rapid requests
                const promises = Array(5).fill().map(() => 
                    fetch('/api/v1/ingest/sandbox', { method: 'POST' })
                );
                await Promise.allSettled(promises);
                
                setTimeout(() => {
                    fetchSources();
                    state.skip = 0;
                    fetchJobs();
                }, 1000);
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        });
    }

    // API Calls
    async function fetchSources() {
        if (state.isLoadingSources) return;
        state.isLoadingSources = true;
        
        try {
            const res = await fetch('/api/v1/sources/');
            if (!res.ok) throw new Error('Failed to fetch sources');
            const data = await res.json();
            renderSources(data);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            state.isLoadingSources = false;
        }
    }

    async function fetchJobs() {
        if (state.isLoadingJobs) return;
        state.isLoadingJobs = true;
        
        jobsTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Loading...</td></tr>';
        
        try {
            const url = new URL('/api/v1/jobs', window.location.origin);
            url.searchParams.append('skip', state.skip);
            url.searchParams.append('limit', state.limit);
            if (state.remoteOnly) url.searchParams.append('remote_only', 'true');

            const res = await fetch(url);
            if (!res.ok) throw new Error('Failed to fetch jobs');
            const data = await res.json();
            
            renderJobs(data);
            updatePagination(data.length);
        } catch (error) {
            console.error('Error:', error);
            jobsTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--status-error);">Failed to load jobs</td></tr>';
        } finally {
            state.isLoadingJobs = false;
        }
    }

    async function triggerIngestion(sourceName, buttonEl) {
        buttonEl.disabled = true;
        const originalText = buttonEl.innerHTML;
        buttonEl.innerHTML = '<span class="spinner"></span> Running...';

        try {
            const res = await fetch(`/api/v1/ingest/${sourceName}`, { method: 'POST' });
            if (!res.ok) throw new Error('Ingestion failed');
            
            // Re-fetch to show new data
            setTimeout(() => {
                fetchSources();
                state.skip = 0;
                fetchJobs();
            }, 500);
            
        } catch (error) {
            alert(`Failed to trigger ingestion for ${sourceName}`);
        } finally {
            buttonEl.disabled = false;
            buttonEl.innerHTML = originalText;
        }
    }

    // Render Functions
    function renderSources(sources) {
        sourcesList.innerHTML = '';
        
        sources.forEach(source => {
            const clone = sourceTemplate.content.cloneNode(true);
            
            clone.querySelector('.source-name').textContent = source.name;
            clone.querySelector('.adapter-type').textContent = source.adapter_type;
            
            const statusEl = clone.querySelector('.status-badge');
            statusEl.textContent = source.status;
            
            if (source.status === 'healthy') {
                statusEl.classList.add('status-healthy');
            } else if (source.status === 'circuit_open' || source.status === 'error') {
                statusEl.classList.add('status-error');
            } else {
                statusEl.classList.add('status-degraded');
            }

            if (source.last_success_at) {
                const date = new Date(source.last_success_at);
                clone.querySelector('.last-run').textContent = `Last run: ${date.toLocaleTimeString()}`;
            } else {
                clone.querySelector('.last-run').textContent = 'Never run';
            }

            const triggerBtn = clone.querySelector('.btn-trigger');
            triggerBtn.addEventListener('click', (e) => triggerIngestion(source.name, e.currentTarget));

            sourcesList.appendChild(clone);
        });
    }

    function renderJobs(jobs) {
        jobsTableBody.innerHTML = '';
        
        if (jobs.length === 0) {
            jobsTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No jobs found</td></tr>';
            return;
        }

        jobs.forEach(job => {
            const tr = document.createElement('tr');
            
            // Format Salary
            let salaryStr = 'N/A';
            if (job.salary_min && job.salary_max) {
                const cur = job.salary_currency || '$';
                if (job.salary_min === job.salary_max) {
                    salaryStr = `${cur}${formatK(job.salary_min)}`;
                } else {
                    salaryStr = `${cur}${formatK(job.salary_min)} - ${formatK(job.salary_max)}`;
                }
            }

            // Date
            const posted = job.posted_at ? new Date(job.posted_at).toLocaleDateString() : 'Unknown';

            tr.innerHTML = `
                <td>
                    <a href="${job.url}" target="_blank" class="job-title">${job.title}</a>
                    ${job.remote ? '<span class="tag" style="margin-left: 8px;">Remote</span>' : ''}
                </td>
                <td>${job.company}</td>
                <td><span class="tag">${job.source_id.split('-')[0]}</span></td>
                <td>${salaryStr}</td>
                <td>${posted}</td>
            `;
            jobsTableBody.appendChild(tr);
        });
    }

    function updatePagination(itemsReturned) {
        prevPageBtn.disabled = state.skip === 0;
        // If we got exactly the limit, there might be a next page
        nextPageBtn.disabled = itemsReturned < state.limit;
        
        const currentPage = Math.floor(state.skip / state.limit) + 1;
        pageIndicator.textContent = `Page ${currentPage}`;
    }

    function formatK(num) {
        if (num >= 1000) {
            return (num / 1000).toFixed(0) + 'k';
        }
        return num.toString();
    }
});
