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
    const activityLogList = document.getElementById('activity-log-list');
    const jobsTableBody = document.getElementById('jobs-table-body');
    const sourceTemplate = document.getElementById('source-template');
    const refreshBtn = document.getElementById('refresh-sources');
    const remoteToggle = document.getElementById('remote-only');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const pageIndicator = document.getElementById('page-indicator');
    const btnChaosTrigger = document.getElementById('btn-chaos-trigger');
    const btnChaosSpike = document.getElementById('btn-chaos-spike');
        const exportCsvBtn = document.getElementById('btn-export-csv');
    const exportJsonBtn = document.getElementById('btn-export-json');

    
    // Initial fetch
    fetchSources();
    fetchLogs();
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

    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', () => {
            state.skip += state.limit;
            fetchJobs();
        });
    }

    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', () => {
            window.location.href = '/api/v1/jobs/export/csv';
        });
    }

    if (exportJsonBtn) {
        exportJsonBtn.addEventListener('click', () => {
            window.location.href = '/api/v1/jobs/export/json';
        });
    }
    
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
        if (!sourcesList) return;
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

    async function fetchLogs() {
        if (!activityLogList) return;
        try {
            const res = await fetch('/api/v1/sources/logs');
            if (!res.ok) throw new Error('Failed to fetch logs');
            const data = await res.json();
            renderLogs(data);
        } catch (error) {
            console.error('Error fetching logs:', error);
            activityLogList.innerHTML = '<div style="color: #ff0000; padding: 1rem;">Failed to load logs.</div>';
        }
    }

    function renderLogs(logs) {
        if (!activityLogList) return;
        activityLogList.innerHTML = '';
        
        if (logs.length === 0) {
            activityLogList.innerHTML = '<div style="padding: 1rem; color: var(--l-sec);">No activity recorded yet.</div>';
            return;
        }

        logs.forEach(log => {
            const div = document.createElement('div');
            div.style.padding = '0.75rem';
            div.style.borderBottom = '1px solid var(--l-border)';
            
            const time = new Date(log.started_at).toLocaleTimeString();
            let statusColor = log.status === 'success' ? '#008800' : '#ff0000';
            
            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
                    <strong style="color: ${statusColor};">[${log.status.toUpperCase()}]</strong>
                    <span style="color: var(--l-sec);">${time}</span>
                </div>
                <div>
                    Scraped <strong>${log.source_name}</strong> - 
                    ${log.jobs_new} new, ${log.jobs_updated} updated. 
                    <span style="color: var(--l-sec); margin-left: 0.5rem;">(${log.duration_ms}ms)</span>
                </div>
                ${log.error_message ? `<div style="color: #ff0000; margin-top: 0.5rem;">${log.error_message}</div>` : ''}
            `;
            activityLogList.appendChild(div);
        });
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
            jobsTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #ff0000;">Failed to load jobs</td></tr>';
        } finally {
            state.isLoadingJobs = false;
        }
    }

    async function triggerIngestion(sourceName, btn) {
        if (btn.disabled) return;
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Running...';
        btn.style.opacity = '0.7';

        try {
            const res = await fetch(`/api/v1/ingest/${sourceName}`, { method: 'POST' });
            if (!res.ok) throw new Error('Ingestion failed');
            const data = await res.json();
            console.log('Ingestion result:', data);
            
            // Refresh views
            fetchSources();
            fetchLogs();
            fetchJobs();
            
            // Show temporary success state
            btn.textContent = 'Success!';
            btn.style.backgroundColor = '#008800';
            btn.style.color = '#fff';
            setTimeout(() => {
                btn.disabled = false;
                btn.textContent = originalText;
                btn.style.backgroundColor = '';
                btn.style.color = '';
                btn.style.opacity = '1';
            }, 2000);
        } catch (error) {
            console.error('Error:', error);
            btn.textContent = 'Failed';
            btn.style.backgroundColor = '#ff0000';
            btn.style.color = '#fff';
            setTimeout(() => {
                btn.disabled = false;
                btn.textContent = originalText;
                btn.style.backgroundColor = '';
                btn.style.color = '';
                btn.style.opacity = '1';
            }, 2000);
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
                <td><span class="tag">${job.source_name || job.source_id.split('-')[0]}</span></td>
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
