import os
from bs4 import BeautifulSoup
import re

os.makedirs('app/templates', exist_ok=True)

base_html = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{% block title %}IngestPipe{% endblock %}</title>
    {% block head %}{% endblock %}
</head>
<body class="landing">

    <nav class="l-nav">
        <div class="container" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <a href="/" class="l-nav-brand">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>
                IngestPipe
            </a>
            <div class="l-nav-links">
                <a href="/" {% if active_page == 'home' %}class="active" style="background: rgba(0,0,0,0.05); padding: 0.25rem 0.5rem; border-radius: 4px;"{% endif %}>Home</a>
                <a href="/search" {% if active_page == 'search' %}class="active" style="background: rgba(0,0,0,0.05); padding: 0.25rem 0.5rem; border-radius: 4px;"{% endif %}>Find Jobs</a>
                <a href="/system" {% if active_page == 'system' %}class="active" style="background: rgba(0,0,0,0.05); padding: 0.25rem 0.5rem; border-radius: 4px;"{% endif %}>System</a>
                <a href="/docs" {% if active_page == 'docs' %}class="active" style="background: rgba(0,0,0,0.05); padding: 0.25rem 0.5rem; border-radius: 4px;"{% endif %}>Docs</a>
                <a href="/app" {% if active_page == 'dashboard' %}class="btn-primary" style="background: var(--l-border); color: #fff;"{% else %}class="btn-primary"{% endif %}>Open Dashboard</a>
            </div>
        </div>
    </nav>

    {% block content %}
    {% endblock %}

    {% block footer %}
    <footer class="l-footer container" style="border-top: 1px solid var(--l-border);">
        <div class="l-footer-brand">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>
            IngestPipe
        </div>
        <p class="l-footer-tag">Data Orchestration & Sync</p>
        <div class="l-footer-links">
            <a href="/search">Find Jobs</a> &middot; 
            <a href="/system">System</a> &middot; 
            <a href="/docs">Documentation</a>
        </div>
        <p class="l-footer-copy">&copy; 2026 Ingestion Pipeline Systems</p>
    </footer>
    {% endblock %}
    
    {% block scripts %}{% endblock %}
</body>
</html>
'''

with open('app/templates/base.html', 'w', encoding='utf-8') as f:
    f.write(base_html)

files_to_process = {
    'static/landing.html': ('home', 'landing.html'),
    'static/search.html': ('search', 'search.html'),
    'static/system.html': ('system', 'system.html'),
    'static/docs.html': ('docs', 'docs.html'),
    'static/index.html': ('dashboard', 'dashboard.html')
}

for filepath, (active_page, out_name) in files_to_process.items():
    with open(filepath, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f, 'html.parser')
    
    title = soup.title.string if soup.title else 'IngestPipe'
    
    # Extract head (excluding meta charset/viewport and title)
    head_content = []
    for tag in soup.head.find_all(recursive=False):
        if tag.name not in ['meta', 'title']:
            head_content.append(str(tag))
    
    # Remove nav and footer from body
    nav = soup.find('nav')
    if nav: nav.decompose()
    
    footer = soup.find('footer')
    if footer: footer.decompose()
    
    # Extract scripts at the end of body to put in scripts block
    scripts = soup.body.find_all('script', recursive=False)
    scripts_content = [str(s) for s in scripts]
    for s in scripts:
        s.decompose()
    
    body_content = ''.join([str(tag) for tag in soup.body.contents if str(tag).strip()])
    
    template = f'''{{% extends 'base.html' %}}

{{% block title %}}{title}{{% endblock %}}

{{% block head %}}
{chr(10).join(head_content)}
{{% endblock %}}

{{% block content %}}
{body_content}
{{% endblock %}}
'''

    if scripts_content:
        template += f'''
{{% block scripts %}}
{chr(10).join(scripts_content)}
{{% endblock %}}
'''
    
    # search and dashboard shouldn't have the footer (based on current design)
    if active_page in ['search', 'dashboard']:
        template += '''
{% block footer %}
{% endblock %}
'''

    with open(f'app/templates/{out_name}', 'w', encoding='utf-8') as f:
        f.write(template)
    print(f"Processed {filepath} -> app/templates/{out_name}")
